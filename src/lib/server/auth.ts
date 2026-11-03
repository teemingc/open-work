import { BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { betterAuth } from 'better-auth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { DriveError } from '#lib/server/drive.js';

/** Lets the app keep one file in the app's own folder of the user's Drive, which no other app can reach. */
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
	// From the request rather than `event.url`, which remote queries are not allowed to read.
	const { origin } = new URL(getRequestEvent().request.url);
	let auth = instances.get(origin);
	if (!auth) {
		auth = createAuth(origin);
		instances.set(origin, auth);
	}
	return auth;
}

/** A fresh Google access token from the encrypted account cookie, refreshed when it has expired. */
async function accessToken(): Promise<string> {
	if (!googleConfigured()) error(404, 'Google Drive sync is not set up on this server.');
	try {
		const { accessToken } = await getAuth().api.getAccessToken({
			body: { useAccountCookie: true },
			headers: getRequestEvent().request.headers
		});
		return accessToken;
	} catch {
		error(401, 'Sign in with Google again to keep syncing.');
	}
}

/** Run `fn` with a Google access token, turning Drive's errors into ones the browser can show. */
export async function withDrive<T>(fn: (token: string) => Promise<T>): Promise<T> {
	const token = await accessToken();
	try {
		return await fn(token);
	} catch (err) {
		if (err instanceof DriveError) {
			error(
				err.status === 401 ? 401 : 502,
				err.status === 401 ? 'Sign in with Google again to keep syncing.' : err.message
			);
		}
		throw err;
	}
}
