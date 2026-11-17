import { loadContributors, ScanPaused } from '../contributors.server';

/**
 * Called by the schedule in `worker.ts` and by `pnpm warm` after a deploy, which can wait out the
 * scan as a page cannot. Scans only when the stored standings are stale, so calling it more often
 * costs nothing. Answers 202 when the scan is under way and needs another call to carry on, as one
 * call may make only so many requests, and 204 once the standings are stored.
 */
export async function POST() {
	try {
		await loadContributors.warm();
	} catch (err) {
		if (err instanceof ScanPaused) return new Response(null, { status: 202 });
		throw err;
	}
	return new Response(null, { status: 204 });
}
