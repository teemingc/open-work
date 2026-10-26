/**
 * Reuse a result across requests so Open Collective is asked again only once it is stale.
 *
 * A stored result is served straight away, however old, and refreshed in the background once it
 * is stale, so a visitor only waits on Open Collective when nothing has been stored yet. Results go
 * in Workers KV, which every data centre shares and which keeps them until they go unused for a
 * while, or in the Cache API for results that are cheap to fetch again. When a refresh fails, for
 * example because Open Collective rate-limits us, the stored result stays.
 */

import { env, waitUntil } from 'cloudflare:workers';

/** Long enough that a collective nobody has looked at for months drops out. */
const KV_KEPT_FOR_SECONDS = 60 * 60 * 24 * 90;
const EDGE_KEPT_FOR_SECONDS = 60 * 60 * 24 * 7;

/**
 * How long a request waits on a fetch another request started before starting its own. On
 * Cloudflare a request's fetches are cancelled when it ends, so the other fetch may never finish.
 */
const SHARED_WAIT_MS = 30_000;

export interface Entry<T> {
	at: number;
	value: T;
}

export interface Store<T> {
	read(): Promise<Entry<T> | undefined>;
	write(entry: Entry<T>): Promise<void>;
}

/** Kept in Workers KV, shared by every data centre. */
export function kvStore<T>(key: string): Store<T> {
	return {
		async read() {
			try {
				return (await env.OC_CACHE?.get<Entry<T>>(key, 'json')) ?? undefined;
			} catch {
				return undefined;
			}
		},
		async write(entry) {
			try {
				await env.OC_CACHE?.put(key, JSON.stringify(entry), {
					expirationTtl: KV_KEPT_FOR_SECONDS
				});
			} catch {
				// Too big, or written too often; the result is still kept in memory.
			}
		}
	};
}

/** Kept in the Cache API, shared by the instances in one data centre. */
function edgeStore<T>(key: string): Store<T> {
	const request = new Request(`https://cache.invoicer.internal/${encodeURIComponent(key)}`);
	const cache = () =>
		typeof caches === 'undefined' ? undefined : (caches as unknown as { default?: Cache }).default;
	return {
		async read() {
			try {
				const response = await cache()?.match(request);
				return response ? ((await response.json()) as Entry<T>) : undefined;
			} catch {
				return undefined;
			}
		},
		async write(entry) {
			await cache()
				?.put(
					request,
					new Response(JSON.stringify(entry), {
						headers: {
							'content-type': 'application/json',
							'cache-control': `max-age=${EDGE_KEPT_FOR_SECONDS}`
						}
					})
				)
				.catch(() => {});
		}
	};
}

export interface Cached<T> {
	/** The stored result, or a fresh one when nothing is stored yet. */
	(): Promise<T>;
	/** The stored result, however old, without waiting on Open Collective. */
	peek(): Promise<T | undefined>;
	/**
	 * Waits until a result no older than `maxAgeMs` is stored, fetching one only if there is none,
	 * so calling it often asks Open Collective no more often than visitors would.
	 */
	warm(): Promise<void>;
}

/** Waits for `promise`, but gives up after `ms` and settles with `fallback()` instead. */
function within<T>(promise: Promise<T>, ms: number, fallback: () => Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<T>((resolve, reject) => {
		timer = setTimeout(() => fallback().then(resolve, reject), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function cached<T>({
	key,
	maxAgeMs,
	load,
	store = 'kv',
	scheduled = false
}: {
	/** Unique per result, so the stores keep them apart. */
	key: string;
	/** How old a result can get before it is refreshed in the background. */
	maxAgeMs: number;
	/** Fetches a fresh result. Given the stored one, if any, to fetch only what changed. */
	load: (previous: T | undefined) => Promise<T>;
	/** Where the result outlives this instance: KV everywhere, or the Cache API, per data centre. */
	store?: 'kv' | 'edge';
	/**
	 * Refreshed only by `warm()`, from a schedule, never by a read: for a fetch that outlasts the
	 * time Cloudflare gives a request's work after its response.
	 */
	scheduled?: boolean;
}): Cached<T> {
	const shared = store === 'kv' ? kvStore<T>(key) : edgeStore<T>(key);
	let memory: Entry<T> | undefined;
	let inFlight: { promise: Promise<T>; started: number } | undefined;

	const fresh = (entry: Entry<T> | undefined): entry is Entry<T> =>
		!!entry && Date.now() - entry.at < maxAgeMs;

	/** Takes the stored entry when it is newer, as another instance may have stored it. */
	async function syncShared() {
		const stored = await shared.read();
		if (stored && (!memory || stored.at > memory.at)) memory = stored;
	}

	function start(): Promise<T> {
		const promise = (async () => {
			const value = await load(memory?.value);
			const entry = { at: Date.now(), value };
			if (!memory || entry.at > memory.at) memory = entry;
			await shared.write(entry);
			return value;
		})();
		inFlight = { promise, started: Date.now() };
		void promise
			.finally(() => {
				if (inFlight?.promise === promise) inFlight = undefined;
			})
			.catch(() => {});
		// Finish and store the result even if the visitor leaves before it arrives.
		waitUntil(promise.catch(() => {}));
		return promise;
	}

	/** How much longer to wait on the fetch already under way, if one is and it may still finish. */
	const waitLeft = () => (inFlight ? SHARED_WAIT_MS - (Date.now() - inFlight.started) : 0);

	/** Joins a fetch another request started, unless it has run so long it may be stuck. */
	function refresh(): Promise<T> {
		const left = waitLeft();
		return inFlight && left > 0 ? within(inFlight.promise, left, start) : start();
	}

	/** Refreshes behind the scenes once the stored result is stale. */
	function revalidate() {
		if (!scheduled && !fresh(memory) && waitLeft() <= 0) void start().catch(() => {});
	}

	async function stored(): Promise<Entry<T> | undefined> {
		if (!fresh(memory)) await syncShared();
		return memory;
	}

	return Object.assign(
		async () => {
			const entry = await stored();
			if (!entry) return refresh();
			revalidate();
			return entry.value;
		},
		{
			async peek() {
				const entry = await stored();
				if (entry) revalidate();
				return entry?.value;
			},
			async warm() {
				if (!fresh(await stored())) await refresh();
			}
		}
	);
}
