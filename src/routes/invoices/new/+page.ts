import { openWorkLogWithSettings } from '#lib/open-work-log.js';
import { getMe } from '#lib/opencollective.remote.js';
import type { PageLoad } from './$types';

// The work log lives in this browser's IndexedDB, which the server cannot read.
export const ssr = false;

// Loaded here rather than awaited in the component: a component that awaits mounts after
// SvelteKit restores the draft snapshot, and the draft would be lost on reload.
export const load: PageLoad = async () => {
	const [me, { settings, store }] = await Promise.all([getMe(), openWorkLogWithSettings()]);
	return { me, settings, store };
};
