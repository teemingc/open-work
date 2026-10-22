import { on } from 'svelte/events';

/**
 * Links a chart's points to a page on Open Collective. With a mouse, clicking a point opens it in a
 * new tab. On touch screens, where there's no hover, a tap pins the point's tooltip with the link in
 * it instead; the next tap on the chart, one anywhere else but the tooltip, or Escape lets it go.
 * Pass `click` as the chart's `onTooltipClick`, `locked` to its tooltip context and `href` to its
 * tooltip.
 */
export class TooltipLink<T> {
	#url: (data: T) => string | undefined;
	/** The point the tooltip is pinned to. */
	data = $state<T>();
	#handled: Event | undefined;
	#stopListening: (() => void) | undefined;

	/** @param url A point's page, or nothing for one with nothing to link to. */
	constructor(url: (data: T) => string | undefined) {
		this.#url = url;
	}

	/** The pinned point's link. */
	get href() {
		return this.data === undefined ? undefined : this.#url(this.data);
	}

	get locked() {
		return this.data !== undefined;
	}

	click = (event: MouseEvent, { data }: { data: T }) => {
		// On band charts LayerChart calls `onTooltipClick` from the bar and again as the click bubbles
		// to the chart, so one click would act twice without this.
		if (event === this.#handled) return;
		this.#handled = event;
		if (this.locked) {
			this.unpin();
			return;
		}
		const url = this.#url(data);
		if (!url) return;
		if (matchMedia('(hover: hover)').matches) {
			window.open(url, '_blank', 'noopener');
			return;
		}
		this.data = data;
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
		this.data = undefined;
		this.#stopListening?.();
		this.#stopListening = undefined;
	}
}
