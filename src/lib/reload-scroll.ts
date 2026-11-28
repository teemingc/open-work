const KEY = 'reload:scroll';
/** How long after the installed app was left that opening it again counts as coming back to it. */
const RESUME_MS = 30 * 60 * 1000;
/** How long the page is given to reach its full height. */
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
 * only once, so later visits in the same tab start at the top.
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
	function saveWhenHidden() {
		if (document.visibilityState === 'hidden') save();
	}
	addEventListener('pagehide', save);
	document.addEventListener('visibilitychange', saveWhenHidden);

	let settled = () => {};

	return {
		restore() {
			if (!saved) return;
			const { x, y } = saved;
			saved = undefined;
			scrollTo(x, y);
			// Charts and the rest of a long list are still to be drawn, and Safari does not hold the
			// scroll in place as the page grows, so put it back each time until you take over.
			const observer = new ResizeObserver(() => scrollTo(x, y));
			observer.observe(document.body);
			const taken = ['touchstart', 'wheel', 'keydown', 'pointerdown'] as const;
			const timer = setTimeout(() => settled(), SETTLE_MS);
			settled = () => {
				observer.disconnect();
				clearTimeout(timer);
				for (const type of taken) removeEventListener(type, settled);
			};
			for (const type of taken) addEventListener(type, settled, { passive: true });
		},
		stop() {
			settled();
			removeEventListener('pagehide', save);
			document.removeEventListener('visibilitychange', saveWhenHidden);
		}
	};
}
