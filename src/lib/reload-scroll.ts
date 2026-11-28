const KEY = 'reload:scroll';

/** Whether a page has already been offered the scroll kept from before this load. */
let offered = false;

/**
 * Keeps the scroll over a reload for a page that waits on the work log. SvelteKit puts the scroll
 * back before the log arrives from IndexedDB, while the shorter skeleton is showing, so the page
 * can't reach it. The scroll is kept as the page is hidden as well as when it unloads, because iOS
 * drops a home-screen app left in the background without unloading it, and loads it again on the
 * way back. Call from `onMount`, then `restore` once the page is drawn in full. Only the page that
 * was loaded gets its scroll back, and only once, so later visits in the same tab start at the top.
 */
export function keepReloadScroll(): { restore(): void; stop(): void } {
	const saved = offered ? null : sessionStorage.getItem(KEY);
	offered = true;
	const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];

	function save() {
		sessionStorage.setItem(KEY, JSON.stringify({ href: location.href, x: scrollX, y: scrollY }));
	}
	function saveWhenHidden() {
		if (document.visibilityState === 'hidden') save();
	}
	addEventListener('pagehide', save);
	document.addEventListener('visibilitychange', saveWhenHidden);

	return {
		restore() {
			if (!saved || !navigation || navigation.type === 'navigate') return;
			const { href, x, y } = JSON.parse(saved);
			if (href === location.href && href === navigation.name) scrollTo(x, y);
		},
		stop() {
			removeEventListener('pagehide', save);
			document.removeEventListener('visibilitychange', saveWhenHidden);
		}
	};
}
