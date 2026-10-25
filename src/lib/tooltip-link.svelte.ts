import { on } from 'svelte/events';

/**
 * Links a chart's points to a page on Open Collective. With a mouse, clicking a point opens it in a
 * new tab. On touch screens, where there's no hover, the tooltip carries the link instead: it shows
 * from the moment a finger touches the chart, and the tooltip it's in pins once the finger lifts, a
 * tap's or a scrub's, so the link can be tapped. Touching the chart again unpins it, so the finger
 * scrubs to another point, which pins in turn; a tap anywhere else, the page scrolling or Escape lets
 * it go. Pass `click` as the chart's `onTooltipClick`, `locked` to its tooltip context and the link
 * to its tooltip.
 *
 * The chart's container clicks the point a finger lifts from, and drops the click that follows,
 * which could otherwise land on the tooltip once it pins and open the page on the first tap.
 */
export class TooltipLink<T> {
	/** A point's page, or nothing for one with nothing to link to. */
	readonly url: (data: T) => string | undefined;
	/** Whether the tooltip is pinned, and its link can be tapped. */
	locked = $state(false);
	#handled: Event | undefined;
	#stopListening: (() => void) | undefined;
	#onpin: ((data: T | undefined) => void) | undefined;

	/**
	 * @param url A point's page, or nothing for one with nothing to link to.
	 * @param onpin Told the point a tap pins, and nothing once it is let go.
	 */
	constructor(url: (data: T) => string | undefined, onpin?: (data: T | undefined) => void) {
		this.url = url;
		this.#onpin = onpin;
	}

	/** The link in the tooltip for a point: none with a mouse, which opens it with a click instead. */
	href = (data: T) => (matchMedia('(hover: hover)').matches ? undefined : this.url(data));

	click = (event: MouseEvent, { data }: { data: T }) => {
		// On band charts LayerChart calls `onTooltipClick` from the bar and again as the click bubbles
		// to the chart, so one click would act twice without this.
		if (event === this.#handled) return;
		this.#handled = event;
		const url = this.url(data);
		if (matchMedia('(hover: hover)').matches) {
			if (url) window.open(url, '_blank', 'noopener');
			return;
		}
		if (!url) {
			this.unpin();
			return;
		}
		this.locked = true;
		this.#onpin?.(data);
		this.#stopListening ??= this.#listen();
	};

	#listen() {
		const offs = [
			// Before LayerChart sees the touch, which it would ignore while pinned. Touching the chart
			// again unpins too, so the finger scrubs, until it lifts from wherever it got to.
			on(document, 'pointerover', (event) => {
				if (!(event.target as Element).closest('.lc-tooltip-root')) this.unpin();
			}),
			on(window, 'scroll', () => this.unpin()),
			on(document, 'keydown', (event) => {
				if (event.key === 'Escape') this.unpin();
			})
		];
		return () => offs.forEach((off) => off());
	}

	unpin() {
		if (this.locked) this.#onpin?.(undefined);
		this.locked = false;
		this.#stopListening?.();
		this.#stopListening = undefined;
	}
}
