import { describe, expect, it } from 'vitest';
import { oauthErrorCode, oauthErrorMessage } from './oauth-error';

describe('oauthErrorCode', () => {
	it('says access was denied only when you denied it', () => {
		expect(oauthErrorCode('access_denied')).toBe('denied');
	});

	it('says a used or expired code has expired', () => {
		expect(oauthErrorCode('invalid_grant')).toBe('expired');
	});

	it("blames Open Work's settings for a rejected client or redirect, rather than saying you denied access", () => {
		expect(oauthErrorCode('invalid_client')).toBe('misconfigured');
		expect(oauthErrorCode('unauthorized_client')).toBe('misconfigured');
		expect(oauthErrorCode(undefined)).toBe('misconfigured');
	});

	it('says Open Collective could not be reached when it fails on its side', () => {
		expect(oauthErrorCode('temporarily_unavailable')).toBe('unreachable');
	});
});

describe('oauthErrorMessage', () => {
	it('shows only its own messages, so a crafted link cannot put words on the page', () => {
		expect(oauthErrorMessage('Your account is locked, call this number')).toBe(
			oauthErrorMessage('denied')
		);
	});
});
