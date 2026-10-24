import { on } from 'svelte/events';

/**
 * Links a chart's points to a page on Open Collective. With a mouse, clicking a point opens it in a
 * new tab. On touch screens, where there's no hover, a tap pins the point's tooltip with the link in
 * it instead; the next tap on the chart, one anywhere else but the tooltip, or Escape lets it go.
 * Pass `click` as the chart's `onTooltipClick`, `locked` to its tooltip context and `href` to its
 * tooltip.
 *
 * The link is in the tooltip from the moment a tap shows it, not only once the tap pins it: the
 * tooltip shows as the finger touches, but the click that pins it waits for the finger to lift.
 */
export class TooltipLink<T> {
	/** A point's page, or nothing for one with nothing to link to. */
	readonly url: (data: T) => string | undefined;
	/** Whether the tooltip is pinned. */
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
		if (this.locked) {
			this.unpin();
			return;
		}
		const url = this.url(data);
		if (!url) return;
		if (matchMedia('(hover: hover)').matches) {
			window.open(url, '_blank', 'noopener');
			return;
		}
		this.locked = true;
		this.#onpin?.(data);
		const chart = (event.target as Element).closest('[data-slot="chart"]');
		const offs = [
			on(document, 'pointerdown', (event) => {
				const target = event.target as Element;
				// A tap on the chart already unpins through `click`.
				if (!chart?.contains(target) && !target.closest('.lc-tooltip-root')) this.unpin();
			}),
			on(document, 'keydown', (event) => {
				if (event.key === 'Escape') this.unpin();
			})
		];
		this.#stopListening = () => offs.forEach((off) => off());
	};

	unpin() {
		if (this.locked) this.#onpin?.(undefined);
		this.locked = false;
		this.#stopListening?.();
		this.#stopListening = undefined;
	}
}
