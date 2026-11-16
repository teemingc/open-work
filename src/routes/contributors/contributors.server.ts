import { cached } from '#lib/server/cache.js';
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
	toCandidates,
	toContributors,
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
 * Asks Open Collective, again if it fails on its side. A page of a host's transactions can take
 * most of the 30 seconds it allows a request, and now and then one runs over and comes back a 503,
 * which would otherwise throw away the minute or more of scanning before it.
 */
async function ask<T>(request: { query: string; variables: Record<string, unknown> }): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await publicGraphql<T>(request);
		} catch (err) {
			const failed = err instanceof OpenCollectiveError && err.status >= 500;
			console.log(
				request.query.match(/query (\w+)/)?.[1],
				JSON.stringify(request.variables),
				attempt
			);
			if (!failed || attempt >= RETRIES) throw err;
		}
	}
}

/**
 * Every transaction of `MIN_CONTRIBUTION` or more through `host` from `since` to `until` that
 * `query` lists: `SCAN_QUERY` for contributions, `PAID_QUERY` for expenses paid.
 */
async function scanHost<T>({
	host,
	since,
	until,
	query
}: {
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
async function scanAccount<T>(slug: string, query: string): Promise<T[]> {
	const nodes: T[] = [];
	for (let offset = 0; ; offset += SCAN_PAGE) {
		const { transactions } = await ask<{
			transactions: { totalCount: number; nodes: T[] };
		}>({ query, variables: { slug, offset, limit: SCAN_PAGE } });
		nodes.push(...transactions.nodes);
		if (offset + SCAN_PAGE >= transactions.totalCount) return nodes;
	}
}

/**
 * Refreshed once a week by the schedule in `worker.ts`, and after a deploy by `pnpm warm`: the
 * standings move slowly, and the scan takes a minute or more, longer than a visit allows. The
 * scan covers the past two years, so the year before can be compared with the past one. In
 * development, where no schedule runs, the first visit starts it instead.
 *
 * A scan asks Open Collective about ten times for contributions: a page of `SCAN_PAGE` for each
 * of the `HOSTS` in each of the two years, plus a page for every further `SCAN_PAGE` there is. It
 * asks about ten times more for the expenses the hosts paid, to find the gifts among them. Then it
 * asks once for every
 * `BATCH_SIZE` of the `LIMIT` ranked, and twice or more for each ranked: for the gifts it paid as
 * expenses, and for whom its contributions went to. Open Collective doesn't publish its rate limit; asking with `OC_PERSONAL_TOKEN`, when
 * set, gets a higher one than asking anonymously.
 */
export const loadContributors = cached<ContributorsResult>({
	key: 'contributors:scan:v7',
	// Under the week between scheduled refreshes, so each finds last week's standings stale.
	maxAgeMs: 6 * 24 * 60 * 60 * 1000,
	scheduled: true,
	load: async () => {
		const now = new Date();
		const variables = contributorsWindow(now);
		const nodes: (ContributorNode | null)[] = [];
		const contributors: Contributor[] = [];
		try {
			// One host and one year at a time. The further into a host's transactions a page is, the
			// longer Open Collective takes over it: the sixth page of two years took over the 30
			// seconds a request is allowed and came back a 503, where the third page of one year
			// takes a few seconds. Asking for several at once slows each further.
			const years = [
				{ since: variables.twoYearsAgo, until: variables.yearAgo },
				{ since: variables.yearAgo, until: now.toISOString() }
			];
			const given: ScanNode[] = [];
			const paid: PaidNode[] = [];
			for (const host of HOSTS) {
				for (const year of years) {
					given.push(...(await scanHost<ScanNode>({ host, ...year, query: SCAN_QUERY })));
					paid.push(...(await scanHost<PaidNode>({ host, ...year, query: PAID_QUERY })));
				}
			}
			const slugs = toCandidates([...given, ...giftsPaid(paid)]);
			for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
				const result = await ask<Record<string, ContributorNode | null>>({
					query: contributorsQuery(slugs.slice(i, i + BATCH_SIZE)),
					variables
				});
				nodes.push(...Object.values(result));
			}
			// One at a time, to stay under Open Collective's rate limit.
			for (const contributor of toContributors(nodes)) {
				const { slug } = contributor;
				const expenses = await scanAccount<ExpenseNode>(slug, EXPENSES_QUERY);
				const withGiven = withGifts({ contributor, expenses, now });
				if (withGiven.total <= 0) continue;
				const given = await scanAccount<GivenNode>(slug, GIVEN_QUERY);
				contributors.push({ ...withGiven, spread: spreadOf({ slug, given, expenses, now }) });
			}
		} catch (err) {
			toHttpError(err);
		}
		return { contributors, fetchedAt: now.getTime() };
	}
});
