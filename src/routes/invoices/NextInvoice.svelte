<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { RangeCalendar } from '#lib/components/ui/range-calendar/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { addDays, formatDMY } from '#lib/format.js';
	import type { Client } from '#lib/worklog.js';
	import { parseDate } from '@internationalized/date';
	import { CalendarRange, Undo2 } from '@lucide/svelte';
	import type { DateRange } from 'bits-ui';
	import { MediaQuery } from 'svelte/reactivity';

	let {
		client,
		period,
		pending = false,
		failed = false,
		today,
		showName = false
	}: {
		client?: Client;
		/** The suggested dates, following the last invoice. */
		period?: { startDate: string; endDate: string };
		/** Waiting for the last invoice, which the suggestion follows. */
		pending?: boolean;
		/** The last invoice is unknown, so there is no suggestion and the dates must be picked. */
		failed?: boolean;
		today: string;
		showName?: boolean;
	} = $props();

	/** Dates you picked instead of the suggested ones. */
	let picked = $state<DateRange | undefined>();
	let open = $state(false);
	/** Two months fit side by side from this width (see range-calendar-months.svelte). */
	const twoMonths = new MediaQuery('min-width: 32rem');

	const suggested = $derived(failed ? undefined : period);
	const chosen = $derived(
		picked?.start && picked.end
			? { startDate: picked.start.toString(), endDate: picked.end.toString() }
			: suggested
	);
	const due = $derived(chosen !== undefined && chosen.endDate < today);
	const labelId = $props.id();
</script>

<form
	method="GET"
	action={resolve('/invoices/new')}
	class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
>
	{#if chosen}
		<input type="hidden" name="start" value={chosen.startDate} />
		<input type="hidden" name="end" value={chosen.endDate} />
	{/if}
	{#if client}<input type="hidden" name="client" value={client.id} />{/if}
	<div>
		{#if client && showName}
			<h3 id={labelId} class="font-medium">{client.name}</h3>
		{/if}
		{#if pending}
			<Skeleton class="mt-1 h-10 w-96 max-w-full" />
		{:else}
			<Popover.Root bind:open>
				<Popover.Trigger>
					{#snippet child({ props })}
						{#if chosen}
							<!-- The dates are the picker, so changing them happens where you read them. -->
							<button
								{...props}
								type="button"
								class="group -mx-1.5 mt-0.5 block w-fit animate-in rounded-md px-1.5 py-0.5 text-left font-display text-2xl duration-300 outline-none fade-in hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-3xl"
								aria-label="Change dates, {formatDMY(chosen.startDate)} to {formatDMY(
									chosen.endDate
								)}"
							>
								<!-- On a narrow screen the end date wraps onto its own line rather than overflowing. -->
								<span class="whitespace-nowrap">{formatDMY(chosen.startDate)} –</span>
								<!-- The icon stays with the end date, so it never drifts to the far edge. -->
								<span class="whitespace-nowrap">
									{formatDMY(chosen.endDate)}
									<CalendarRange
										class="ml-2 inline size-5 align-[-0.1em] text-muted-foreground transition-colors group-hover:text-foreground"
									/>
								</span>
							</button>
						{:else}
							<Button {...props} variant="outline" class="mt-2 font-normal">
								<CalendarRange />
								Pick the first and last day
							</Button>
						{/if}
					{/snippet}
				</Popover.Trigger>
				<Popover.Content class="w-auto p-0" align="start">
					<!-- Starts on the suggested dates, so moving one end is a single click. -->
					<RangeCalendar
						value={picked ??
							(suggested && {
								start: parseDate(suggested.startDate),
								end: parseDate(suggested.endDate)
							})}
						placeholder={parseDate((suggested ?? { startDate: today }).startDate)}
						numberOfMonths={twoMonths.current ? 2 : 1}
						onValueChange={(next) => {
							picked = next;
							if (next?.start && next.end) open = false;
						}}
					/>
				</Popover.Content>
			</Popover.Root>
			{#if failed && !chosen}
				<p class="mt-2 text-sm text-muted-foreground">
					Could not check what you last invoiced, so pick the dates yourself.
				</p>
			{:else if picked && suggested}
				<button
					type="button"
					class="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
					onclick={() => (picked = undefined)}
				>
					<Undo2 size={14} />
					Use the suggested dates
				</button>
			{:else if chosen && !due}
				<p class="mt-1 text-sm text-muted-foreground">
					Due from {formatDMY(addDays(chosen.endDate, 1))}
				</p>
			{/if}
		{/if}
	</div>
	<Button
		type="submit"
		size="lg"
		variant={chosen && !due ? 'outline' : 'default'}
		disabled={pending || !chosen}
		aria-describedby={client && showName ? labelId : undefined}
	>
		Start invoice
	</Button>
</form>
