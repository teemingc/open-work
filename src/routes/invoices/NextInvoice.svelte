<script lang="ts">
	import ClientName from '#lib/components/ClientName.svelte';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { RangeCalendar } from '#lib/components/ui/range-calendar/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { addDays, formatDMY, formatHours, formatMoney } from '#lib/format.js';
	import {
		earnings,
		entriesFor,
		invoiceFrequency,
		type Client,
		type WorkLogEntry
	} from '#lib/worklog.js';
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
		entries = [],
		credit = 0,
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
		/** The work log, to show what the period bills so far. */
		entries?: WorkLogEntry[];
		/** Credit the client has from overpaying, which the invoice will use. */
		credit?: number;
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
	/** What the period bills from the time logged in it so far. */
	const worth = $derived(
		client && chosen
			? {
					...earnings({ client, entries: entriesFor({ entries, clientId: client.id, ...chosen }) }),
					currency: client.currency
				}
			: undefined
	);
	const labelId = $props.id();
</script>

<!--
	Laid out by the list's width rather than the window's: stacked when narrow, then the name above
	the dates with the button beside them, and three columns once there is room for the name's.
-->
<form
	method="GET"
	action={resolve('/invoices/new')}
	class={[
		'grid gap-x-8 gap-y-3 @lg/next:grid-cols-[minmax(0,1fr)_auto] @lg/next:items-center',
		showName && '@4xl/next:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto]'
	]}
>
	{#if chosen}
		<input type="hidden" name="start" value={chosen.startDate} />
		<input type="hidden" name="end" value={chosen.endDate} />
	{/if}
	{#if client}<input type="hidden" name="client" value={client.id} />{/if}
	<!-- In a column of its own when wide, so every client's dates line up like a ledger. -->
	{#if client && showName}
		<div class="min-w-0 @lg/next:col-start-1 @lg/next:row-start-1">
			<h3 id={labelId} class="font-display text-lg leading-tight"><ClientName {client} /></h3>
			<p class="mt-0.5 text-xs text-muted-foreground">
				{client.openCollective ? 'Open Collective' : 'Email'}, {invoiceFrequency(client) ===
				'monthly'
					? 'monthly'
					: 'twice a month'}
			</p>
		</div>
	{/if}
	<div
		class={[
			'min-w-0',
			showName &&
				'@lg/next:col-start-1 @lg/next:row-start-2 @4xl/next:col-start-2 @4xl/next:row-start-1'
		]}
	>
		{#if pending}
			<!-- One line box each, in the dates' and summary's type, so loading doesn't move the row. -->
			<!-- Two halves sized like the dates, so they wrap onto two lines where the dates would. -->
			<div
				class="flex flex-wrap gap-x-[0.25em] font-display text-xl leading-snug @4xl/next:text-[1.75rem]"
			>
				<div class="flex h-[1lh] items-center"><Skeleton class="h-[0.8em] w-[6.45em]" /></div>
				<div class="flex h-[1lh] items-center"><Skeleton class="h-[0.8em] w-[6.25em]" /></div>
			</div>
			<div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
				<div class="flex h-[1lh] items-center"><Skeleton class="h-[0.85em] w-[8.8em]" /></div>
				<div class="flex h-[1lh] items-center"><Skeleton class="h-[0.85em] w-[9.6em]" /></div>
			</div>
		{:else}
			<Popover.Root bind:open>
				<Popover.Trigger>
					{#snippet child({ props })}
						{#if chosen}
							<!--
								The dates are the picker, so changing them happens where you read them. The dotted
								rule marks them as something to click, as on a form you fill in by hand.
							-->
							<button
								{...props}
								type="button"
								class="group block w-fit animate-in rounded-sm text-left font-display text-xl leading-snug tabular-nums underline decoration-muted-foreground/40 decoration-dotted decoration-1 underline-offset-[0.25em] duration-300 outline-none fade-in hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 @4xl/next:text-[1.75rem]"
							>
								<span class="sr-only">Change dates,</span>
								<!-- Too narrow for both dates, the end wraps under the start, its icon with it. -->
								<span class="whitespace-nowrap">{formatDMY(chosen.startDate)} –</span>
								<span class="whitespace-nowrap"
									>{formatDMY(chosen.endDate)}<CalendarRange
										class="ml-1.5 inline size-[0.6em] align-[0.05em] text-muted-foreground transition-colors group-hover:text-foreground"
									/></span
								>
							</button>
						{:else}
							<Button {...props} variant="outline" class="font-normal">
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
			{:else if chosen}
				<!-- What the invoice would come to, so you know before opening it. -->
				<p class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
					{#if worth}
						<span class="tabular-nums">
							{#if worth.hours > 0}
								<span class="text-foreground">{formatHours(worth.hours)} h</span> logged,
								<span class="text-foreground">{formatMoney(worth.amount, worth.currency)}</span>
							{:else}
								Nothing logged yet
							{/if}
						</span>
					{/if}
					{#if credit > 0 && client}
						<span class="tabular-nums">
							<span class="text-foreground">{formatMoney(credit, client.currency)}</span> credit
						</span>
					{/if}
					{#if !due}
						<span>Due from {formatDMY(addDays(chosen.endDate, 1))}</span>
					{/if}
					{#if picked && suggested}
						<!-- The hit area reaches past the text, so the small button is still easy to tap. -->
						<button
							type="button"
							class="relative inline-flex items-center gap-1 underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-2.5 hover:text-foreground hover:underline"
							onclick={() => (picked = undefined)}
						>
							<Undo2 size={14} />
							Use the suggested dates
						</button>
					{/if}
				</p>
			{/if}
		{/if}
	</div>
	<Button
		type="submit"
		size="lg"
		class={[
			'mt-1 @lg/next:mt-0',
			showName &&
				'@lg/next:col-start-2 @lg/next:row-start-1 @lg/next:row-end-3 @4xl/next:col-start-3 @4xl/next:row-end-auto'
		]}
		variant={pending || (chosen && !due) ? 'outline' : 'default'}
		disabled={pending || !chosen}
		aria-describedby={client && showName ? labelId : undefined}
	>
		Start invoice
	</Button>
</form>
