import { dev } from '$app/env';
import { query } from '$app/server';
import {
	loadContributors,
	readScanFailure,
	type ContributorsResult,
	type ScanFailure
} from './contributors.server';

/**
 * The scan started for a fresh clone, which no schedule refreshes. One at a time, as later visits
 * would otherwise give up on it after a while and start another.
 */
let seeding: Promise<void> | undefined;

/**
 * The stored standings, `undefined` before the first scan is stored, and why the latest scan
 * failed if it did so after them. Never waits on a scan.
 */
export const getContributors = query(
	async (): Promise<{ standings?: ContributorsResult; failure?: ScanFailure }> => {
		const [stored, failure] = await Promise.all([loadContributors.peek(), readScanFailure()]);
		// Deployed, the schedule and `pnpm warm` store them, as a visit can't outlast the scan.
		if (!stored && dev) {
			seeding ??= loadContributors
				.warm()
				// The scan keeps why it failed, for the page to show.
				.catch(() => {})
				.finally(() => (seeding = undefined));
		}
		return {
			standings: stored,
			failure: failure && (!stored || failure.at > stored.fetchedAt) ? failure : undefined
		};
	}
);
