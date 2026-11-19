/**
 * Why connecting Open Collective failed, passed back to the settings page as a code. Only these
 * messages are shown, so a crafted link cannot put its own words on the page.
 */
export const OAUTH_ERRORS = {
	denied: 'Open Collective did not grant access.',
	expired: 'The sign-in link expired or was not started here. Try connecting again.',
	unreachable: 'Could not reach Open Collective. Try again in a moment.',
	misconfigured:
		"Open Collective turned down Open Work's connection settings, so connecting does not work for now. The server log has the details."
} as const;

export type OAuthError = keyof typeof OAUTH_ERRORS;

/**
 * Which message fits an error code Open Collective sent, from the OAuth spec (RFC 6749, sections
 * 4.1.2.1 and 5.2). Only you can deny access; a code that was used, or took too long, is expired;
 * the rest mean the app's own settings are wrong.
 */
export function oauthErrorCode(error: string | undefined): OAuthError {
	switch (error) {
		case 'access_denied':
			return 'denied';
		case 'invalid_grant':
			return 'expired';
		case 'server_error':
		case 'temporarily_unavailable':
			return 'unreachable';
		default:
			return 'misconfigured';
	}
}

export function oauthErrorMessage(code: string | null): string | undefined {
	if (code === null) return undefined;
	return Object.hasOwn(OAUTH_ERRORS, code) ? OAUTH_ERRORS[code as OAuthError] : OAUTH_ERRORS.denied;
}
