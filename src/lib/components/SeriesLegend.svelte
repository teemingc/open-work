<script lang="ts" module>
	import { cubicInOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';

	let toggledAt = -Infinity;

	/**
	 * Eases the categories left on show into place after one is hidden or brought back, so the eye
	 * can follow each bar as the stack closes up. Every other change, from the chart first drawing
	 * to the page resizing, lands at once.
	 */
	export const legendMotion = {
		type: 'tween',
		duration: () =>
			!prefersReducedMotion.current && performance.now() - toggledAt < 100 ? 250 : 0,
		easing: cubicInOut
	} as const;
</script>

<script lang="ts">
	import type { getChartContext } from 'layerchart';
	import { Legend, type LegendProps } from 'layerchart/svg';

	/**
	 * The chart comes from the `legend` snippet rather than `getChartContext`, which can resolve to a
	 * different copy of LayerChart from the one drawing the chart.
	 */
	let { context, ...props }: LegendProps & { context: ReturnType<typeof getChartContext> } =
		$props();

	/**
	 * Tapping a category hides it and tapping it again brings it back, as in Chart.js and Google
	 * Charts. LayerChart's own legend shows only the tapped category instead.
	 *
	 * The selection holds the categories on show, and an empty one shows them all, so the last
	 * category left stays put rather than bringing every other one back.
	 *
	 * Returns `true` because the legend runs its own handler too whenever ours returns nothing.
	 */
	function hide(key: string) {
		const selected = context.series.selectedKeys;
		const keys = context.series.series.map((series) => series.key);
		const shown = keys.filter((k) => selected.isEmpty() || selected.isSelected(k));
		if (!shown.includes(key)) {
			shown.push(key);
		} else if (shown.length > 1) {
			shown.splice(shown.indexOf(key), 1);
		}
		toggledAt = performance.now();
		selected.current = shown.length === keys.length ? [] : shown;
		return highlight(key);
	}

	/** Hovering a category picks it out from the rest, unless it is hidden. */
	function highlight(key: string) {
		context.series.highlightKey = context.series.isVisible(key) ? key : null;
		return true;
	}
</script>

<Legend
	onclick={(_, item) => hide(item.value)}
	onpointerenter={(_, item) => highlight(item.value)}
	{...props}
/>
