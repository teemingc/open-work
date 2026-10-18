import { getMe } from '#lib/opencollective.remote.js';
import { getSettings } from '#lib/settings.remote.js';
import { openWorkLog } from '#lib/worklog-store.svelte.js';
import type { PageLoad } from './$types';

// Loaded here rather than awaited in the component: a component that awaits mounts after
// SvelteKit restores the draft snapshot, and the draft would be lost on reload.
export const load: PageLoad = async () => {
	const [me, settings] = await Promise.all([getMe(), getSettings()]);
	const store = await openWorkLog({
		rate: settings.hourlyRate,
		currency: settings.currency,
		collective: settings.collectiveSlug
	});
	return { me, settings, store };
};
