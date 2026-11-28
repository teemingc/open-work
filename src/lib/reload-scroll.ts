const KEY = 'reload:scroll';
/** How long after the installed app was left that opening it again counts as coming back to it. */
const RESUME_MS = 30 * 60 * 1000;
/** How long the page is given to reach its full height, or to settle on the way back. */
const SETTLE_MS = 3000;

interface Saved {
	href: string;
	x: number;
	y: number;
	at: number;
}

/** Whether a page has already been offered the scroll kept from before this load. */
let offered = false;

function read(storage: Storage): Saved | undefined {
	try {
		const saved = storage.getItem(KEY);
		return saved ? JSON.parse(saved) : undefined;
	} catch {
		// Storage blocked or not ours: nothing was kept.
		return undefined;
	}
}

/**
 * Keeps the scroll over a reload for a page that waits on the work log. SvelteKit puts the scroll
 * back before the log arrives from IndexedDB, while the shorter skeleton is showing, so the page
 * can't reach it. The scroll is kept as the page is hidden as well as when it unloads, because iOS
 * drops a home-screen app left in the background without unloading it, and loads it again on the
 * way back: as a reload, or from the start, which only localStorage outlives. Call from `onMount`,
 * then `restore` once the page is drawn. Only the page that was loaded gets its scroll back, and
 * only once, so later visits in the same tab start at the top. A page hidden and shown again
 * without a load in between is also put back where it was.
 */
export function keepReloadScroll(): { restore(): void; stop(): void } {
	const installed = matchMedia('(display-mode: standalone)').matches;
	const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
	let saved: Saved | undefined;
	if (!offered && navigation) {
		const reloaded = navigation.type === 'navigate' ? undefined : read(sessionStorage);
		const resumed = installed ? read(localStorage) : undefined;
		saved = reloaded ?? (resumed && Date.now() - resumed.at < RESUME_MS ? resumed : undefined);
		if (saved?.href !== location.href || saved.href !== navigation.name) saved = undefined;
	}
	offered = true;

	function save() {
		const value = JSON.stringify({
			href: location.href,
			x: scrollX,
			y: scrollY,
			at: Date.now()
		} satisfies Saved);
		try {
			sessionStorage.setItem(KEY, value);
			if (installed) localStorage.setItem(KEY, value);
		} catch {
			// Storage blocked or full: the page opens at the top.
		}
	}
	let settled = () => {};

	/**
	 * Puts the scroll back, and again each time the page grows or something other than you moves
	 * it, until you take over. Charts and the rest of a long list are drawn after the page, and
	 * Safari does not hold the scroll in place as the page grows.
	 */
	function hold({ x, y }: { x: number; y: number }) {
		settled();
		const put = () => {
			if (scrollX !== x || scrollY !== y) scrollTo(x, y);
		};
		put();
		const observer = new ResizeObserver(put);
		observer.observe(document.body);
		const taken = ['touchstart', 'wheel', 'keydown', 'pointerdown'] as const;
		const timer = setTimeout(() => settled(), SETTLE_MS);
		settled = () => {
			observer.disconnect();
			clearTimeout(timer);
			removeEventListener('scroll', put);
			for (const type of taken) removeEventListener(type, settled);
			settled = () => {};
		};
		addEventListener('scroll', put, { passive: true });
		for (const type of taken) addEventListener(type, settled, { passive: true });
	}

	/** Where the page was when it was hidden, while it stays loaded. */
	let hidden: { x: number; y: number } | undefined;

	// An iPhone brings the installed app back from another app without loading it again, but with
	// the page some 100 to 200px higher, so it is put back where it was left.
	function onVisibility() {
		if (document.visibilityState === 'hidden') {
			settled();
			hidden = { x: scrollX, y: scrollY };
			save();
		} else if (hidden) {
			hold(hidden);
		}
	}
	addEventListener('pagehide', save);
	document.addEventListener('visibilitychange', onVisibility);

	return {
		restore() {
			if (!saved) return;
			hold(saved);
			saved = undefined;
		},
		stop() {
			settled();
			removeEventListener('pagehide', save);
			document.removeEventListener('visibilitychange', onVisibility);
		}
	};
}
