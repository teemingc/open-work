import { building } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getAuth, googleConfigured } from '#lib/server/auth.js';
import { ORIGIN } from '#lib/origin.js';

/** Google sign-in, its callback and sign-out, all under /api/auth. */
export const handle: Handle = async ({ event, resolve }) => {
	const { hostname, pathname, search } = event.url;
	// Permanent, so search engines move the old address's standing to the new one.
	if (hostname.endsWith('.workers.dev')) return Response.redirect(ORIGIN + pathname + search, 301);

	const response =
		!googleConfigured() || !pathname.startsWith('/api/auth/')
			? await resolve(event)
			: await svelteKitHandler({ event, resolve, auth: getAuth(), building });
	// Pages can show what you set up, so a shared computer keeps no copy of them once you leave.
	if (!response.headers.has('cache-control')) {
		response.headers.set('cache-control', 'private, no-store');
	}
	return response;
};
