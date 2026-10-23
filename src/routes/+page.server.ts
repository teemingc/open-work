import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import { getSettings } from '#lib/settings.remote.js';
import type { PageServerLoad } from './$types';

/**
 * Sends you to the collective you invoice from, keeping the chart settings in the address. With
 * none set in settings, the page offers a search instead.
 */
export const load: PageServerLoad = async ({ url }) => {
	const { collectiveSlug } = await getSettings();
	if (collectiveSlug) {
		redirect(307, resolve('/collective/[handle]', { handle: collectiveSlug }) + url.search);
	}
};
