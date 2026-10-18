import { afterEach, describe, expect, it, vi } from 'vitest';
import { graphql, OpenCollectiveError, publicGraphql, retryAfterMs } from './opencollective';

const ok = () => new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
const limited = (retryAfter?: string) =>
	new Response('Rate limit exceeded', {
		status: 429,
		headers: retryAfter ? { 'retry-after': retryAfter } : {}
	});

afterEach(() => {
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
});
