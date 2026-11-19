import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCollectiveError } from '#lib/server/opencollective.js';
import {
	advance,
	newScan,
	ScanPaused,
	scanFailureMessage,
	type ScanProgress
} from './contributors.server';

/** Twenty accounts that gave through `opensource`, the first the most. */
const GIVERS = Array.from({ length: 20 }, (_, i) => `giver-${i}`);

/** Stands in for Open Collective, answering each query the scan makes with a page or less. */
const ask = vi.hoisted(() => vi.fn<(request: { query: string }) => Promise<unknown>>());

vi.mock('#lib/server/opencollective.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/opencollective.js')>()),
	publicGraphql: ask
}));

const page = (nodes: unknown[]) => ({ transactions: { totalCount: nodes.length, nodes } });

async function answer({
	query,
	variables
}: {
	query: string;
	variables?: Record<string, unknown>;
}): Promise<unknown> {
	const name = query.match(/query (\w+)/)?.[1];
	if (name === 'ContributorsScan') {
		const host = (variables?.host as { slug: string }).slug;
		if (host !== 'opensource') return page([]);
		return page(
			GIVERS.map((slug, i) => ({
				amount: { value: (GIVERS.length - i) * 1000 },
				fromAccount: { slug, name: slug, type: 'ORGANIZATION', isIncognito: false },
				toAccount: { type: 'COLLECTIVE' },
				isRefunded: false
			}))
		);
	}
	if (name === 'Contributors') {
		const slugs = [...query.matchAll(/account\(slug: "([^"]+)"/g)].map(([, slug]) => slug);
		return Object.fromEntries(
			slugs.map((slug, i) => [
				`a${i}`,
				{
					slug,
					name: slug,
					type: 'ORGANIZATION',
					imageUrl: null,
					stats: {
						recent: { value: -1000 },
						previous: { value: 0 },
						total: { value: -1000 },
						totalAmountSpentTimeSeries: { nodes: [] }
					}
				}
			])
		);
	}
	if (['ContributorsPaid', 'ContributorExpenses', 'ContributorGiven'].includes(name ?? '')) {
		return page([]);
	}
	throw new Error(`Not answered: ${name}`);
}

/** 12 host scans (3 hosts, 2 years, contributions and expenses), 1 batch, 2 for each of 15. */
const REQUESTS = 12 + 1 + 15 * 2;

/** Runs the scan to the end, a run of at most `limit` requests at a time, as the schedule does. */
async function scan(progress: ScanProgress, limit: number): Promise<number[]> {
	const runs: number[] = [];
	for (;;) {
		const budget = { used: 0, limit };
		try {
			await advance(progress, budget);
			runs.push(budget.used);
			return runs;
		} catch (err) {
			runs.push(budget.used);
			if (!(err instanceof ScanPaused)) throw err;
		}
	}
}

beforeEach(() => {
	ask.mockReset();
	ask.mockImplementation(answer);
});

describe('advance', () => {
	it('ranks the 15 who gave the most in one run when nothing limits it', async () => {
		const progress = newScan(Date.UTC(2026, 10, 17));
		expect(await scan(progress, Infinity)).toEqual([REQUESTS]);
		expect(progress.contributors.map(({ slug }) => slug)).toEqual(GIVERS.slice(0, 15));
	});

	it('spreads the scan over runs of limited requests, asking nothing twice', async () => {
		const progress = newScan(Date.UTC(2026, 10, 17));
		const runs = await scan(progress, 20);
		expect(runs.length).toBeGreaterThan(1);
		expect(Math.max(...runs)).toBeLessThanOrEqual(20);
		expect(ask).toHaveBeenCalledTimes(REQUESTS);
		expect(progress.contributors.map(({ slug }) => slug)).toEqual(GIVERS.slice(0, 15));
	});

	it('keeps the contributors ranked before a request fails, and carries on after them', async () => {
		ask.mockImplementation(async (request) => {
			if (request.query.includes('ContributorExpenses') && ask.mock.calls.length === 18) {
				throw new OpenCollectiveError('Not found', 404);
			}
			return answer(request);
		});
		const progress = newScan(Date.UTC(2026, 10, 17));
		await expect(scan(progress, Infinity)).rejects.toThrow('Not found');
		// 13 requests before the first contributor, then two for each of the first two.
		expect(progress.done).toBe(2);
		expect(progress.contributors).toHaveLength(2);
		await scan(progress, Infinity);
		expect(ask).toHaveBeenCalledTimes(REQUESTS + 1);
		expect(progress.contributors.map(({ slug }) => slug)).toEqual(GIVERS.slice(0, 15));
	});
});

describe('scanFailureMessage', () => {
	it("passes on Open Collective's message, which the leaderboard shows when it has no standings", () => {
		expect(
			scanFailureMessage(
				new OpenCollectiveError(
					'Open Collective took too long to answer. Try again in a moment.',
					504
				)
			)
		).toBe('Open Collective took too long to answer.');
	});

	it('keeps other errors to the log, as they may hold details of the server', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const err = new TypeError("Cannot read properties of undefined (reading 'nodes')");
		expect(scanFailureMessage(err)).not.toContain('nodes');
		expect(log).toHaveBeenCalledWith(expect.any(String), err);
		log.mockRestore();
	});
});
