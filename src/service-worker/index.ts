import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { resolve } from '$app/paths';
import { self as sw } from '$app/service-worker';

const CACHE = `cache-${version}`;
const ASSETS = new Set([...immutable, ...assets].map((asset) => resolve(asset.path)));

/**
 * The work log lives in IndexedDB, so these pages work offline. The server sends them as skeletons,
 * so they are fetched without cookies: the copy kept holds nothing of your account.
 */
const OFFLINE_PAGES = ['/work', '/worklog'];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll([...ASSETS]);
			// A page that fails to arrive must not stop the app from installing.
			await Promise.allSettled(
				OFFLINE_PAGES.map((path) => cache.add(new Request(path, { credentials: 'omit' })))
			);
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
		})()
	);
});

/** A kept page, or the overview for any other page, since only the work log works offline. */
async function offlinePage(pathname: string): Promise<Response> {
	const cache = await caches.open(CACHE);
	if (OFFLINE_PAGES.includes(pathname)) {
		const page = await cache.match(pathname);
		if (page) return page;
	}
	if (await cache.match(OFFLINE_PAGES[0])) return Response.redirect(OFFLINE_PAGES[0], 302);
	return Response.error();
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (ASSETS.has(url.pathname)) {
		event.respondWith(
			caches
				.open(CACHE)
				.then((cache) => cache.match(url.pathname))
				.then((cached) => cached ?? fetch(request))
		);
		return;
	}

	// Pages always come from the network when it can be reached, as they may show your account.
	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).catch(() => offlinePage(url.pathname)));
	}
});
