import { forgetDriveSync } from '#lib/drive-sync.svelte.js';
import { forgetHiddenTasks } from '#lib/hidden-tasks.svelte.js';
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
	forgetHiddenTasks();
	await forgetWorkLog();
}
