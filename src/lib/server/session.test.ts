import type { Cookies } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renewToken, setToken } from './session';

vi.mock('$app/env/private', () => ({ OC_CLIENT_ID: 'id', OC_CLIENT_SECRET: 'secret' }));

const DAY = 60 * 60 * 24;

/** The cookies a browser sent, taking what the response sets and deletes. */
function jar(sent: Record<string, string> = {}) {
	const values = new Map(Object.entries(sent));
	const maxAges = new Map<string, number | undefined>();
	const cookies = {
		get: (name: string) => values.get(name),
		set: (name: string, value: string, { maxAge }: { maxAge?: number }) => {
			values.set(name, value);
			maxAges.set(name, maxAge);
		},
		delete: (name: string) => void values.delete(name)
	} as unknown as Cookies;
	return { cookies, values, maxAges };
}

const answer = (body: object, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('setToken', () => {
	it('drops the token cookie a day before the token expires, and keeps the refresh token a year', () => {
		const { cookies, maxAges } = jar();
		setToken({ cookies, token: 'access', expiresIn: 90 * DAY, refreshToken: 'refresh' });
		expect(maxAges.get('oc_token')).toBe(89 * DAY);
		expect(maxAges.get('oc_refresh')).toBe(365 * DAY);
	});
});

describe('renewToken', () => {
	it('swaps the refresh token for new tokens once the access token has gone', async () => {
		const fetch = vi.fn(async () =>
			answer({ access_token: 'new', expires_in: 90 * DAY, refresh_token: 'next' })
		);
		vi.stubGlobal('fetch', fetch);
		const { cookies, values } = jar({ oc_refresh: 'gone-access' });

		await renewToken(cookies);

		expect(Object.fromEntries(values)).toEqual({ oc_token: 'new', oc_refresh: 'next' });
		const body = (fetch.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
		expect(Object.fromEntries(body)).toEqual({
			grant_type: 'refresh_token',
			client_id: 'id',
			client_secret: 'secret',
			refresh_token: 'gone-access'
		});
	});

	it('asks for nothing while the access token is there, or with no refresh token', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await renewToken(jar({ oc_token: 'access', oc_refresh: 'unused' }).cookies);
		await renewToken(jar().cookies);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('asks once for requests that arrive together, as a refresh token works once', async () => {
		const fetch = vi.fn(async () => answer({ access_token: 'new', refresh_token: 'next' }));
		vi.stubGlobal('fetch', fetch);
		const first = jar({ oc_refresh: 'together' });
		const second = jar({ oc_refresh: 'together' });

		await Promise.all([renewToken(first.cookies), renewToken(second.cookies)]);

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(second.values.get('oc_token')).toBe('new');
		expect(second.values.get('oc_refresh')).toBe('next');
	});

	it('forgets a refresh token Open Collective refuses', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => answer({ error: 'invalid_grant' }, 400))
		);
		const { cookies, values } = jar({ oc_refresh: 'revoked' });

		await renewToken(cookies);

		expect(values.size).toBe(0);
	});

	it('keeps the refresh token when Open Collective cannot be asked', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetch = vi
			.fn()
			.mockRejectedValueOnce(new TypeError('fetch failed'))
			.mockResolvedValueOnce(answer({ error: 'server_error' }, 503));
		vi.stubGlobal('fetch', fetch);
		const offline = jar({ oc_refresh: 'offline' });
		const faulty = jar({ oc_refresh: 'faulty' });

		await renewToken(offline.cookies);
		await renewToken(faulty.cookies);

		expect(offline.values.get('oc_refresh')).toBe('offline');
		expect(faulty.values.get('oc_refresh')).toBe('faulty');
	});
});
