import { cached } from '#lib/server/cache.js';
import { publicGraphql, toHttpError } from '#lib/server/opencollective.js';
import {
	BATCH_SIZE,
	contributorsQuery,
	contributorsWindow,
	EXPENSES_QUERY,
	giftsPaid,
	HOSTS,
	MIN_CONTRIBUTION,
	PAID_QUERY,
	SCAN_PAGE,
	SCAN_QUERY,
	toCandidates,
	toContributors,
	withGifts,
	type Contributor,
	type ContributorNode,
	type ExpenseNode,
	type PaidNode,
	type ScanNode
} from './contributors';

export interface ContributorsResult {
	contributors: Contributor[];
	/** When Open Collective was asked, as a timestamp. */
	fetchedAt: number;
}

/**
 * Every transaction of `MIN_CONTRIBUTION` or more through `host` since `since` that `query` lists:
 * `SCAN_QUERY` for contributions, `PAID_QUERY` for expenses paid.
 */
async function scanHost<T>({
	host,
	since,
	query
}: {
	host: string;
	since: string;
	query: string;
}): Promise<T[]> {
	const nodes: T[] = [];
	for (let offset = 0; ; offset += SCAN_PAGE) {
		const { transactions } = await publicGraphql<{
			transactions: { totalCount: number; nodes: T[] };
		}>({
			query,
			variables: {
				host: { slug: host },
				since,
				offset,
				min: MIN_CONTRIBUTION * 100,
				limit: SCAN_PAGE
			}
		});
		nodes.push(...transactions.nodes);
		if (offset + SCAN_PAGE >= transactions.totalCount) return nodes;
	}
}

/** Every expense `slug` has paid. Most contributors, being companies, have paid none. */
async function scanExpenses(slug: string): Promise<ExpenseNode[]> {
	const nodes: ExpenseNode[] = [];
	for (let offset = 0; ; offset += SCAN_PAGE) {
		const { transactions } = await publicGraphql<{
			transactions: { totalCount: number; nodes: ExpenseNode[] };
		}>({ query: EXPENSES_QUERY, variables: { slug, offset, limit: SCAN_PAGE } });
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
 * A scan asks Open Collective about seven times for contributions: a page of `SCAN_PAGE` for each
 * of the `HOSTS`, plus a page for every further `SCAN_PAGE` a host has. It asks about nine times
 * more for the expenses the hosts paid, to find the gifts among them. Then it asks once for every
 * `BATCH_SIZE` of the `LIMIT` ranked, and once or more for each ranked, for the gifts it paid as
 * expenses. Open Collective doesn't publish its rate limit; asking with `OC_PERSONAL_TOKEN`, when
 * set, gets a higher one than asking anonymously.
 */
export const loadContributors = cached<ContributorsResult>({
	key: 'contributors:scan:v5',
	// Under the week between scheduled refreshes, so each finds last week's standings stale.
	maxAgeMs: 6 * 24 * 60 * 60 * 1000,
	scheduled: true,
	load: async () => {
		const now = new Date();
		const variables = contributorsWindow(now);
		const nodes: (ContributorNode | null)[] = [];
		const contributors: Contributor[] = [];
		try {
			const since = variables.twoYearsAgo;
			// One host at a time: a page can take Open Collective most of the 30 seconds it allows a
			// request, and asking for several at once tips it over into a 503.
			const given: ScanNode[] = [];
			const paid: PaidNode[] = [];
			for (const host of HOSTS) {
				given.push(...(await scanHost<ScanNode>({ host, since, query: SCAN_QUERY })));
				paid.push(...(await scanHost<PaidNode>({ host, since, query: PAID_QUERY })));
			}
			const slugs = toCandidates([...given, ...giftsPaid(paid)]);
			for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
				const result = await publicGraphql<Record<string, ContributorNode | null>>({
					query: contributorsQuery(slugs.slice(i, i + BATCH_SIZE)),
					variables
				});
				nodes.push(...Object.values(result));
			}
			// One at a time, to stay under Open Collective's rate limit.
			for (const contributor of toContributors(nodes)) {
				const expenses = await scanExpenses(contributor.slug);
				const withGiven = withGifts({ contributor, expenses, now });
				if (withGiven.total > 0) contributors.push(withGiven);
			}
		} catch (err) {
			toHttpError(err);
		}
		return { contributors, fetchedAt: now.getTime() };
	}
});
