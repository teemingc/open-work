import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';
import { ORIGIN } from '#lib/origin.js';

function request(url: string, { init, cookie }: { init?: ResponseInit; cookie?: string } = {}) {
	const resolve = vi.fn(async () => new Response('page', init));
	const headers = cookie ? { cookie } : undefined;
	const event = { url: new URL(url), request: new Request(url, { headers }) } as RequestEvent;
	return { resolve, response: handle({ event, resolve }) };
}

describe('handle', () => {
	it('sends the old workers.dev address to the custom domain, keeping the path and query', async () => {
		const { resolve, response } = request(
			'https://open-work.teemingc.workers.dev/collective/svelte?range=1y'
		);
		const res = await response;
		expect(res.status).toBe(301);
		expect(res.headers.get('location')).toBe(`${ORIGIN}/collective/svelte?range=1y`);
		expect(resolve).not.toHaveBeenCalled();
	});

	it('serves the custom domain as usual', async () => {
		const { resolve, response } = request(`${ORIGIN}/worklog`);
		expect(await (await response).text()).toBe('page');
		expect(resolve).toHaveBeenCalled();
	});

	it('asks the browser not to keep a copy of pages while you are signed in', async () => {
		const { response } = request(`${ORIGIN}/collective/svelte`, { cookie: 'oc_token=secret' });
		expect((await response).headers.get('cache-control')).toBe('private, no-store');
	});

	it('or as you sign in', async () => {
		const { response } = request(`${ORIGIN}/auth/callback`, {
			init: { headers: { 'set-cookie': 'oc_token=secret' } }
		});
		expect((await response).headers.get('cache-control')).toBe('private, no-store');
	});

	it('lets the browser keep pages that are the same for everyone', async () => {
		const { response } = request(`${ORIGIN}/collective/svelte`);
		expect((await response).headers.get('cache-control')).toBeNull();
	});

	it('leaves caching that a response chose itself', async () => {
		const { response } = request(`${ORIGIN}/og/collective/svelte.png`, {
			cookie: 'oc_token=secret',
			init: { headers: { 'cache-control': 'public, max-age=3600' } }
		});
		expect((await response).headers.get('cache-control')).toBe('public, max-age=3600');
	});
});
