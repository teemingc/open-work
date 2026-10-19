import { building } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getAuth, googleConfigured } from '#lib/server/auth.js';

/** Where the app lives. The workers.dev address it started on sends everyone here. */
const ORIGIN = 'https://openwork.ing';

/** Google sign-in, its callback and sign-out, all under /api/auth. */
export const handle: Handle = async ({ event, resolve }) => {
	const { hostname, pathname, search } = event.url;
	// Permanent, so search engines move the old address's standing to the new one.
	if (hostname.endsWith('.workers.dev')) return Response.redirect(ORIGIN + pathname + search, 301);

	if (!googleConfigured() || !pathname.startsWith('/api/auth/')) return resolve(event);
	return svelteKitHandler({ event, resolve, auth: getAuth(), building });
};
