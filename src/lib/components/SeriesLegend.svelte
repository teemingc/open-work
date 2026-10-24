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
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { cn } from '#lib/utils.js';
	import { Legend, type LegendProps } from 'layerchart/svg';
	import type { Snippet } from 'svelte';

	/**
	 * The chart comes from the `legend` snippet rather than `getChartContext`, which can resolve to a
	 * different copy of LayerChart from the one drawing the chart.
	 */
	let {
		context,
		classes,
		details,
		...props
	}: LegendProps & {
		context: ReturnType<typeof getChartContext>;
		/** More about a category, like what was spent on it, shown beside it in the legend. */
		details?: Snippet<[key: string]>;
	} = $props();

	let detailsOpen = $state(false);
	/** The category whose details are open, and its legend item, which they sit beside. */
	let detailsKey = $state<string>();
	let anchor = $state<HTMLElement | null>(null);
	/** Opened by a tap, which can no longer hide the category, so the details offer to instead. */
	let tapped = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** Opens or closes the details after a moment, so passing over the category does nothing. */
	function showDetails(open: boolean, delay: number) {
		clearTimeout(timer);
		timer = setTimeout(() => (detailsOpen = open), delay);
	}

	/** A mouse, rather than a finger or a pen, which have no hover. */
	const isMouse = (e: MouseEvent) => (e as PointerEvent).pointerType === 'mouse';

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

<!--
	A grey background on the category under the pointer, as on the rows beside the backer squares,
	so hovering shows which one a tap will hide. Padding takes the place of most of the gap between.
-->
<!--
	With details, hovering a category with a mouse opens them, and clicking still hides it. On a touch
	screen, with no hover, tapping it opens them instead, with a button there to hide it.
-->
<Legend
	onclick={(e, item) => {
		if (details && e.detail !== 0 && !isMouse(e)) {
			const same = detailsOpen && detailsKey === item.value;
			detailsKey = item.value;
			anchor = e.currentTarget as HTMLElement;
			tapped = true;
			detailsOpen = !same;
			return true;
		}
		return hide(item.value);
	}}
	onpointerenter={(e, item) => {
		if (details && isMouse(e)) {
			detailsKey = item.value;
			anchor = e.currentTarget as HTMLElement;
			tapped = false;
			showDetails(true, 200);
		}
		return highlight(item.value);
	}}
	onpointerleave={(e) => {
		if (details && isMouse(e)) showDetails(false, 200);
	}}
	classes={{
		...classes,
		items: cn('gap-x-1', classes?.items),
		item: 'rounded-md px-2 py-0.5 transition-colors hover:bg-muted focus-visible:bg-muted'
	}}
	{...props}
/>

{#if details}
	<Popover.Root bind:open={detailsOpen}>
		<Popover.Content
			customAnchor={anchor}
			class="w-72 p-2 text-sm"
			onOpenAutoFocus={(e) => e.preventDefault()}
			onpointerenter={() => clearTimeout(timer)}
			onpointerleave={(e) => isMouse(e) && showDetails(false, 200)}
		>
			{#if detailsKey !== undefined}
				{@render details(detailsKey)}
				{#if tapped}
					{@const key = detailsKey}
					<Button
						variant="outline"
						size="sm"
						class="mt-2 w-full"
						onclick={() => {
							hide(key);
							detailsOpen = false;
						}}
					>
						{context.series.isVisible(key) ? 'Hide' : 'Show'}
					</Button>
				{/if}
			{/if}
		</Popover.Content>
	</Popover.Root>
{/if}
