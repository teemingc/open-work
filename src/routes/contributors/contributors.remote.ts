import { query } from '$app/server';
import { cached } from '#lib/server/cache.js';
import { publicGraphql, toHttpError } from '#lib/server/opencollective.js';
import {
	BATCH_SIZE,
	contributorsQuery,
	contributorsWindow,
	HOSTS,
	MIN_CONTRIBUTION,
	SCAN_PAGE,
	SCAN_QUERY,
	toCandidates,
	toContributors,
	type Contributor,
	type ContributorNode,
	type ScanNode
} from './contributors';

export interface ContributorsResult {
	contributors: Contributor[];
	/** When Open Collective was asked, as a timestamp. */
	fetchedAt: number;
}

/** Every contribution of `MIN_CONTRIBUTION` or more through `host` since `since`. */
async function scanHost(host: string, since: string): Promise<ScanNode[]> {
	const nodes: ScanNode[] = [];
	for (let offset = 0; ; offset += SCAN_PAGE) {
		const { transactions } = await publicGraphql<{
			transactions: { totalCount: number; nodes: ScanNode[] };
		}>({
			query: SCAN_QUERY,
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

/**
 * Refreshed once a week: the standings move slowly, and a visitor never waits on it. The
 * scan covers the past two years, so the year before can be compared with the past one.
 */
const loadContributors = cached<ContributorsResult>({
	key: 'contributors:scan:v1',
	maxAgeMs: 7 * 24 * 60 * 60 * 1000,
	load: async () => {
		const now = new Date();
		const variables = contributorsWindow(now);
		const nodes: (ContributorNode | null)[] = [];
		try {
			const scanned = await Promise.all(HOSTS.map((host) => scanHost(host, variables.twoYearsAgo)));
			const slugs = toCandidates(scanned.flat());
			for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
				const result = await publicGraphql<Record<string, ContributorNode | null>>({
					query: contributorsQuery(slugs.slice(i, i + BATCH_SIZE)),
					variables
				});
				nodes.push(...Object.values(result));
			}
		} catch (err) {
			toHttpError(err);
		}
		return { contributors: toContributors(nodes), fetchedAt: now.getTime() };
	}
});

export const getContributors = query(() => loadContributors());
