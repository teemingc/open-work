import { toIsoDate } from '#lib/format.js';
import { on } from 'svelte/events';
import { createSubscriber } from 'svelte/reactivity';

const subscribe = createSubscriber((update) => {
	let timer: ReturnType<typeof setTimeout>;
	function untilMidnight() {
		const now = new Date();
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		timer = setTimeout(() => {
			update();
			untilMidnight();
		}, midnight.getTime() - now.getTime());
	}
	untilMidnight();
	// A timer can fire late after the computer sleeps, so coming back to the tab checks too.
	const off = on(document, 'visibilitychange', update);
	return () => {
		clearTimeout(timer);
		off();
	};
});

/** Today's date, kept current while it is read, so a tab left open overnight moves on to the new day. */
export function today(): string {
	subscribe();
	return toIsoDate(new Date());
}
