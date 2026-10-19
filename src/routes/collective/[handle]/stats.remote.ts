import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { cached, type Cached } from '#lib/server/cache.js';
import { OpenCollectiveError, publicGraphql, toHttpError } from '#lib/server/opencollective.js';
import { getToken } from '#lib/server/session.js';
import {
	backerHistory,
	lastMonthKeys,
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

/** An Open Collective account slug, like "svelte". */
const Slug = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.regex(/^[a-z0-9][a-z0-9-]*$/, 'Not an Open Collective slug'),
	v.maxLength(100)
);

const MAX_CACHED = 50;

/**
 * One cached loader per key, like a collective's slug or a search term. Capped, oldest dropped
 * first, so looking up many collectives cannot grow the server's memory without end.
 */
function perKey<T>(make: (key: string) => Cached<T>) {
	const loaders = new Map<string, Cached<T>>();
	const loader = (key: string) => {
		let load = loaders.get(key);
		if (!load) {
			if (loaders.size >= MAX_CACHED) loaders.delete(loaders.keys().next().value!);
			load = make(key);
			loaders.set(key, load);
		}
		return load;
	};
	return Object.assign((key: string) => loader(key)(), {
		peek: (key: string) => loader(key).peek()
	});
}

/**
 * Open Collective rate-limits public requests, so each result is reused for an hour. Results are
 * shared by every visitor, so they are never fetched with a visitor's own token, which could see
 * what only that visitor is allowed to.
 */
const CACHE_MS = 60 * 60 * 1000;

const PAGE_SIZE = 1000;

/**
 * Like `toHttpError`, but without the suggestion to connect when this browser already has: these
 * requests never use a visitor's token, so connecting again would not help.
 */
function toPublicHttpError(err: unknown): never {
	if (err instanceof OpenCollectiveError && getToken()) err.connect = undefined;
	toHttpError(err);
}

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
const loadStats = perKey((slug) =>
	cached({
		key: `stats:v3:${slug}`,
		maxAgeMs: CACHE_MS,
		load: async () => {
			const from = '2016-01-01T00:00:00Z';
			let result: StatsResult;
			let payouts: PayoutNode[];
			try {
				result = await publicGraphql<StatsResult>({
					query: STATS_QUERY,
					variables: { slug, from, limit: PAGE_SIZE }
				});
				payouts = [
					...result.payouts.nodes,
					...(await remainingPages({
						total: result.payouts.totalCount,
						fetchPage: async (offset) => {
							const page = await publicGraphql<{ transactions: { nodes: PayoutNode[] } }>({
								query: PAYOUTS_QUERY,
								variables: { slug, from, limit: PAGE_SIZE, offset }
							});
							return page.transactions.nodes;
						}
					}))
				];
			} catch (err) {
				toPublicHttpError(err);
			}
			const account = result.account;
			if (!account) error(404, `There is no collective called "${slug}" on Open Collective.`);

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
	})
);

export const getCollectiveStats = query(Slug, (slug) => loadStats(slug));

const CONTRIBUTIONS_QUERY = /* GraphQL */ `
	query Contributions($slug: String!, $limit: Int!, $offset: Int!) {
		transactions(
			account: [{ slug: $slug }]
			type: CREDIT
			kind: [CONTRIBUTION, ADDED_FUNDS, BALANCE_TRANSFER]
			limit: $limit
			offset: $offset
		) {
			totalCount
			nodes {
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

/**
 * Every contribution the collective has received. Cached as fetched, under a key that only
 * changes if the query does, so changing how backers are ranked never costs a refetch.
 */
const loadContributions = perKey((slug) =>
	cached({
		key: `contributions:v3:${slug}`,
		maxAgeMs: CACHE_MS,
		load: async (): Promise<ContributionNode[]> => {
			const page = (offset: number) =>
				publicGraphql<ContributionsResult>({
					query: CONTRIBUTIONS_QUERY,
					variables: { slug, limit: PAGE_SIZE, offset }
				});

			try {
				const first = await page(0);
				return [
					...first.transactions.nodes,
					...(await remainingPages({
						total: first.transactions.totalCount,
						fetchPage: async (offset) => (await page(offset)).transactions.nodes
					}))
				];
			} catch (err) {
				toPublicHttpError(err);
			}
		}
	})
);

/**
 * Where the collective's money comes from: recurring and one-off contributions per month,
 * and the biggest backers over the last 12 months, 2 years and all time.
 */
function incomeSources(nodes: ContributionNode[]) {
	const now = new Date();
	const { months, backers } = toContributions(nodes);
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
		backers: {
			'1y': top(lastMonthKeys(now, 12)),
			'2y': top(lastMonthKeys(now, 24)),
			all: top()
		}
	};
}

export const getIncomeSources = query(Slug, async (slug) =>
	incomeSources(await loadContributions(slug))
);

/**
 * The same, but only if the server already has the contributions, which takes no time. The page
 * waits for this, so a reload arrives complete and the browser can put you back where you were.
 * Fetching them can take many seconds, so when they are not ready the page asks afterwards.
 */
export const getCachedIncomeSources = query(Slug, async (slug) => {
	const nodes = await loadContributions.peek(slug);
	return nodes ? incomeSources(nodes) : null;
});

export type CollectiveStats = Awaited<ReturnType<typeof getCollectiveStats>>;

export type IncomeSources = ReturnType<typeof incomeSources>;

const SEARCH_QUERY = /* GraphQL */ `
	query SearchCollectives($term: String!, $slug: String) {
		exact: account(slug: $slug, throwIfMissing: false) {
			slug
			name
			type
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
	exact: (CollectiveMatch & { type: string }) | null;
	accounts: { nodes: (CollectiveMatch & { type: string })[] };
}

const FUNDED_TYPES = new Set(['COLLECTIVE', 'PROJECT', 'FUND']);
const SEARCH_CACHE_MS = 24 * 60 * 60 * 1000;
const searches = perKey((term) =>
	cached({
		key: `search:v2:${term}`,
		maxAgeMs: SEARCH_CACHE_MS,
		load: async (): Promise<CollectiveMatch[]> => {
			let result: SearchResult;
			try {
				result = await publicGraphql<SearchResult>({
					query: SEARCH_QUERY,
					// The search is fuzzy; looking the term up as a slug too puts an exact match first.
					variables: { term, slug: /^[a-z0-9-]+$/.test(term) ? term : null }
				});
			} catch (err) {
				toPublicHttpError(err);
			}
			const matches = [
				...(result.exact && FUNDED_TYPES.has(result.exact.type) ? [result.exact] : []),
				...result.accounts.nodes
			];
			const seen = new Set<string>();
			return matches
				.filter((match) => !seen.has(match.slug) && seen.add(match.slug))
				.map(({ slug, name, imageUrl }) => ({ slug, name, imageUrl }));
		}
	})
);

/** Collectives whose name or slug matches what you typed. */
export const searchCollectives = query(
	v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(2), v.maxLength(60)),
	(term) => searches(term)
);
