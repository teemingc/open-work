<script lang="ts">
	import { cn, type WithElementRef } from '#lib/utils.js';
	import ChartStyle from './chart-style.svelte';
	import { setChartContext, type ChartConfig } from './chart-utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	const uid = $props.id();

	let {
		ref = $bindable(null),
		id = uid,
		class: className,
		children,
		config,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		config: ChartConfig;
	} = $props();

	const chartId = $derived(`chart-${id || uid.replace(/:/g, '')}`);

	setChartContext({
		get config() {
			return config;
		}
	});

	/** Elements a touch left while their tooltip stays up, to hide it later. */
	let held: EventTarget[] = [];

	/** Hides a tooltip a tap left up, by letting its held back `pointerleave` through as a mouse's. */
	function release() {
		for (const target of held)
			target.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		held = [];
	}

	/** Whether a finger lifting from the chart already clicked it, so the click after it is dropped. */
	let lifted = false;

	/**
	 * Keeps a finger scrubbing across the chart from scrolling the page as it drifts up or down,
	 * which would cancel its pointer and end the scrub midway. A drag that starts out mostly
	 * sideways scrubs until the finger lifts; one that starts out mostly up or down scrolls the page.
	 * Svelte's touch handlers are passive and can't stop the scroll, so listen directly.
	 */
	function holdScrub(node: HTMLElement) {
		let start: { x: number; y: number } | undefined;
		let scrubbing: boolean | undefined;

		function down(event: TouchEvent) {
			const [touch] = event.touches;
			start = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : undefined;
			scrubbing = undefined;
		}

		function move(event: TouchEvent) {
			if (!start) return;
			if (scrubbing === undefined) {
				const [touch] = event.touches;
				const dx = Math.abs(touch.clientX - start.x);
				const dy = Math.abs(touch.clientY - start.y);
				// Wait out the jitter of a finger settling before telling which way it's going
				if (dx < 4 && dy < 4) return;
				scrubbing = dx > dy;
			}
			if (scrubbing && event.cancelable) event.preventDefault();
		}

		node.addEventListener('touchstart', down, { passive: true });
		node.addEventListener('touchmove', move, { passive: false });
		return () => {
			node.removeEventListener('touchstart', down);
			node.removeEventListener('touchmove', move);
		};
	}
</script>

<!-- A tooltip a tap left up would otherwise stay over the page as it scrolls, or after tapping elsewhere. -->
<svelte:window
	onscroll={release}
	onclickcapture={(event) => {
		if (!lifted) return;
		lifted = false;
		// Shown under the finger and pinned by the lift, the tooltip's link could otherwise take it
		event.preventDefault();
		event.stopPropagation();
	}}
/>
<svelte:document
	onpointerdown={(event) => {
		lifted = false;
		// Shown over the page rather than in the chart, a tooltip has to stay up for its link to be tapped
		const target = event.target as Element;
		if (!ref?.contains(target) && !target.closest('.lc-tooltip-root')) release();
	}}
/>

<div
	bind:this={ref}
	data-chart={chartId}
	data-slot="chart"
	{@attach holdScrub}
	class={cn(
		'flex aspect-video justify-center overflow-visible text-xs',
		// Pressing and dragging across a chart scrubs its tooltip, so don't select text or open the
		// iOS callout menu instead
		'select-none [-webkit-touch-callout:none]',
		// Overrides
		//
		// Stroke around dots/marks when hovering
		'[&_.lc-highlight-point]:stroke-transparent',
		// override the default stroke color of lines
		'[&_.lc-line]:stroke-border/50',

		// by default, layerchart shows a line intersecting the point when hovering, this hides that
		'[&_.lc-highlight-line]:stroke-0',

		// by default, when you hover a point on a stacked series chart, it will drop the opacity
		// of the other series, this overrides that
		'[&_.lc-area-path]:opacity-100 [&_.lc-highlight-line]:opacity-100 [&_.lc-highlight-point]:opacity-100 [&_.lc-spline-path]:opacity-100 [&_.lc-text]:text-xs [&_.lc-text-svg]:overflow-visible',

		// We don't want the little tick lines between the axis labels and the chart, so we remove
		// the stroke. The alternative is to manually disable `tickMarks` on the x/y axis of every
		// chart.
		'[&_.lc-axis-tick]:stroke-0',

		// We don't want to display the rule on the x/y axis, as there is already going to be
		// a grid line there and rule ends up overlapping the marks because it is rendered after
		// the marks
		'[&_.lc-rule-x-line:not(.lc-grid-x-rule)]:stroke-0 [&_.lc-rule-y-line:not(.lc-grid-y-rule)]:stroke-0',
		'[&_.lc-grid-x-radial-circle]:stroke-border [&_.lc-grid-x-radial-line]:stroke-border',
		'[&_.lc-grid-y-radial-circle]:stroke-border [&_.lc-grid-y-radial-line]:stroke-border',

		// Legend adjustments
		'[&_.lc-legend-swatch-button]:items-center [&_.lc-legend-swatch-button]:gap-1.5',
		'[&_.lc-legend-swatch-group]:items-center [&_.lc-legend-swatch-group]:gap-4',
		'[&_.lc-legend-swatch]:size-2.5 [&_.lc-legend-swatch]:rounded-[2px]',

		// Labels
		'[&_.lc-labels-text:not([fill])]:fill-foreground [&_text]:stroke-transparent',

		// Tick labels on th x/y axes
		'[&_.lc-axis-tick-label]:fill-muted-foreground [&_.lc-axis-tick-label]:font-normal',
		'[&_.lc-tooltip-rects-g]:fill-transparent',
		'[&_.lc-layout-svg-g]:fill-transparent',
		'[&_.lc-root-container]:w-full',
		className
	)}
	onpointerleavecapture={(event) => {
		// A touch pointer leaves as soon as the finger lifts, which would hide the tooltip a tap
		// just showed. Keep it until the next tap moves it, the page scrolls or a tap lands elsewhere.
		if (event.pointerType !== 'mouse' && event.target) {
			event.stopPropagation();
			held.push(event.target);
		}
	}}
	onpointerup={(event) => {
		// A finger lifting after scrubbing across the chart makes no click, and a tap's comes only
		// after a delay, so click the point it lifts from now: a tooltip with a link pins.
		// Not with a mouse at hand, where a click opens the page, which a made-up click can't do.
		const target = event.target as Element;
		if (event.pointerType === 'mouse' || matchMedia('(hover: hover)').matches) return;
		if (!target.closest('.lc-tooltip-context')) return;
		const { clientX, clientY } = event;
		target.dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY })
		);
		lifted = true;
	}}
	{...restProps}
>
	<ChartStyle id={chartId} {config} />
	{@render children?.()}
</div>
