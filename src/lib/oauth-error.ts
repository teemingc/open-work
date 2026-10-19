/**
 * Why connecting Open Collective failed, passed back to the settings page as a code. Only these
 * messages are shown, so a crafted link cannot put its own words on the page.
 */
export const OAUTH_ERRORS = {
	denied: 'Open Collective did not grant access.',
	expired: 'The sign-in link expired or was not started here. Try connecting again.',
	unreachable: 'Could not reach Open Collective. Try again in a moment.'
} as const;

export type OAuthError = keyof typeof OAUTH_ERRORS;

export function oauthErrorMessage(code: string | null): string | undefined {
	if (code === null) return undefined;
	return Object.hasOwn(OAUTH_ERRORS, code) ? OAUTH_ERRORS[code as OAuthError] : OAUTH_ERRORS.denied;
}
