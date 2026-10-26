import { query } from '$app/server';
import { loadContributors, type ContributorsResult } from './contributors.server';

/** The stored standings, or `undefined` before the first scan is stored. Never waits on a scan. */
export const getContributors = query(async (): Promise<ContributorsResult | undefined> =>
	loadContributors.peek()
);
