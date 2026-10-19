import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';

function request(url: string) {
	const resolve = vi.fn(async () => new Response('page'));
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
		expect(res.headers.get('location')).toBe('https://openwork.ing/collective/svelte?range=1y');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('serves the custom domain as usual', async () => {
		const { resolve, response } = request('https://openwork.ing/worklog');
		expect(await (await response).text()).toBe('page');
		expect(resolve).toHaveBeenCalled();
	});
});
