import { dev } from '$app/env';
import { query } from '$app/server';
import { loadContributors, type ContributorsResult } from './contributors.server';

/**
 * The scan started for a fresh clone, which no schedule refreshes. One at a time, as later visits
 * would otherwise give up on it after a while and start another.
 */
let seeding: Promise<void> | undefined;

/** The stored standings, or `undefined` before the first scan is stored. Never waits on a scan. */
export const getContributors = query(async (): Promise<ContributorsResult | undefined> => {
	const stored = await loadContributors.peek();
	// Deployed, the schedule and `pnpm warm` store them, as a visit can't outlast the scan.
	if (!stored && dev) {
		seeding ??= loadContributors
			.warm()
			.catch((err) => console.error('Scanning for the leaderboard failed.', err))
			.finally(() => (seeding = undefined));
	}
	return stored;
});
