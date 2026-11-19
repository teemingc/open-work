import { OC_CLIENT_ID, OC_CLIENT_SECRET } from '$app/env/private';
import { redirect } from '@sveltejs/kit';
import { oauthErrorCode, type OAuthError } from '#lib/oauth-error.js';
import { setToken } from '#lib/server/session.js';
import { callbackUrl, STATE_COOKIE, stateCookieOptions } from '../oauth';
import type { RequestHandler } from './$types';

interface TokenResponse {
	access_token?: string;
	expires_in?: number;
	/** An OAuth error code, when the code could not be swapped. */
	error?: string;
	error_description?: string;
}

/** Open Collective sends the browser back here with a one-time code to swap for a token. */
export const GET: RequestHandler = async ({ cookies, url, fetch }) => {
	const expectedState = cookies.get(STATE_COOKIE);
	cookies.delete(STATE_COOKIE, stateCookieOptions);

	const fail = (code: OAuthError): never => {
		redirect(303, `/settings/connections?${new URLSearchParams({ oc_error: code })}`);
	};

	const refused = url.searchParams.get('error');
	if (refused !== null) {
		// Only a fixed message reaches the page, so the reason Open Collective gave goes to the log.
		if (refused !== 'access_denied') {
			console.error(
				'Open Collective refused to connect:',
				refused,
				url.searchParams.get('error_description')
			);
		}
		fail(oauthErrorCode(refused));
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	if (!code || !state || state !== expectedState) {
		fail('expired');
	}

	let body: TokenResponse = {};
	let status = 0;
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
		status = response.status;
		body = (await response.json()) as TokenResponse;
	} catch {
		fail('unreachable');
	}

	if (!body.access_token) {
		console.error(
			'Open Collective would not swap the sign-in code for a token:',
			status,
			body.error,
			body.error_description
		);
		fail(status >= 500 ? 'unreachable' : oauthErrorCode(body.error));
	}

	setToken({ cookies, token: body.access_token!, maxAge: body.expires_in });
	redirect(303, '/settings/connections');
};
