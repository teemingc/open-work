import { openWorkLogWithSettings } from '#lib/open-work-log.js';
import type { PageLoad } from './$types';

// The invoice lives in this browser's IndexedDB, which the server cannot read.
export const ssr = false;

export const load: PageLoad = async ({ params }) => {
	const { store } = await openWorkLogWithSettings();
	return { id: params.id, store };
};
