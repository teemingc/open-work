/**
 * Reuse a result across requests so Open Collective is not asked again for an hour.
 *
 * On Cloudflare the result goes in the Cache API, which every server instance in a data centre
 * shares; in memory alone it would be lost each time an instance is recycled. When fetching a
 * fresh result fails, for example because Open Collective rate-limits us, the last good result is
 * served instead, however old.
 */

import { waitUntil } from 'cloudflare:workers';

const STORED_FOR_SECONDS = 60 * 60 * 24 * 7;

interface Entry<T> {
	at: number;
	value: T;
}

function sharedCache(): Cache | undefined {
	return typeof caches === 'undefined'
		? undefined
		: (caches as unknown as { default?: Cache }).default;
}

export function cached<T>({
	key,
	maxAgeMs,
	load
}: {
	/** Unique per result, so the shared cache keeps them apart. */
	key: string;
	maxAgeMs: number;
	load: () => Promise<T>;
}): () => Promise<T> {
	const request = new Request(`https://cache.invoicer.internal/${encodeURIComponent(key)}`);
	let memory: Entry<T> | undefined;

	const fresh = (entry: Entry<T> | undefined): entry is Entry<T> =>
		!!entry && Date.now() - entry.at < maxAgeMs;

	async function readShared(): Promise<Entry<T> | undefined> {
		try {
			const response = await sharedCache()?.match(request);
			return response ? ((await response.json()) as Entry<T>) : undefined;
		} catch {
			return undefined;
		}
	}

	async function refresh(): Promise<T> {
		const shared = await readShared();
		if (shared && (!memory || shared.at > memory.at)) memory = shared;
		if (fresh(memory)) return memory.value;

		try {
			const entry = { at: Date.now(), value: await load() };
			memory = entry;
			await sharedCache()
				?.put(
					request,
					new Response(JSON.stringify(entry), {
						headers: {
							'content-type': 'application/json',
							'cache-control': `max-age=${STORED_FOR_SECONDS}`
						}
					})
				)
				.catch(() => {});
			return entry.value;
		} catch (err) {
			if (memory) return memory.value;
			throw err;
		}
	}

	return () => {
		if (fresh(memory)) return Promise.resolve(memory.value);
		// Each request fetches for itself. On Cloudflare a request's fetches are cancelled when it
		// ends, so a fetch shared with a request that was abandoned never settles and the others
		// waiting on it hang.
		const loading = refresh();
		// Finish and cache the result even if the visitor leaves before it arrives.
		waitUntil(loading.catch(() => {}));
		return loading;
	};
}
