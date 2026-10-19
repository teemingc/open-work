import { afterEach, describe, expect, it, vi } from 'vitest';
import { cached } from './cache';

vi.mock('cloudflare:workers', () => ({ waitUntil: () => {} }));

afterEach(() => vi.useRealTimers());

describe('cached', () => {
	it('reuses a result until it is an hour old', async () => {
		vi.useFakeTimers();
		const load = vi.fn(async () => load.mock.calls.length);
		const get = cached({ key: 'a', maxAgeMs: 60 * 60 * 1000, load });

		expect(await get()).toBe(1);
		expect(await get()).toBe(1);
		expect(load).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(60 * 60 * 1000 + 1);
		expect(await get()).toBe(2);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('does not wait on a fetch another caller started, which may never finish', async () => {
		let calls = 0;
		const get = cached({
			key: 'stuck',
			maxAgeMs: 1000,
			load: () => (++calls === 1 ? new Promise<string>(() => {}) : Promise.resolve('good'))
		});

		void get();
		expect(await get()).toBe('good');
	});

	it('serves the last good result when a fresh fetch fails, such as when rate-limited', async () => {
		vi.useFakeTimers();
		let fail = false;
		const get = cached({
			key: 'b',
			maxAgeMs: 1000,
			load: async () => {
				if (fail) throw new Error('429');
				return 'good';
			}
		});

		expect(await get()).toBe('good');
		fail = true;
		vi.advanceTimersByTime(2000);
		expect(await get()).toBe('good');
	});

	it('fails when there is nothing to fall back on', async () => {
		const get = cached({
			key: 'c',
			maxAgeMs: 1000,
			load: async () => {
				throw new Error('429');
			}
		});
		await expect(get()).rejects.toThrow('429');
	});
});
