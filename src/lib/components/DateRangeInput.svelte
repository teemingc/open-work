<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { RangeCalendar } from '#lib/components/ui/range-calendar/index.js';
	import { cn } from '#lib/utils.js';
	import { parseDate } from '@internationalized/date';
	import { CalendarRange } from '@lucide/svelte';
	import { DateRangeField, type DateRange } from 'bits-ui';
	import { MediaQuery } from 'svelte/reactivity';

	let {
		start,
		end,
		onchange,
		label,
		class: className
	}: {
		/** ISO dates, like 2026-10-01; empty for none yet. */
		start?: string;
		end?: string;
		/** Called once both days are known, the last on or after the first. */
		onchange: (range: { start: string; end: string }) => void;
		/** Shown above the field, and names it to screen readers. */
		label: string;
		class?: string;
	} = $props();

	// Follows `start` and `end`, and holds a range typed or picked halfway until it is whole.
	let range = $derived<DateRange>({
		start: start ? parseDate(start) : undefined,
		end: end ? parseDate(end) : undefined
	});
	let open = $state(false);
	/** Two months fit side by side from this width (see range-calendar-months.svelte). */
	const twoMonths = new MediaQuery('min-width: 32rem');

	function settle(next: DateRange | undefined) {
		if (!next?.start || !next.end || next.end.compare(next.start) < 0) return;
		onchange({ start: next.start.toString(), end: next.end.toString() });
	}
</script>

<!-- Days you type or pick; the field's own label, as a group of segments has no single input. -->
<DateRangeField.Root
	bind:value={range}
	locale="en-GB"
	onValueChange={settle}
	class={cn('space-y-1.5', className)}
>
	<DateRangeField.Label class="block text-sm leading-none font-medium select-none">
		{label}
	</DateRangeField.Label>
	<div
		class="flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-card ps-3 pe-1 text-sm tabular-nums transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 max-[22.4375rem]:ps-2 max-[22.4375rem]:text-xs sm:w-fit"
	>
		{#each ['start', 'end'] as const as type (type)}
			{#if type === 'end'}<span aria-hidden="true" class="text-muted-foreground">–</span>{/if}
			<DateRangeField.Input {type} class="flex items-center">
				{#snippet children({ segments })}
					{#each segments as { part, value }, index (index)}
						<DateRangeField.Segment
							{part}
							class={[
								'rounded-sm px-px outline-none focus:bg-accent focus:text-accent-foreground data-placeholder:text-muted-foreground',
								part === 'literal' && 'px-0 text-muted-foreground'
							]}
						>
							{value}
						</DateRangeField.Segment>
					{/each}
				{/snippet}
			</DateRangeField.Input>
		{/each}
		<Popover.Root bind:open>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon" class="ms-auto size-7">
						<CalendarRange />
						<span class="sr-only">Pick {label.toLowerCase()} on a calendar</span>
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-auto p-0" align="end">
				<RangeCalendar
					bind:value={range}
					placeholder={range.start}
					numberOfMonths={twoMonths.current ? 2 : 1}
					onValueChange={(next) => {
						if (next?.start && next.end) {
							settle(next);
							open = false;
						}
					}}
				/>
			</Popover.Content>
		</Popover.Root>
	</div>
</DateRangeField.Root>
