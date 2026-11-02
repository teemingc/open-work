import { getSettings } from '#lib/settings.remote.js';
import type { Settings } from '#lib/settings.js';
import { openWorkLog, type WorkLogStore } from '#lib/worklog-store.svelte.js';

/** Your settings, and the work log, which starts from them the first time it is opened. */
export async function openWorkLogWithSettings(): Promise<{
	settings: Settings;
	store: WorkLogStore;
}> {
	const settings = await getSettings();
	const store = await openWorkLog({
		rate: settings.hourlyRate,
		currency: settings.currency,
		collective: settings.collectiveSlug
	});
	return { settings, store };
}
