import { afterEach, describe, expect, it, vi } from 'vitest';
import { cached } from './cache';

afterEach(() => vi.useRealTimers());

describe('cached', () => {
	it('reuses a result until it is an hour old, sharing one fetch between callers', async () => {
		vi.useFakeTimers();
		const load = vi.fn(async () => load.mock.calls.length);
		const get = cached({ key: 'a', maxAgeMs: 60 * 60 * 1000, load });

		expect(await Promise.all([get(), get()])).toEqual([1, 1]);
		expect(await get()).toBe(1);
		expect(load).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(60 * 60 * 1000 + 1);
		expect(await get()).toBe(2);
		expect(load).toHaveBeenCalledTimes(2);
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

	it('peeks at a fresh result without fetching one', async () => {
		vi.useFakeTimers();
		const load = vi.fn(async () => 'value');
		const get = cached({ key: 'd', maxAgeMs: 1000, load });

		expect(await get.peek()).toBeUndefined();
		expect(load).not.toHaveBeenCalled();
		await get();
		expect(await get.peek()).toBe('value');

		vi.advanceTimersByTime(2000);
		expect(await get.peek()).toBeUndefined();
		expect(load).toHaveBeenCalledTimes(1);
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
