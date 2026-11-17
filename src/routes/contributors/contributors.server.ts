import { dev } from '$app/env';
import { cached, kvStore } from '#lib/server/cache.js';
import { findOwnFunds } from '#lib/grants.js';
import { OpenCollectiveError, publicGraphql, toHttpError } from '#lib/server/opencollective.js';
import {
	BATCH_SIZE,
	contributorsQuery,
	contributorsWindow,
	EXPENSES_QUERY,
	giftsPaid,
	GIVEN_QUERY,
	HOSTS,
	MIN_CONTRIBUTION,
	PAID_QUERY,
	SCAN_PAGE,
	SCAN_QUERY,
	spreadOf,
	tallyGiven,
	toContributors,
	topGivers,
	toGrantNodes,
	withGifts,
	type Contributor,
	type ContributorNode,
	type ExpenseNode,
	type GivenNode,
	type PaidNode,
	type ScanNode
} from './contributors';

export interface ContributorsResult {
	contributors: Contributor[];
	/** When Open Collective was asked, as a timestamp. */
	fetchedAt: number;
}

/** How many times one request of the scan is asked again after Open Collective fails it. */
const RETRIES = 2;

/**
 * How many requests one run of the scan may make. Cloudflare stops a Worker on the Free plan at 50
 * requests to other sites per run, and a scan makes about 66, so it is spread over several runs. In
 * development there is no limit, and the first visit scans in one go.
 */
const REQUESTS_PER_RUN = dev ? Infinity : 50;

/**
 * The most one step of the scan asks, as it is begun only with this many requests left: a host's
 * year of transactions takes three pages, a contributor up to six, and each may be asked again.
 */
const STEP_REQUESTS = 10;

/** How long a scan under way is resumed. Later, its window has moved on, and it starts over. */
const PROGRESS_KEPT_MS = 24 * 60 * 60 * 1000;

/** Thrown when a run has used its requests before the scan is done. The next run carries on. */
export class ScanPaused extends Error {
	constructor() {
		super('The leaderboard scan is under way and continues on the next run.');
	}
}

/** A scan under way, kept between runs. Each step is added only once it is done. */
export interface ScanProgress {
	/** When the scan began, which every run of it scans up to. */
	startedAt: number;
	/** The host scans done, as `host:since:query`. */
	scanned: string[];
	/** What each account gave in the host scans done, by slug. */
	given: [string, number][];
	/** The details of those who gave the most, once asked for. */
	nodes?: (ContributorNode | null)[];
	/** Those ranked so far. */
	contributors: Contributor[];
	/** How many of the contributors from `nodes` are done, including those left out. */
	done: number;
}

/** A scan with nothing done yet, scanning up to `startedAt`. */
export const newScan = (startedAt: number): ScanProgress => ({
	startedAt,
	scanned: [],
	given: [],
	contributors: [],
	done: 0
});

/** Counts the requests a run makes, to stop before Cloudflare stops it at `limit`. */
interface Budget {
	used: number;
	limit: number;
}

/**
 * Asks Open Collective, again if it fails on its side. A page of a host's transactions can take
 * most of the 30 seconds it allows a request, and now and then one runs over and comes back a 503,
 * which would otherwise throw away the minute or more of scanning before it. Each attempt counts
 * towards `budget`.
 */
function asker(budget: Budget) {
	return async function ask<T>(request: {
		query: string;
		variables: Record<string, unknown>;
	}): Promise<T> {
		for (let attempt = 0; ; attempt++) {
			budget.used++;
			try {
				return await publicGraphql<T>(request);
			} catch (err) {
				const failed = err instanceof OpenCollectiveError && err.status >= 500;
				console.log(
					request.query.match(/query (\w+)/)?.[1],
					JSON.stringify(request.variables),
					attempt,
					err instanceof Error ? err.message : err
				);
				if (!failed || attempt >= RETRIES) throw err;
			}
		}
	};
}

type Ask = ReturnType<typeof asker>;

/**
 * Every transaction of `MIN_CONTRIBUTION` or more through `host` from `since` to `until` that
 * `query` lists: `SCAN_QUERY` for contributions, `PAID_QUERY` for expenses paid.
 */
async function scanHost<T>({
	ask,
	host,
	since,
	until,
	query
}: {
	ask: Ask;
	host: string;
	since: string;
	until: string;
	query: string;
}): Promise<T[]> {
	const nodes: T[] = [];
	for (let offset = 0; ; offset += SCAN_PAGE) {
		const { transactions } = await ask<{
			transactions: { totalCount: number; nodes: T[] };
		}>({
			query,
			variables: {
				host: { slug: host },
				since,
				until,
				offset,
				min: MIN_CONTRIBUTION * 100,
				limit: SCAN_PAGE
			}
		});
		nodes.push(...transactions.nodes);
		if (offset + SCAN_PAGE >= transactions.totalCount) return nodes;
	}
}

/**
 * Every transaction of `slug` that `query` lists: `EXPENSES_QUERY` for the expenses it paid, which
 * most contributors, being companies, have none of, and `GIVEN_QUERY` for its contributions.
 */
async function scanAccount<T>(ask: Ask, slug: string, query: string): Promise<T[]> {
	const nodes: T[] = [];
	for (let offset = 0; ; offset += SCAN_PAGE) {
		const { transactions } = await ask<{
			transactions: { totalCount: number; nodes: T[] };
		}>({ query, variables: { slug, offset, limit: SCAN_PAGE } });
		nodes.push(...transactions.nodes);
		if (offset + SCAN_PAGE >= transactions.totalCount) return nodes;
	}
}

/** Ranks one contributor, or gives `undefined` when it gave nothing once its gifts are counted. */
async function rank(
	ask: Ask,
	contributor: Contributor,
	now: Date
): Promise<Contributor | undefined> {
	const { slug } = contributor;
	const expenses = await scanAccount<ExpenseNode>(ask, slug, EXPENSES_QUERY);
	const given = await scanAccount<GivenNode>(ask, slug, GIVEN_QUERY);
	// What it moved into its own funds is theirs to be ranked for, when they give it.
	const funds = await findOwnFunds({
		nodes: toGrantNodes(given),
		ask,
		family: { slugs: new Set([slug]), admins: new Set() }
	});
	const withGiven = withGifts({ contributor, expenses, given, funds, now });
	if (withGiven.total <= 0) return undefined;
	return { ...withGiven, spread: spreadOf({ slug, given, expenses, funds, now }) };
}

/**
 * Carries `progress` on as far as `budget` allows, one step at a time: each host's year of
 * contributions and of expenses paid, then the details of those who gave the most, then each of
 * them in turn. Throws `ScanPaused` when the requests run out first.
 */
export async function advance(progress: ScanProgress, budget: Budget): Promise<void> {
	const ask = asker(budget);
	const step = () => {
		if (budget.used + STEP_REQUESTS > budget.limit) throw new ScanPaused();
	};
	const now = new Date(progress.startedAt);
	const variables = contributorsWindow(now);
	// One host and one year at a time. The further into a host's transactions a page is, the
	// longer Open Collective takes over it: the sixth page of two years took over the 30 seconds a
	// request is allowed and came back a 503, where the third page of one year takes a few seconds.
	const years = [
		{ since: variables.twoYearsAgo, until: variables.yearAgo },
		{ since: variables.yearAgo, until: now.toISOString() }
	];
	const given = new Map(progress.given);
	for (const host of HOSTS) {
		for (const year of years) {
			for (const query of [SCAN_QUERY, PAID_QUERY]) {
				const key = `${host}:${year.since}:${query === SCAN_QUERY ? 'given' : 'paid'}`;
				if (progress.scanned.includes(key)) continue;
				step();
				const nodes =
					query === SCAN_QUERY
						? await scanHost<ScanNode>({ ask, host, ...year, query })
						: giftsPaid(await scanHost<PaidNode>({ ask, host, ...year, query }));
				tallyGiven(nodes, given);
				progress.given = [...given];
				progress.scanned.push(key);
			}
		}
	}
	if (!progress.nodes) {
		step();
		const slugs = topGivers(given);
		const nodes: (ContributorNode | null)[] = [];
		for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
			const result = await ask<Record<string, ContributorNode | null>>({
				query: contributorsQuery(slugs.slice(i, i + BATCH_SIZE)),
				variables
			});
			nodes.push(...Object.values(result));
		}
		progress.nodes = nodes;
		// Not needed again, and the largest part of what is kept.
		progress.given = [];
	}
	const contributors = toContributors(progress.nodes);
	for (; progress.done < contributors.length; progress.done++) {
		step();
		const ranked = await rank(ask, contributors[progress.done], now);
		if (ranked) progress.contributors.push(ranked);
	}
}

const KEY = 'contributors:scan:v8';

/** Where a scan under way keeps its progress between runs. */
const progressStore = kvStore<ScanProgress>(`${KEY}:progress`);

/**
 * Refreshed weekly by the schedule in `worker.ts`, and after a deploy by `pnpm warm`: the
 * standings move slowly, and the scan takes a minute or more, longer than a visit allows. The
 * scan covers the past two years, so the year before can be compared with the past one. In
 * development, where no schedule runs, the first visit starts it instead.
 *
 * A scan asks Open Collective about 20 times for the contributions and expenses paid through the
 * `HOSTS`, a page of `SCAN_PAGE` for each host in each of the two years, plus a page for every
 * further `SCAN_PAGE` there is. Then it asks once for every `BATCH_SIZE` of the `LIMIT` ranked,
 * and three times or more for each ranked: for the gifts it paid as expenses, for whom its
 * contributions went to, and for which of those are its own funds. That is more than one run may
 * ask, so each run carries on from where the last stopped, until the scan is done. Open
 * Collective doesn't publish its rate limit; asking with `OC_PERSONAL_TOKEN`, when set, gets a
 * higher one than asking anonymously.
 */
export const loadContributors = cached<ContributorsResult>({
	key: KEY,
	// Under the week between Monday mornings, so each finds last week's standings stale.
	maxAgeMs: 6 * 24 * 60 * 60 * 1000,
	scheduled: true,
	load: async () => {
		let progress = (await progressStore.read())?.value;
		if (!progress || Date.now() - progress.startedAt > PROGRESS_KEPT_MS) {
			progress = newScan(Date.now());
		}
		try {
			await advance(progress, { used: 0, limit: REQUESTS_PER_RUN });
		} catch (err) {
			await progressStore.write({ at: Date.now(), value: progress });
			if (err instanceof ScanPaused) throw err;
			toHttpError(err);
		}
		await progressStore.clear();
		return { contributors: progress.contributors, fetchedAt: progress.startedAt };
	}
});
