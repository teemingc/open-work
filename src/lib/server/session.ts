import { getRequestEvent } from '$app/server';
import { dev } from '$app/env';
import { error, type Cookies } from '@sveltejs/kit';

const TOKEN_COOKIE = 'oc_token';
/** Open Collective does not document how long access tokens last, so keep the cookie for 90 days. */
const TOKEN_MAX_AGE = 60 * 60 * 24 * 90;

const cookieOptions = { path: '/', httpOnly: true, secure: !dev, sameSite: 'lax' } as const;

export function setToken({
	cookies,
	token,
	maxAge = TOKEN_MAX_AGE
}: {
	cookies: Cookies;
	token: string;
	maxAge?: number;
}): void {
	cookies.set(TOKEN_COOKIE, token, { ...cookieOptions, maxAge });
}

export function clearToken(cookies: Cookies): void {
	cookies.delete(TOKEN_COOKIE, cookieOptions);
}

/** The Open Collective access token for this browser, if it has connected. */
export function getToken(): string | undefined {
	return getRequestEvent().cookies.get(TOKEN_COOKIE);
}

export function requireToken(): string {
	const token = getToken();
	if (!token) error(401, 'Connect Open Collective in settings first.');
	return token;
}
