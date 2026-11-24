<script lang="ts">
	import { formatTime, formatTimeRange } from '#lib/format.js';
	import {
		DAY_RULER_MINUTES,
		daySpans,
		dragSpan,
		overlapping,
		type DaySpan,
		type WorkLogEntry
	} from '#lib/worklog.js';
	import { Moon, TriangleAlert } from '@lucide/svelte';
	import { MediaQuery } from 'svelte/reactivity';

	type Block = Pick<WorkLogEntry, 'start' | 'end' | 'hours' | 'afterMidnight'>;

	let {
		logged,
		beside = [],
		block,
		onchange
	}: {
		/** The day's other entries. */
		logged: Block[];
		/** Work logged on the days either side that falls on this one, placed on its ruler. */
		beside?: DaySpan<Block>[];
		/** The block being entered, once it has both of its times. */
		block?: Block;
		/** Given the block's times as its ends are dragged, or all of it is moved, along the day. */
		onchange?: (times: { start: string; end: string }) => void;
	} = $props();

	const DAY = 24 * 60;
	const HOURS = DAY_RULER_MINUTES / 60;
	/** The hours marked along the ruler, between its ends. */
	const TICKS = Array.from({ length: HOURS - 1 }, (_, index) => index + 1);

	const spans = $derived(daySpans(block ? [...logged, block] : logged));
	const mine = $derived(spans.find((span) => span.entry === block));
	const others = $derived([...spans.filter((span) => span !== mine), ...beside]);

	type Part = 'start' | 'end' | 'move';
	/**
	 * The block as it is being dragged: where it was taken hold of, and where it is now. It is drawn
	 * from this until it is let go, so it stays under the finger whatever its new times make of it.
	 */
	let drag = $state.raw<{
		part: Part;
		x: number;
		grabbed: { from: number; to: number };
		from: number;
		to: number;
		/** Whether the pointer has gone far enough to mean a drag, not a tap. */
		pulled: boolean;
		/** What was said of the block when it was taken hold of. */
		said: string;
	}>();
	const shown = $derived(drag && mine ? { ...mine, from: drag.from, to: drag.to } : mine);
	const clashes = $derived(shown ? overlapping({ span: shown, spans: [...others, shown] }) : []);
	const hours = $derived(shown ? (shown.to - shown.from) / 60 : 0);
	/** What is wrong with the block, or worth knowing about it. */
	const note = $derived.by(() => {
		if (clashes.length > 1) return { clash: true, text: `Overlaps ${clashes.length} entries` };
		if (clashes.length === 1) {
			const [{ entry, to }] = clashes;
			return { clash: true, text: `Overlaps ${formatTimeRange(entry.start!, clock(to))}` };
		}
		if (shown && shown.from < DAY && shown.to > DAY) {
			return { clash: false, text: `Ends ${formatTime(clock(shown.to))} the next day` };
		}
		return undefined;
	});

	// The ruler's width, to turn a drag in pixels into minutes and to size what is taken hold of.
	let width = $state(0);
	// The length's own width, to keep all of it on the ruler however many figures it has.
	let lengthWidth = $state(0);
	const coarse = new MediaQuery('(pointer: coarse)');
	/**
	 * What is taken hold of: the block to move it, and a stretch at each end to resize it. A block
	 * too short to hold is given a middle wide enough, with its ends outside it.
	 */
	const grips = $derived.by(() => {
		if (!shown || !onchange || width === 0) return undefined;
		const px = (minutes: number) =>
			(Math.min(minutes, DAY_RULER_MINUTES) / DAY_RULER_MINUTES) * width;
		const [left, right] = [px(shown.from), px(shown.to)];
		const end = coarse.current ? 24 : 16;
		const inside = Math.min(Math.max((right - left - 12) / 2, 0), end / 2);
		const centre = (left + right) / 2;
		const from = Math.min(left + inside, centre - 6);
		const to = Math.max(right - inside, centre + 6);
		return {
			start: { left: from - end, width: end },
			move: { left: from, width: to - from },
			end: { left: to, width: end },
			// The ends are marked on a block long enough to show them.
			marked: right - left >= 20
		};
	});

	function grab(event: PointerEvent, part: Part) {
		if (!shown || event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = {
			part,
			x: event.clientX,
			grabbed: { from: shown.from, to: shown.to },
			from: shown.from,
			to: shown.to,
			pulled: false,
			said: note?.text ?? ''
		};
	}

	/** Whether the day would put a block where it was dragged to, and not on the other side of midnight. */
	function stays(span: { from: number; to: number }): boolean {
		const moved = { ...block, start: clock(span.from), end: clock(span.to) };
		return daySpans([...logged, moved]).some(
			(other) => other.entry === moved && other.from === span.from
		);
	}

	function pull(event: PointerEvent) {
		if (!drag || width === 0) return;
		// A tap moves the pointer a little too, and must leave the times as they were typed.
		if (!drag.pulled && Math.abs(event.clientX - drag.x) < 4) return;
		const moved = ((event.clientX - drag.x) / width) * DAY_RULER_MINUTES;
		const { grabbed, part } = drag;
		const end = part === 'start' ? grabbed.from : Math.min(grabbed.to, DAY_RULER_MINUTES);
		const wanted = part === 'move' ? moved : end + moved;
		// Where it is now, in the same terms, to come back toward when it cannot go all the way.
		const held =
			part === 'move' ? drag.from - grabbed.from : part === 'start' ? drag.from : drag.to;
		const back = Math.sign(held - wanted) * 15;
		let next = dragSpan({ span: grabbed, part, minutes: wanted });
		// It stops short of where it would be let go on the other side of midnight: the nearest place
		// it can be, as a quick drag skips over the ones between.
		for (let minutes = wanted; !stays(next); minutes += back) {
			if (back === 0 || (minutes - held) * back >= 0) return;
			next = dragSpan({ span: grabbed, part, minutes });
		}
		if (next.from === drag.from && next.to === drag.to) {
			if (!drag.pulled) drag = { ...drag, pulled: true };
			return;
		}
		drag = { ...drag, ...next, pulled: true };
		onchange?.({ start: clock(next.from), end: clock(next.to) });
	}

	/** A stretch of the ruler as CSS, cut off where the ruler ends. */
	function place({ from, to }: { from: number; to: number }): string {
		const left = Math.min(from, DAY_RULER_MINUTES);
		const right = Math.min(to, DAY_RULER_MINUTES);
		return `left:${(left / DAY_RULER_MINUTES) * 100}%;width:${((right - left) / DAY_RULER_MINUTES) * 100}%`;
	}

	const clock = (minutes: number) =>
		`${String(Math.floor((minutes % DAY) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
</script>

<!--
	The day as a strip with the block being entered drawn to scale on it, beside what is already
	logged: a start and an end are only numbers, and half an hour and half a day look alike as typed.
-->
<div class="space-y-1">
	<!--
		The block's length rides above it, so it is read where the eye and the finger already are. It
		stops at the ruler's ends rather than hang over them.
	-->
	<p class="relative h-5 text-sm leading-5">
		{#if shown && hours > 0}
			<span
				class={[
					'absolute -translate-x-1/2 font-display font-semibold whitespace-nowrap tabular-nums',
					!drag && 'motion-safe:transition-[left] motion-safe:duration-200 motion-safe:ease-out'
				]}
				bind:offsetWidth={lengthWidth}
				style:left="clamp({lengthWidth / 2}px, {((shown.from +
					Math.min(shown.to, DAY_RULER_MINUTES)) /
					2 /
					DAY_RULER_MINUTES) *
					100}%, 100% - {lengthWidth / 2}px)"
			>
				{+hours.toFixed(2)} h
			</span>
		{/if}
	</p>
	<!-- Dragging is one way to set the times; the fields above are the way by keyboard. -->
	<div aria-hidden="true">
		<div class="relative">
			<div class="relative h-8 overflow-hidden rounded-sm border border-input bg-card">
				<!-- Noon to midnight is tinted, so a block typed in the wrong half of the day is seen there. -->
				<div
					class="absolute inset-y-0 bg-primary/10"
					style:left="{(DAY / 2 / DAY_RULER_MINUTES) * 100}%"
					style:width="{(DAY / 2 / DAY_RULER_MINUTES) * 100}%"
				></div>
				<!--
				The small hours of the next morning, where a late night carries on: a morning, so not
				tinted, and ruled across so it is not taken for this one.
			-->
				<div
					class="absolute inset-y-0 right-0 bg-[repeating-linear-gradient(45deg,var(--input)_0_1.5px,transparent_1.5px_6px)]"
					style:width="{100 - (DAY / DAY_RULER_MINUTES) * 100}%"
				></div>
				{#each TICKS as hour (hour)}
					<div
						class={[
							'absolute bottom-0 border-l',
							hour === 24
								? 'top-0 border-rule/50'
								: hour % 6 === 0
									? 'h-3 border-muted-foreground/50'
									: 'h-1.5 border-muted-foreground/50'
						]}
						style:left="{(hour / HOURS) * 100}%"
					></div>
				{/each}
				{#each others as span (span.entry)}
					<div
						class="absolute inset-y-2 min-w-0.5 rounded-[2px] bg-muted-foreground/45"
						style={place(span)}
					></div>
				{/each}
				{#if shown}
					<div
						class={[
							'absolute inset-y-1 flex min-w-0.5 justify-between rounded-[2px] bg-primary px-[3px] py-1.5',
							!drag &&
								'motion-safe:transition-[left,width] motion-safe:duration-200 motion-safe:ease-out'
						]}
						style={place(shown)}
					>
						{#if grips?.marked}
							<div class="w-0.5 rounded-full bg-primary-foreground/60"></div>
							<div class="w-0.5 rounded-full bg-primary-foreground/60"></div>
						{/if}
					</div>
					{#each clashes as clash (clash.entry)}
						<div
							class="absolute inset-y-1 min-w-0.5 border-y-[3px] border-primary bg-[repeating-linear-gradient(135deg,var(--destructive)_0_2px,var(--card)_2px_5px)]"
							style={place({
								from: Math.max(shown.from, clash.from),
								to: Math.min(shown.to, clash.to)
							})}
						></div>
					{/each}
				{/if}
			</div>
			<!--
			Over the strip and a little taller, so each part is 40px to the finger. Dragging sideways is
			theirs; up and down still scrolls the page.
		-->
			<div class="absolute inset-x-px -inset-y-1 touch-pan-y select-none" bind:clientWidth={width}>
				{#if grips}
					{#each ['move', 'start', 'end'] as const as part (part)}
						<div
							role="presentation"
							class={[
								'absolute inset-y-0',
								part === 'move' ? (drag ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-ew-resize'
							]}
							style:left="{grips[part].left}px"
							style:width="{grips[part].width}px"
							onpointerdown={(event) => grab(event, part)}
							onpointermove={pull}
							onpointerup={() => (drag = undefined)}
							onpointercancel={() => (drag = undefined)}
							onlostpointercapture={() => (drag = undefined)}
						></div>
					{/each}
				{/if}
			</div>
		</div>
		<div class="relative h-4 text-xs leading-4 text-muted-foreground tabular-nums">
			{#each [6, 12, 18, 24] as hour (hour)}
				<span
					class="absolute -translate-x-1/2 whitespace-nowrap"
					style:left="{(hour / HOURS) * 100}%"
				>
					{formatTime(clock(hour * 60)).replace(':00', '')}
				</span>
			{/each}
		</div>
	</div>
	<!-- Always a line, so the form does not move as the times are typed. -->
	<p class="min-h-lh text-sm">
		{#if note}
			<span
				aria-hidden="true"
				class={[
					'inline-flex items-baseline gap-1.5',
					note.clash ? 'text-destructive' : 'text-muted-foreground'
				]}
			>
				{#if note.clash}
					<TriangleAlert size={14} class="shrink-0 translate-y-0.5" />
				{:else}
					<Moon size={14} class="shrink-0 translate-y-0.5" />
				{/if}
				<span>{note.text}</span>
			</span>
		{/if}
		<!-- Said once the block is let go, not at each step of a drag across the day. -->
		<span class="sr-only" aria-live="polite">{drag ? drag.said : (note?.text ?? '')}</span>
	</p>
</div>
