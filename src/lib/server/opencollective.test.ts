import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphql, OpenCollectiveError, publicGraphql, retryAfterMs } from './opencollective';

// The server's personal token, set per test.
const env = vi.hoisted(() => ({ OC_PERSONAL_TOKEN: '' }));
vi.mock('$app/env/private', () => env);

const ok = () => new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
const limited = (retryAfter?: string) =>
	new Response('Rate limit exceeded', {
		status: 429,
		headers: retryAfter ? { 'retry-after': retryAfter } : {}
	});

afterEach(() => {
	env.OC_PERSONAL_TOKEN = '';
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('retryAfterMs', () => {
	it('reads seconds and HTTP dates', () => {
		expect(retryAfterMs('3')).toBe(3000);
		expect(retryAfterMs('Sat, 17 Oct 2026 12:00:05 GMT', Date.parse('2026-10-17T12:00:00Z'))).toBe(
			5000
		);
		expect(retryAfterMs(null)).toBeUndefined();
		expect(retryAfterMs('soon')).toBeUndefined();
	});
});

describe('graphql', () => {
	it('waits as asked after a rate limit and tries once more', async () => {
		vi.useFakeTimers();
		const fetch = vi.fn().mockResolvedValueOnce(limited('2')).mockResolvedValueOnce(ok());
		vi.stubGlobal('fetch', fetch);

		const result = graphql({ query: '{ ok }' });
		await vi.advanceTimersByTimeAsync(2000);

		await expect(result).resolves.toEqual({ ok: true });
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('gives up with a message when the wait is long or the retry is limited too', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(limited('60')));
		await expect(graphql({ query: '{ ok }' })).rejects.toMatchObject({
			status: 429,
			message: 'Open Collective is limiting how often we can ask.',
			retryAfter: 60
		});

		vi.useFakeTimers();
		const fetch = vi.fn().mockResolvedValue(limited('1'));
		vi.stubGlobal('fetch', fetch);
		const result = graphql({ query: '{ ok }' }).catch((err: unknown) => err);
		await vi.advanceTimersByTimeAsync(1000);
		expect(await result).toBeInstanceOf(OpenCollectiveError);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});

describe('publicGraphql', () => {
	it('asks with the token, and anonymously when the token is rejected', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response('{}', { status: 401 }))
			.mockResolvedValueOnce(ok());
		vi.stubGlobal('fetch', fetch);

		await expect(publicGraphql({ token: 'stale', query: '{ ok }' })).resolves.toEqual({ ok: true });
		expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer stale');
		expect(fetch.mock.calls[1][1].headers.Authorization).toBeUndefined();
	});

	it('asks anonymously straight away when the token is rate-limited', async () => {
		const fetch = vi.fn().mockResolvedValueOnce(limited('5')).mockResolvedValueOnce(ok());
		vi.stubGlobal('fetch', fetch);

		await expect(publicGraphql({ token: 'busy', query: '{ ok }' })).resolves.toEqual({ ok: true });
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch.mock.calls[1][1].headers.Authorization).toBeUndefined();
	});

	it('tries your token, then the personal token, then anonymously', async () => {
		env.OC_PERSONAL_TOKEN = 'personal';
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(limited())
			.mockResolvedValueOnce(limited())
			.mockResolvedValueOnce(ok());
		vi.stubGlobal('fetch', fetch);

		await expect(publicGraphql({ token: 'yours', query: '{ ok }' })).resolves.toEqual({ ok: true });
		const headers = fetch.mock.calls.map((call) => call[1].headers);
		expect(headers[0].Authorization).toBe('Bearer yours');
		expect(headers[1]['Personal-Token']).toBe('personal');
		expect(headers[2].Authorization).toBeUndefined();
		expect(headers[2]['Personal-Token']).toBeUndefined();
	});

	it('asks anonymously when the personal token lacks a scope', async () => {
		env.OC_PERSONAL_TOKEN = 'personal';
		const unscoped = new Response(
			JSON.stringify({
				errors: [
					{ message: 'The Personal Token is not allowed for operations in scope "transactions".' }
				]
			}),
			{ status: 200 }
		);
		const fetch = vi.fn().mockResolvedValueOnce(unscoped).mockResolvedValueOnce(ok());
		vi.stubGlobal('fetch', fetch);

		await expect(publicGraphql({ query: '{ ok }' })).resolves.toEqual({ ok: true });
		expect(fetch.mock.calls[1][1].headers['Personal-Token']).toBeUndefined();
	});

	it('waits out a rate limit only when there is no other way to ask', async () => {
		vi.useFakeTimers();
		const fetch = vi.fn().mockResolvedValueOnce(limited('1')).mockResolvedValueOnce(ok());
		vi.stubGlobal('fetch', fetch);

		const result = publicGraphql({ query: '{ ok }' });
		await vi.advanceTimersByTimeAsync(1000);
		await expect(result).resolves.toEqual({ ok: true });
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
