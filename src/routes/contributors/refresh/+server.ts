import { loadContributors } from '../contributors.server';

/**
 * Called by the schedule in `worker.ts` and by `pnpm warm` after a deploy, which can wait out the
 * scan as a page cannot. Scans only when the stored standings are stale, so calling it more often
 * costs nothing.
 */
export async function POST() {
	await loadContributors.warm();
	return new Response(null, { status: 204 });
}
