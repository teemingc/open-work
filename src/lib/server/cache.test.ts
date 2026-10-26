import { afterEach, describe, expect, it, vi } from 'vitest';
import { cached } from './cache';

/**
 * Stands in for the KV namespace, shared by every `cached` like the real one. The adapter's stand-in
 * for `cloudflare:workers` reads its bindings from here, as it does under `vite dev`.
 */
const kv = vi.hoisted(() => {
	const kv = new Map<string, string>();
	Object.assign(globalThis, {
		__sveltekit_cloudflare_platform: {
			env: {
				OC_CACHE: {
					get: async (key: string) => {
						const value = kv.get(key);
						return value === undefined ? null : JSON.parse(value);
					},
					put: async (key: string, value: string) => void kv.set(key, value)
				}
			}
		}
	});
	return kv;
});

afterEach(() => {
	vi.useRealTimers();
	kv.clear();
});

/** Lets background refreshes run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('cached', () => {
	it('reuses a result until it is stale, then serves it while refreshing', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const load = vi.fn(async () => load.mock.calls.length);
		const get = cached({ key: 'a', maxAgeMs: 60 * 60 * 1000, load });

		expect(await get()).toBe(1);
		expect(await get()).toBe(1);
		expect(load).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(60 * 60 * 1000 + 1);
		expect(await get()).toBe(1);
		await settle();
		expect(load).toHaveBeenCalledTimes(2);
		expect(await get()).toBe(2);
	});

	it('hands the stored result to the next fetch, so it can ask only for what changed', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const load = vi.fn(async (previous: number[] | undefined) => [...(previous ?? []), 1]);
		const get = cached({ key: 'grow', maxAgeMs: 1000, load });

		await get();
		vi.advanceTimersByTime(2000);
		await get();
		await settle();
		expect(load).toHaveBeenLastCalledWith([1]);
		expect(await get()).toEqual([1, 1]);
	});

	it('finds a result another instance stored', async () => {
		const load = vi.fn(async () => 'stored');
		await cached({ key: 'shared', maxAgeMs: 1000, load })();

		const elsewhere = vi.fn(async () => 'fetched again');
		expect(await cached({ key: 'shared', maxAgeMs: 1000, load: elsewhere })()).toBe('stored');
		expect(elsewhere).not.toHaveBeenCalled();
	});

	it('shares a fetch already under way', async () => {
		const load = vi.fn(async () => 'once');
		const get = cached({ key: 'together', maxAgeMs: 1000, load });

		expect(await Promise.all([get(), get(), get()])).toEqual(['once', 'once', 'once']);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('stops waiting on a fetch another caller started, which may never finish', async () => {
		vi.useFakeTimers();
		let calls = 0;
		const get = cached({
			key: 'stuck',
			maxAgeMs: 1000,
			load: () => (++calls === 1 ? new Promise<string>(() => {}) : Promise.resolve('good'))
		});

		void get();
		const second = get();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(await second).toBe('good');
	});

	it('keeps the last good result when a refresh fails, such as when rate-limited', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
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
		await settle();
		expect(await get()).toBe('good');
	});

	it('peeks at a stored result, however old, without waiting for one', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const load = vi.fn(async () => 'value');
		const get = cached({ key: 'd', maxAgeMs: 1000, load });

		expect(await get.peek()).toBeUndefined();
		expect(load).not.toHaveBeenCalled();
		await get();
		expect(await get.peek()).toBe('value');

		vi.advanceTimersByTime(2000);
		expect(await get.peek()).toBe('value');
	});

	it('leaves a scheduled result for warm() to refresh, however stale a read finds it', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const load = vi.fn(async () => 'value');
		const get = cached({ key: 'f', maxAgeMs: 1000, load, scheduled: true });

		await get.warm();
		vi.advanceTimersByTime(2000);
		expect(await get.peek()).toBe('value');
		expect(await get()).toBe('value');
		await settle();
		expect(load).toHaveBeenCalledTimes(1);

		await get.warm();
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('warms only when nothing fresh is stored, waiting for the result', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const load = vi.fn(async () => 'value');
		const get = cached({ key: 'e', maxAgeMs: 1000, load });

		await get.warm();
		expect(load).toHaveBeenCalledTimes(1);
		expect(await get.peek()).toBe('value');

		await get.warm();
		expect(load).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(2000);
		await get.warm();
		expect(load).toHaveBeenCalledTimes(2);
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
