import { OC_CLIENT_ID, OC_CLIENT_SECRET } from '$app/env/private';
import { redirect } from '@sveltejs/kit';
import { setToken } from '#lib/server/session.js';
import { callbackUrl, STATE_COOKIE, stateCookieOptions } from '../oauth';
import type { RequestHandler } from './$types';

interface TokenResponse {
	access_token?: string;
	expires_in?: number;
	error_description?: string;
}

/** Open Collective sends the browser back here with a one-time code to swap for a token. */
export const GET: RequestHandler = async ({ cookies, url, fetch }) => {
	const expectedState = cookies.get(STATE_COOKIE);
	cookies.delete(STATE_COOKIE, stateCookieOptions);

	const fail = (message: string): never => {
		redirect(303, `/settings?${new URLSearchParams({ oc_error: message })}`);
	};

	const deniedReason = url.searchParams.get('error_description') ?? url.searchParams.get('error');
	if (deniedReason) fail(deniedReason);

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code || !state || state !== expectedState) {
		fail('The sign-in link expired or was not started here. Try connecting again.');
	}

	let body: TokenResponse = {};
	try {
		const response = await fetch('https://opencollective.com/oauth/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				client_id: OC_CLIENT_ID,
				client_secret: OC_CLIENT_SECRET,
				code: code!,
				redirect_uri: callbackUrl(url.origin)
			})
		});
		body = (await response.json()) as TokenResponse;
	} catch {
		fail('Could not reach Open Collective. Try again in a moment.');
	}

	if (!body.access_token) fail(body.error_description ?? 'Open Collective did not grant access.');

	setToken({ cookies, token: body.access_token!, maxAge: body.expires_in });
	redirect(303, '/settings');
};
