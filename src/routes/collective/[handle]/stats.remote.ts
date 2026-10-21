import { query } from '$app/server';
import { error, isHttpError } from '@sveltejs/kit';
import * as v from 'valibot';
import { cached, kvStore, type Cached } from '#lib/server/cache.js';
import { graphql, publicGraphql, toHttpError } from '#lib/server/opencollective.js';
import { getToken } from '#lib/server/session.js';
import {
	backerHistory,
	lastMonthKeys,
	recurringChanges,
	oneOffSummary,
	toContributions,
	toMonths,
	othersBySize,
	topAccounts,
	toPayouts,
	type ContributionNode,
	type PayoutNode,
	type TimeSeriesNode,
	type Unpaid
} from './financials';

/**
 * The collective in the address, like "svelte". Any text is let through and checked with `slug`, so
 * an address no collective could have shows that it does not exist rather than "Bad Request".
 */
const Slug = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.maxLength(100));

/** `handle` if it can be an Open Collective slug, else a not-found page that names it. */
function slug(handle: string): string {
	return /^[a-z0-9][a-z0-9-]*$/.test(handle) ? handle : missing(handle);
}

const MAX_CACHED = 50;

/** Sends a query to Open Collective, either the shared way or with a visitor's own token. */
type Ask = <R>(request: { query: string; variables?: Record<string, unknown> }) => Promise<R>;

const askPublicly: Ask = <R>(request: Parameters<Ask>[0]) => publicGraphql<R>(request);

/**
 * One cached loader per key, like a collective's slug or a search term. Capped, oldest dropped
 * first, so looking up many collectives cannot grow the server's memory without end.
 *
 * Results are shared by every visitor, so they are never fetched with a visitor's own token, which
 * could see what only that visitor is allowed to. When the shared way is rate-limited, a connected
 * visitor's token, which has its own limit, fetches the result for them alone, without caching it.
 */
function perKey<T>({
	cacheKey,
	maxAgeMs,
	store,
	load
}: {
	cacheKey: (key: string) => string;
	maxAgeMs: number;
	store?: 'kv' | 'edge';
	/** Given the stored result when refreshing it, to fetch only what changed. */
	load: (key: string, ask: Ask, previous?: T) => Promise<T>;
}) {
	const loaders = new Map<string, Cached<T>>();
	const loader = (key: string) => {
		let cachedLoad = loaders.get(key);
		if (!cachedLoad) {
			if (loaders.size >= MAX_CACHED) loaders.delete(loaders.keys().next().value!);
			cachedLoad = cached({
				key: cacheKey(key),
				maxAgeMs,
				store,
				load: (previous) => load(key, askPublicly, previous)
			});
			loaders.set(key, cachedLoad);
		}
		return cachedLoad;
	};
	return Object.assign(
		async (key: string) => {
			try {
				return await loader(key)();
			} catch (err) {
				const token = getToken();
				if (!token || !isHttpError(err, 429)) throw err;
				try {
					return await load(key, <R>(request: Parameters<Ask>[0]) =>
						graphql<R>({ ...request, token })
					);
				} catch (own) {
					// Your token lacks the scope for this, so there is no point suggesting you connect.
					if (isHttpError(own, 403)) error(429, { ...err.body, connect: undefined });
					throw own;
				}
			}
		},
		{ peek: (key: string) => loader(key).peek() }
	);
}

/** Open Collective rate-limits public requests, so each result is refreshed at most hourly. */
const CACHE_MS = 60 * 60 * 1000;

const PAGE_SIZE = 1000;

/** Every page after the first, a few at a time to stay under Open Collective's rate limit. */
async function remainingPages<T>({
	total,
	fetchPage
}: {
	total: number;
	fetchPage: (offset: number) => Promise<T[]>;
}): Promise<T[]> {
	const offsets: number[] = [];
	for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) offsets.push(offset);
	const pages: T[][] = [];
	for (let i = 0; i < offsets.length; i += 3) {
		pages.push(...(await Promise.all(offsets.slice(i, i + 3).map(fetchPage))));
	}
	return pages.flat();
}

const PAYOUT_NODES = /* GraphQL */ `
	nodes {
		createdAt
		netAmount {
			value
		}
		oppositeAccount {
			slug
			name
		}
		expense {
			type
			accountingCategory {
				name
			}
		}
	}
`;

const PAYOUTS_QUERY = /* GraphQL */ `
	query Payouts($slug: String!, $from: DateTime!, $limit: Int!, $offset: Int!) {
		transactions(
			account: [{ slug: $slug }]
			type: DEBIT
			kind: [EXPENSE]
			dateFrom: $from
			limit: $limit
			offset: $offset
		) {
			${PAYOUT_NODES}
		}
	}
`;

// `net: true` takes fees out of what was received and adds payment processor fees to what was
// spent, so each month's balance change is exactly income minus expenses.
/** Stops with a not-found page that names the collective asked for. */
function missing(slug: string): never {
	error(404, `There is no collective called "${slug}" on Open Collective.`);
}

const STATS_QUERY = /* GraphQL */ `
	query CollectiveStats($slug: String!, $from: DateTime!, $limit: Int!) {
		account(slug: $slug) {
			name
			imageUrl(height: 128)
			currency
			stats {
				balance: balanceTimeSeries(timeUnit: MONTH, dateFrom: $from) {
					nodes {
						date
						amount {
							value
						}
					}
				}
				received: totalAmountReceivedTimeSeries(timeUnit: MONTH, dateFrom: $from, net: true) {
					nodes {
						date
						amount {
							value
						}
					}
				}
				spent: totalAmountSpentTimeSeries(timeUnit: MONTH, dateFrom: $from, net: true) {
					nodes {
						date
						amount {
							value
						}
					}
				}
			}
		}
		payouts: transactions(
			account: [{ slug: $slug }]
			type: DEBIT
			kind: [EXPENSE]
			dateFrom: $from
			limit: $limit
		) {
			totalCount
			${PAYOUT_NODES}
		}
		unpaid: expenses(
			account: { slug: $slug }
			status: [PENDING, APPROVED, SCHEDULED_FOR_PAYMENT, PROCESSING]
			limit: 1000
		) {
			nodes {
				status
				amount: amountV2(currencySource: ACCOUNT) {
					value
				}
				payee {
					slug
				}
			}
		}
	}
`;

interface StatsResult {
	account: {
		name: string;
		imageUrl: string | null;
		currency: string;
		stats: {
			balance: { nodes: TimeSeriesNode[] };
			received: { nodes: TimeSeriesNode[] };
			spent: { nodes: TimeSeriesNode[] };
		};
	} | null;
	payouts: { totalCount: number; nodes: PayoutNode[] };
	unpaid: { nodes: { status: string; amount: { value: number }; payee: { slug: string } }[] };
}

/** Monthly balance, income and spending for the collective, from Open Collective's public stats. */
const loadStats = perKey({
	cacheKey: (slug) => `stats:v3:${slug}`,
	maxAgeMs: CACHE_MS,
	load: async (slug, ask) => {
		const from = '2016-01-01T00:00:00Z';
		let result: StatsResult;
		let payouts: PayoutNode[];
		try {
			result = await ask<StatsResult>({
				query: STATS_QUERY,
				variables: { slug, from, limit: PAGE_SIZE }
			});
			payouts = [
				...result.payouts.nodes,
				...(await remainingPages({
					total: result.payouts.totalCount,
					fetchPage: async (offset) => {
						const page = await ask<{ transactions: { nodes: PayoutNode[] } }>({
							query: PAYOUTS_QUERY,
							variables: { slug, from, limit: PAGE_SIZE, offset }
						});
						return page.transactions.nodes;
					}
				}))
			];
		} catch (err) {
			// Open Collective reports a missing account as a failure of the fields that ask about it.
			if (err instanceof Error && /not found/i.test(err.message)) missing(slug);
			toHttpError(err);
		}
		const account = result.account;
		if (!account) missing(slug);

		const now = new Date();
		return {
			slug,
			name: account.name,
			imageUrl: account.imageUrl,
			currency: account.currency,
			fetchedAt: now.toISOString(),
			months: toMonths({
				balance: account.stats.balance.nodes,
				received: account.stats.received.nodes,
				spent: account.stats.spent.nodes,
				now
			}),
			payouts: toPayouts(payouts),
			unpaid: result.unpaid.nodes.map((expense): Unpaid => ({
				slug: expense.payee.slug,
				amount: expense.amount.value,
				approved: expense.status !== 'PENDING'
			}))
		};
	}
});

export const getCollectiveStats = query(Slug, (handle) => loadStats(slug(handle)));

const CONTRIBUTIONS_QUERY = /* GraphQL */ `
	query Contributions($slug: String!, $from: DateTime, $limit: Int!, $offset: Int!) {
		transactions(
			account: [{ slug: $slug }]
			type: CREDIT
			kind: [CONTRIBUTION, ADDED_FUNDS, BALANCE_TRANSFER]
			dateFrom: $from
			orderBy: { field: CREATED_AT, direction: DESC }
			limit: $limit
			offset: $offset
		) {
			totalCount
			nodes {
				id
				createdAt
				netAmount {
					value
				}
				fromAccount {
					slug
					name
				}
				order {
					frequency
				}
				kind
			}
		}
	}
`;

interface ContributionsResult {
	transactions: { totalCount: number; nodes: ContributionNode[] };
}

const TOP_BACKERS = 7;

/** Accounts that collect from many people and pay it on as one, like GitHub Sponsors. */
const CHANNELS = new Set(['github-sponsors']);

/** Contributions recorded late, such as added funds, are caught by refetching the last week. */
const OVERLAP_MS = 7 * 24 * 60 * 60 * 1000;

/** How far a first fetch got, so one cut short by a rate limit carries on where it stopped. */
interface Progress {
	nodes: ContributionNode[];
	nextOffset: number;
	total: number;
}

/** `nodes` with `more` added, one of each contribution, newest first. */
function mergeContributions(nodes: ContributionNode[], more: ContributionNode[]) {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	for (const node of more) byId.set(node.id, node);
	return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Every contribution since `from`, newest first, a few pages at a time. Each batch is passed to
 * `saved` as it arrives. New contributions only push older ones to later pages, so a page fetched
 * again repeats some, which are dropped, but never skips any.
 */
async function fetchContributions({
	slug,
	ask,
	from,
	start,
	saved
}: {
	slug: string;
	ask: Ask;
	from?: string;
	start?: Progress;
	saved?: (progress: Progress) => Promise<void>;
}): Promise<ContributionNode[]> {
	let { nodes, nextOffset, total } = start ?? { nodes: [], nextOffset: 0, total: Infinity };
	while (nextOffset < total) {
		const offsets = [nextOffset];
		// The first page says how many there are; until then, ask for no more than it.
		while (offsets.length < 3 && total !== Infinity && offsets.at(-1)! + PAGE_SIZE < total) {
			offsets.push(offsets.at(-1)! + PAGE_SIZE);
		}
		const pages = await Promise.all(
			offsets.map((offset) =>
				ask<ContributionsResult>({
					query: CONTRIBUTIONS_QUERY,
					variables: { slug, from, limit: PAGE_SIZE, offset }
				})
			)
		);
		total = pages[0].transactions.totalCount;
		nodes = mergeContributions(
			nodes,
			pages.flatMap((page) => page.transactions.nodes)
		);
		nextOffset = offsets.at(-1)! + PAGE_SIZE;
		await saved?.({ nodes, nextOffset, total });
	}
	return nodes;
}

/**
 * Every contribution the collective has received. Kept for good under a key that only changes if
 * the query does, so changing how backers are ranked never costs a refetch. Once stored, a refresh
 * asks only for the contributions since the newest one, which is a single request.
 */
const loadContributions = perKey({
	cacheKey: (slug) => `contributions:v4:${slug}`,
	maxAgeMs: CACHE_MS,
	load: async (slug, ask, previous): Promise<ContributionNode[]> => {
		try {
			if (previous) {
				const newest = previous[0]?.createdAt;
				const from = newest && new Date(Date.parse(newest) - OVERLAP_MS).toISOString();
				return mergeContributions(previous, await fetchContributions({ slug, ask, from }));
			}
			// Only what was fetched the shared way is saved, as a visitor's token may see more.
			if (ask !== askPublicly) return await fetchContributions({ slug, ask });
			const progress = kvStore<Progress>(`contributions-progress:v4:${slug}`);
			return await fetchContributions({
				slug,
				ask,
				start: (await progress.read())?.value,
				saved: (value) => progress.write({ at: Date.now(), value })
			});
		} catch (err) {
			toHttpError(err);
		}
	}
});

/**
 * Where the collective's money comes from: recurring and one-off contributions per month, the
 * one-offs of the last year and the year before, and the biggest backers over the last year, 2 years and all time.
 */
function incomeSources(nodes: ContributionNode[]) {
	const now = new Date();
	const { months, backers } = toContributions(nodes, CHANNELS);
	const history = backerHistory(nodes);
	// Payment platforms pass on money from many people, so they are shown apart from the
	// people and companies that back the collective directly.
	const people = backers.filter((row) => !CHANNELS.has(row.slug));
	const channels = backers.filter((row) => CHANNELS.has(row.slug));
	const describe =
		(months: string[] | undefined, channel: boolean) =>
		(backer: { slug: string; name: string; amount: number }) => ({
			...backer,
			channel,
			history: (backer.slug && history.get(backer.slug)) || null,
			// Only the "others" row: a few totals, not every backer.
			tiers: backer.slug ? null : othersBySize({ rows: people, months, limit: TOP_BACKERS })
		});
	const top = (months?: string[]) => {
		const ranked = topAccounts({ rows: people, months, limit: TOP_BACKERS }).map(
			describe(months, false)
		);
		const others = ranked.at(-1)?.slug ? [] : ranked.splice(-1);
		const via = topAccounts({ rows: channels, months, limit: Infinity })
			.filter((channel) => channel.amount > 0)
			.map(describe(months, true));
		// The groups after the ranked backers go biggest first too, so a platform that passes on
		// less than everyone else together sits below them.
		return [...ranked, ...[...via, ...others].sort((a, b) => b.amount - a.amount)];
	};
	return {
		months,
		oneOffs: oneOffSummary({ nodes, months: lastMonthKeys(now, 12), channels: CHANNELS }),
		oneOffsBefore: oneOffSummary({
			nodes,
			months: lastMonthKeys(now, 24).slice(0, 12),
			channels: CHANNELS
		}),
		recurring: recurringChanges({ nodes, now, skip: CHANNELS }),
		backers: {
			'1y': top(lastMonthKeys(now, 12)),
			'2y': top(lastMonthKeys(now, 24)),
			all: top()
		}
	};
}

export const getIncomeSources = query(Slug, async (handle) =>
	incomeSources(await loadContributions(slug(handle)))
);

/**
 * The same, but only if the server already has the contributions, which takes no time. The page
 * waits for this, so a reload arrives complete and the browser can put you back where you were.
 * Fetching them can take many seconds, so when they are not ready the page asks afterwards.
 */
export const getCachedIncomeSources = query(Slug, async (handle) => {
	const nodes = await loadContributions.peek(slug(handle));
	return nodes ? incomeSources(nodes) : null;
});

export type CollectiveStats = Awaited<ReturnType<typeof getCollectiveStats>>;

export type IncomeSources = ReturnType<typeof incomeSources>;

const SEARCH_QUERY = /* GraphQL */ `
	query SearchCollectives($term: String!, $slug: String = "", $bySlug: Boolean!) {
		exact: account(slug: $slug, throwIfMissing: false) @include(if: $bySlug) {
			slug
			name
			type
			isHost
			imageUrl(height: 64)
		}
		accounts(searchTerm: $term, type: [COLLECTIVE, PROJECT, FUND], limit: 8) {
			nodes {
				slug
				name
				type
				imageUrl(height: 64)
			}
		}
	}
`;

export interface CollectiveMatch {
	slug: string;
	name: string;
	imageUrl: string | null;
}

interface SearchResult {
	exact?: (CollectiveMatch & { type: string; isHost: boolean }) | null;
	accounts: { nodes: (CollectiveMatch & { type: string })[] };
}

const FUNDED_TYPES = new Set(['COLLECTIVE', 'PROJECT', 'FUND']);

/**
 * Whether an account looked up by its exact slug has money of its own to show. Some projects, like
 * Node.js, are organizations that hold their own funds rather than collectives, so the fuzzy search
 * leaves them out; they still come up when you type their slug.
 */
function isFunded(account: { type: string; isHost: boolean }): boolean {
	return FUNDED_TYPES.has(account.type) || (account.type === 'ORGANIZATION' && account.isHost);
}

/** The slug a term would be, like "nodejs" for "Node.js", or null if it cannot be one. */
function slugFor(term: string): string | null {
	const slug = term.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
	return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? slug : null;
}
const SEARCH_CACHE_MS = 24 * 60 * 60 * 1000;
const searches = perKey({
	cacheKey: (term) => `search:v3:${term}`,
	maxAgeMs: SEARCH_CACHE_MS,
	// One per term typed is too many writes for KV, and a search is one request to redo.
	store: 'edge',
	load: async (term, ask): Promise<CollectiveMatch[]> => {
		let result: SearchResult;
		// The search is fuzzy; looking the term up as a slug too puts an exact match first. Open
		// Collective errors on a lookup with no slug, so it is left out when the term cannot be one.
		const slug = slugFor(term);
		try {
			result = await ask<SearchResult>({
				query: SEARCH_QUERY,
				variables: slug ? { term, slug, bySlug: true } : { term, bySlug: false }
			});
		} catch (err) {
			toHttpError(err);
		}
		const matches = [
			...(result.exact && isFunded(result.exact) ? [result.exact] : []),
			...result.accounts.nodes
		];
		const seen = new Set<string>();
		return matches
			.filter((match) => !seen.has(match.slug) && seen.add(match.slug))
			.map(({ slug, name, imageUrl }) => ({ slug, name, imageUrl }));
	}
});

/** Collectives whose name or slug matches what you typed. */
export const searchCollectives = query(
	v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(2), v.maxLength(60)),
	(term) => searches(term)
);
