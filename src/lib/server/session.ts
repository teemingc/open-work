import { getRequestEvent } from '$app/server';
import { dev } from '$app/env';
import { OC_CLIENT_ID, OC_CLIENT_SECRET } from '$app/env/private';
import { error, type Cookies } from '@sveltejs/kit';

const DAY = 60 * 60 * 24;

const TOKEN_COOKIE = 'oc_token';
/** How long Open Collective's access tokens last, for a response that does not say. */
const TOKEN_MAX_AGE = 90 * DAY;
/**
 * The token's cookie goes this long before the token does, so the token is renewed while it still
 * works rather than after a request has been refused.
 */
const RENEW_EARLY = DAY;

const REFRESH_COOKIE = 'oc_refresh';
/** How long Open Collective keeps a refresh token. */
const REFRESH_MAX_AGE = 365 * DAY;

const cookieOptions = { path: '/', httpOnly: true, secure: !dev, sameSite: 'lax' } as const;

/** What Open Collective answers when asked for a token (RFC 6749, sections 5.1 and 5.2). */
export interface TokenResponse {
	access_token?: string;
	/** Seconds until the access token stops working. */
	expires_in?: number;
	/** Swapped for a new access token once this one has expired. Each can be used once. */
	refresh_token?: string;
	/** An OAuth error code, when no token was given. */
	error?: string;
	error_description?: string;
}

/** Keep a token Open Collective gave, and the refresh token that renews it when it came with one. */
export function setToken({
	cookies,
	token,
	expiresIn = TOKEN_MAX_AGE,
	refreshToken
}: {
	cookies: Cookies;
	token: string;
	expiresIn?: number;
	refreshToken?: string;
}): void {
	const maxAge = expiresIn > 2 * RENEW_EARLY ? expiresIn - RENEW_EARLY : expiresIn;
	cookies.set(TOKEN_COOKIE, token, { ...cookieOptions, maxAge });
	if (refreshToken) {
		cookies.set(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });
	}
}

export function clearToken(cookies: Cookies): void {
	cookies.delete(TOKEN_COOKIE, cookieOptions);
	cookies.delete(REFRESH_COOKIE, cookieOptions);
}

/** How long to wait on Open Collective for a new token before serving the page without one. */
const RENEW_TIMEOUT_MS = 5000;
/**
 * How long the answer to a renewal is kept. A page asks for several things at once, each carrying
 * the same refresh token, and Open Collective accepts a refresh token once: the requests share one
 * answer rather than all but the first being refused.
 */
const RENEWAL_KEPT_MS = 60_000;

/** `null` when Open Collective refused the refresh token, `undefined` when it could not be asked. */
type Renewal = TokenResponse | null | undefined;

const renewals = new Map<string, { at: number; answer: Promise<Renewal> }>();

async function requestRenewal(refreshToken: string): Promise<Renewal> {
	try {
		const response = await fetch('https://opencollective.com/oauth/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: OC_CLIENT_ID,
				client_secret: OC_CLIENT_SECRET,
				refresh_token: refreshToken
			}),
			signal: AbortSignal.timeout(RENEW_TIMEOUT_MS)
		});
		const body = (await response.json()) as TokenResponse;
		if (body.access_token) return body;
		console.error(
			'Open Collective would not renew the connection:',
			response.status,
			body.error,
			body.error_description
		);
		// A fault on its side says nothing about the refresh token, which is kept to try again.
		return response.status >= 500 ? undefined : null;
	} catch {
		return undefined;
	}
}

/**
 * Swap the refresh token for a new access token once the old one's cookie has gone, so a
 * connection lasts until you disconnect rather than 90 days. Called from the `handle` hook, as a
 * query cannot set cookies.
 */
export async function renewToken(cookies: Cookies): Promise<void> {
	if (cookies.get(TOKEN_COOKIE)) return;
	const refreshToken = cookies.get(REFRESH_COOKIE);
	if (!refreshToken) return;

	const now = Date.now();
	for (const [key, { at }] of renewals) {
		if (now - at > RENEWAL_KEPT_MS) renewals.delete(key);
	}
	let renewal = renewals.get(refreshToken);
	if (!renewal) {
		renewal = { at: now, answer: requestRenewal(refreshToken) };
		renewals.set(refreshToken, renewal);
	}

	const answer = await renewal.answer;
	if (answer?.access_token) {
		setToken({
			cookies,
			token: answer.access_token,
			expiresIn: answer.expires_in,
			refreshToken: answer.refresh_token
		});
	} else if (answer === null) {
		// Revoked, or used already: connecting again is the only way back.
		cookies.delete(REFRESH_COOKIE, cookieOptions);
	}
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

/**
 * Whether this request carries a sign-in, to Open Collective or Google, going by its cookies alone,
 * so a page can show it without waiting on either service.
 */
export function signedIn(cookies: Cookies): boolean {
	return cookies
		.getAll()
		.some(({ name }) => name === TOKEN_COOKIE || name.endsWith('better-auth.session_token'));
}
