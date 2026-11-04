import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';
import { ORIGIN } from '#lib/origin.js';

function request(url: string, init?: ResponseInit) {
	const resolve = vi.fn(async () => new Response('page', init));
	const event = { url: new URL(url) } as RequestEvent;
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

	it('asks the browser not to keep a copy of pages', async () => {
		const { response } = request(`${ORIGIN}/worklog`);
		expect((await response).headers.get('cache-control')).toBe('private, no-store');
	});

	it('leaves caching that a response chose itself', async () => {
		const { response } = request(`${ORIGIN}/og/collective/svelte.png`, {
			headers: { 'cache-control': 'public, max-age=3600' }
		});
		expect((await response).headers.get('cache-control')).toBe('public, max-age=3600');
	});
});
