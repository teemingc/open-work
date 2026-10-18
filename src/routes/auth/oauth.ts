import { dev } from '$app/env';

export const STATE_COOKIE = 'oc_oauth_state';
export const stateCookieOptions = {
	path: '/auth',
	httpOnly: true,
	secure: !dev,
	sameSite: 'lax',
	maxAge: 60 * 10
} as const;

/** Must match the callback URL registered on the Open Collective OAuth app. */
export function callbackUrl(origin: string): string {
	return `${origin}/auth/callback`;
}
