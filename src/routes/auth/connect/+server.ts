import { OC_CLIENT_ID } from '$app/env/private';
import { redirect } from '@sveltejs/kit';
import { callbackUrl, STATE_COOKIE, stateCookieOptions } from '../oauth';
import type { RequestHandler } from './$types';

/** Send the browser to Open Collective to approve this app. */
export const GET: RequestHandler = ({ cookies, url }) => {
	const state = crypto.randomUUID();
	cookies.set(STATE_COOKIE, state, stateCookieOptions);

	const authorize = new URL('https://opencollective.com/oauth/authorize');
	authorize.search = new URLSearchParams({
		client_id: OC_CLIENT_ID,
		response_type: 'code',
		redirect_uri: callbackUrl(url.origin),
		scope: 'expenses',
		state
	}).toString();

	redirect(302, authorize.toString(), { external: ['https://opencollective.com'] });
};
