<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { RangeCalendar } from '#lib/components/ui/range-calendar/index.js';
	import { parseIsoDate } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { groupDaysOff, weekdaysBetween, type DayOffRange } from '#lib/worklog.js';
	import { parseDate } from '@internationalized/date';
	import { CalendarRange, Plus, Trash2 } from '@lucide/svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { DateRange } from 'bits-ui';

	let { store, year }: { store: WorkLogStore; year: string } = $props();

	const id = $props.id();
	const ranges = $derived(
		groupDaysOff(store.data.leave).filter(
			(range) => range.from.startsWith(year) || range.to.startsWith(year)
		)
	);

	const short = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short' });
	const long = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

	function label(range: { from: string; to: string }): string {
		if (range.from === range.to) return long.format(parseIsoDate(range.from));
		return `${short.format(parseIsoDate(range.from))} – ${long.format(parseIsoDate(range.to))}`;
	}

	function toRange(range: DateRange | undefined): { from: string; to: string } | undefined {
		if (!range?.start) return undefined;
		const from = range.start.toString();
		return { from, to: range.end?.toString() ?? from };
	}

	/** Two months fit side by side from this width (see range-calendar-months.svelte). */
	const twoMonths = new MediaQuery('min-width: 32rem');
	let picked = $state<DateRange | undefined>();
	let note = $state('');
	let pickerOpen = $state(false);
	const pickedRange = $derived(toRange(picked));
	const pickedDays = $derived(pickedRange ? weekdaysBetween(pickedRange) : []);

	function add() {
		if (pickedDays.length === 0) return;
		store.addDaysOff({
			kind: 'leave',
			days: pickedDays.map((date) => ({ date, name: note.trim() }))
		});
		picked = undefined;
		note = '';
	}

	/** Move a stretch of leave to new dates, keeping its note. */
	function move(range: DayOffRange, next: DateRange | undefined) {
		const dates = toRange(next);
		if (!dates || !next?.end) return;
		store.replaceDaysOff({
			kind: 'leave',
			dates: range.dates,
			days: weekdaysBetween(dates).map((date) => ({ date, name: range.name }))
		});
	}

	function rename(range: DayOffRange, name: string) {
		store.replaceDaysOff({
			kind: 'leave',
			dates: range.dates,
			days: range.dates.map((date) => ({ date, name }))
		});
	}
</script>

<div class="space-y-3">
	{#if ranges.length === 0}
		<p class="text-sm text-muted-foreground">No leave in {year} yet.</p>
	{:else}
		<ul class="ledger-rows overflow-hidden rounded-lg border bg-card" aria-label="Leave in {year}">
			{#each ranges as range (range.from)}
				<li class="flex flex-wrap items-center gap-2 p-2">
					<Popover.Root>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									class="justify-start font-normal tabular-nums"
									aria-label="Change the dates of {label(range)}"
								>
									<CalendarRange />
									{label(range)}
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content class="w-auto p-0" align="start">
							<RangeCalendar
								value={{ start: parseDate(range.from), end: parseDate(range.to) }}
								onValueChange={(next) => move(range, next)}
								placeholder={parseDate(range.from)}
							/>
						</Popover.Content>
					</Popover.Root>
					<span class="text-sm text-muted-foreground tabular-nums">
						{range.dates.length}
						{range.dates.length === 1 ? 'day' : 'days'}
					</span>
					<Input
						aria-label="Note for {label(range)}"
						class="min-w-32 flex-1"
						value={range.name}
						placeholder="Note (optional)"
						onchange={(event) => rename(range, event.currentTarget.value.trim())}
					/>
					<Button
						variant="ghost"
						size="icon"
						class="size-8"
						aria-label="Remove leave on {label(range)}"
						onclick={() => store.replaceDaysOff({ kind: 'leave', dates: range.dates, days: [] })}
					>
						<Trash2 size={14} />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	<form
		class="flex flex-wrap items-end gap-2"
		onsubmit={(event) => {
			event.preventDefault();
			add();
		}}
	>
		<div class="space-y-1.5">
			<Label for="{id}-range">Days off</Label>
			<Popover.Root bind:open={pickerOpen}>
				<Popover.Trigger id="{id}-range">
					{#snippet child({ props })}
						<Button {...props} variant="outline" class="w-64 justify-start font-normal">
							<CalendarRange />
							{#if pickedRange}
								{label(pickedRange)}
							{:else}
								<span class="text-muted-foreground">Pick the first and last day</span>
							{/if}
						</Button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content class="w-auto p-0" align="start">
					<RangeCalendar
						bind:value={picked}
						numberOfMonths={twoMonths.current ? 2 : 1}
						onValueChange={(next) => {
							if (next?.start && next.end) pickerOpen = false;
						}}
					/>
				</Popover.Content>
			</Popover.Root>
		</div>
		<div class="min-w-40 flex-1 space-y-1.5">
			<Label for="{id}-note">Note</Label>
			<Input id="{id}-note" bind:value={note} placeholder="Optional" />
		</div>
		<Button type="submit" variant="outline" disabled={pickedDays.length === 0}>
			<Plus />
			{pickedDays.length > 0
				? `Add ${pickedDays.length} ${pickedDays.length === 1 ? 'day' : 'days'}`
				: 'Add leave'}
		</Button>
	</form>
	<p class="text-xs text-muted-foreground">Weekends in the range are skipped.</p>
</div>
