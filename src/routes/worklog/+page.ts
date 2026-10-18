import { getSettings } from '#lib/settings.remote.js';
import { openWorkLog } from '#lib/worklog-store.svelte.js';
import type { PageLoad } from './$types';

// The work log is read from IndexedDB here, so the page renders with it already loaded.
export const load: PageLoad = async () => {
	const settings = await getSettings();
	const store = await openWorkLog({
		rate: settings.hourlyRate,
		currency: settings.currency,
		collective: settings.collectiveSlug
	});
	return { settings, store };
};
