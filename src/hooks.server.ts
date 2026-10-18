import { building } from '$app/env';
import type { Handle } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getAuth, googleConfigured } from '#lib/server/auth.js';

/** Google sign-in, its callback and sign-out, all under /api/auth. */
export const handle: Handle = async ({ event, resolve }) => {
	if (!googleConfigured() || !event.url.pathname.startsWith('/api/auth/')) return resolve(event);
	return svelteKitHandler({ event, resolve, auth: getAuth(), building });
};
