import { getSettings } from '#lib/settings.remote.js';
import { openWorkLog } from '#lib/worklog-store.svelte.js';
import type { PageLoad } from './$types';

// The invoice lives in this browser's IndexedDB, which the server cannot read.
export const ssr = false;

export const load: PageLoad = async ({ params }) => {
	const settings = await getSettings();
	const store = await openWorkLog({
		rate: settings.hourlyRate,
		currency: settings.currency,
		collective: settings.collectiveSlug
	});
	return { id: params.id, store };
};
