import { forgetCollective, getSettings } from '#lib/settings.remote.js';
import type { Settings } from '#lib/settings.js';
import { openWorkLog, type WorkLogStore } from '#lib/worklog-store.svelte.js';

/**
 * Your settings, and the work log, which starts from them the first time it is opened. The one
 * collective settings used to name for every invoice moves onto the Open Collective clients
 * without one, and is then forgotten, so a collective you clear later stays cleared.
 */
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
	if (!settings.collectiveSlug) return { settings, store };
	store.adoptCollective(settings.collectiveSlug);
	await forgetCollective();
	return { settings: { ...settings, collectiveSlug: '' }, store };
}
