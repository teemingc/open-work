import { BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { sveltekitCookies } from 'better-auth/svelte-kit';

/** Lets the app keep one hidden file in the user's Drive, out of sight of other apps and the user. */
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Whether Google sign-in is set up on this server. */
export function googleConfigured(): boolean {
	return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && BETTER_AUTH_SECRET);
}

function createAuth(origin: string) {
	return betterAuth({
		baseURL: origin,
		secret: BETTER_AUTH_SECRET,
		// No database: the session and the Google tokens live in encrypted cookies, so the
		// server keeps nothing about you and your work log never passes through it at rest.
		session: {
			cookieCache: { enabled: true, maxAge: 30 * 24 * 60 * 60, strategy: 'jwe', refreshCache: true }
		},
		account: { storeStateStrategy: 'cookie', storeAccountCookie: true },
		socialProviders: {
			google: {
				clientId: GOOGLE_CLIENT_ID,
				clientSecret: GOOGLE_CLIENT_SECRET,
				scope: [DRIVE_APPDATA_SCOPE],
				// A refresh token, so the Drive copy keeps syncing after the hour an access token lasts.
				accessType: 'offline',
				prompt: 'select_account consent'
			}
		},
		plugins: [sveltekitCookies(getRequestEvent)] // must stay the last plugin
	});
}

// Keyed by origin, so the local dev server and the deployed app each get their own redirect URL.
const instances = new Map<string, ReturnType<typeof createAuth>>();

export function getAuth() {
	const { origin } = getRequestEvent().url;
	let auth = instances.get(origin);
	if (!auth) {
		auth = createAuth(origin);
		instances.set(origin, auth);
	}
	return auth;
}
