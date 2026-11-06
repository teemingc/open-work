import { resolve } from '$app/paths';
import { forgetDriveSync } from '#lib/drive-sync.svelte.js';
import { forgetRecentCollectives } from '#lib/recent-collectives.js';
import { forgetWorkLog } from '#lib/worklog-store.svelte.js';

/**
 * Delete what this app keeps in this browser, after `clearAllData` has signed you out: the work
 * log, with your settings, and what it remembers between visits. Throws when the work log could
 * not be deleted.
 */
export async function forgetThisBrowser(): Promise<void> {
	forgetDriveSync();
	forgetRecentCollectives();
	await forgetWorkLog();
	// Also the cache. Browsers without the header have already lost everything else above.
	// As JSON, which other sites cannot send without asking first, so they cannot clear yours.
	await fetch(resolve('/auth/clear'), {
		method: 'POST',
		headers: { 'content-type': 'application/json' }
	}).catch(() => {});
}
