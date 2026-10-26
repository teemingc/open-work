<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { RangeCalendar } from '#lib/components/ui/range-calendar/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { formatDMY, nextPeriod } from '#lib/format.js';
	import { getSettings } from '#lib/settings.remote.js';
	import { missingForSubmit } from '#lib/settings.js';
	import { CalendarRange, CircleAlert, RefreshCw, TriangleAlert } from '@lucide/svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { DateRange } from 'bits-ui';
	import { getExpenses, getMe } from '#lib/opencollective.remote.js';
	import { isHttpError } from '@sveltejs/kit';
	import { lastInvoicedEnd } from './expenses';
	import ExpensesTable from './ExpensesTable.svelte';

	// Read without `await`, so the page shows straight away with one set of skeletons while your
	// account, settings and expenses load, rather than a page spinner followed by more spinners.
	const meQuery = getMe();
	const settingsQuery = getSettings();
	/** `undefined` while loading, `null` when not connected. */
	const me = $derived(meQuery.current);
	const settings = $derived(settingsQuery.current);
	const ready = $derived(me !== undefined && settings !== undefined);
	const accountError = $derived(meQuery.error ?? settingsQuery.error);

	const missing = $derived(
		me !== undefined && settings ? missingForSubmit({ settings, connected: me !== null }) : []
	);

	// Not awaited, so a slow or failing list never blocks starting an invoice.
	const expensesQuery = $derived(
		me && settings?.collectiveSlug ? getExpenses(settings.collectiveSlug) : undefined
	);
	const expenses = $derived(expensesQuery?.current);
	const loading = $derived(expensesQuery?.loading ?? false);
	const loadError = $derived.by(() => {
		const error = expensesQuery?.error;
		if (!error) return '';
		return isHttpError(error) ? error.body.message : 'Failed to load your expenses.';
	});
	/** The suggested dates come from the latest expense, so they wait for the list. */
	const expensesPending = $derived(
		!ready || (expensesQuery !== undefined && expenses === undefined && !loadError)
	);

	const suggested = $derived(nextPeriod({ lastEnd: expenses && lastInvoicedEnd(expenses) }));

	/** Open when you open it, or when there are no suggested dates to start from. */
	let datesOpen = $state<boolean>();
	/** Two months fit side by side from this width (see range-calendar-months.svelte). */
	const twoMonths = new MediaQuery('min-width: 32rem');
	let custom = $state<DateRange | undefined>();
	let customOpen = $state(false);
	const customStart = $derived(custom?.start?.toString() ?? '');
	const customEnd = $derived(custom?.end?.toString() ?? '');
</script>

<svelte:head>
	<title>Invoices · Open Work</title>
	<meta property="og:title" content="Invoices · Open Work" />
	<meta
		name="description"
		content="Send invoices to Open Collective in a few clicks, and keep track of each one."
	/>
	<meta
		property="og:description"
		content="Send invoices to Open Collective in a few clicks, and keep track of each one."
	/>
</svelte:head>

{#snippet tableSkeleton()}
	<div class="space-y-px overflow-hidden rounded-xl border bg-card" aria-busy="true">
		{#each [0, 1, 2, 3] as row (row)}
			<div class="flex items-center gap-4 px-4 py-3">
				<Skeleton class="h-4 flex-1" />
				<Skeleton class="h-4 w-20" />
				<Skeleton class="h-4 w-16" />
				<Skeleton class="h-5 w-20 rounded-full" />
			</div>
		{/each}
	</div>
{/snippet}

<div class="space-y-8">
	<h1>Invoices</h1>

	<!--
		Everything below waits until your account and settings are known, then fades in at once,
		so a notice never appears later and pushes the page down.
	-->
	{#if ready || accountError}
		<div class="animate-in space-y-8 duration-300 fade-in">
			{#if accountError}
				<Alert.Root variant="destructive">
					<CircleAlert />
					<Alert.Title>Could not load your account</Alert.Title>
					<Alert.Description>
						<p>
							{isHttpError(accountError) ? accountError.body.message : 'Try again in a moment.'}
						</p>
					</Alert.Description>
				</Alert.Root>
			{:else if missing.length > 0}
				<Alert.Root variant="warning">
					<TriangleAlert />
					<!-- One line: the notice is short, and the link is the only thing to do about it. -->
					<Alert.Title>
						Finish setup to submit invoices.
						<a href={resolve('settings')} class="underline">Go to settings</a>
					</Alert.Title>
				</Alert.Root>
			{/if}

			<section class="rounded-xl border bg-card p-5 sm:p-6">
				<form
					method="GET"
					action={resolve('invoices/new')}
					class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
				>
					<input type="hidden" name="start" value={suggested.startDate} />
					<input type="hidden" name="end" value={suggested.endDate} />
					<div>
						<h2 class="text-sm font-medium text-muted-foreground">Next invoice</h2>
						{#if expensesPending}
							<Skeleton class="mt-1 h-10 w-96 max-w-full" />
						{:else if loadError}
							<!-- Without the list, a suggestion could repeat a period you already invoiced. -->
							<p class="mt-1 text-sm text-muted-foreground">
								Could not check what you last invoiced, so choose the dates below.
							</p>
						{:else}
							<p class="mt-1 animate-in font-display text-2xl duration-300 fade-in sm:text-3xl">
								<!-- On a narrow screen the end date wraps onto its own line rather than overflowing. -->
								<span class="whitespace-nowrap">{formatDMY(suggested.startDate)} –</span>
								<span class="whitespace-nowrap">{formatDMY(suggested.endDate)}</span>
							</p>
						{/if}
					</div>
					<Button type="submit" size="lg" disabled={expensesPending || !!loadError}
						>Start invoice</Button
					>
				</form>

				<!-- Bound rather than set, so picking dates (which re-renders the form) never closes it. -->
				<details
					class="group mt-5 border-t pt-4 text-sm"
					bind:open={() => datesOpen ?? !!loadError, (open) => (datesOpen = open)}
				>
					<summary class="cursor-pointer text-muted-foreground hover:text-foreground">
						Choose other dates
					</summary>
					<form
						method="GET"
						action={resolve('invoices/new')}
						class="mt-3 flex flex-wrap items-end gap-3"
					>
						<div class="w-64 max-w-full space-y-1.5">
							<Label for="custom-range">Dates</Label>
							<Popover.Root bind:open={customOpen}>
								<Popover.Trigger id="custom-range">
									{#snippet child({ props })}
										<Button {...props} variant="outline" class="w-full justify-start font-normal">
											<CalendarRange />
											{#if customStart}
												{formatDMY(customStart)} – {customEnd ? formatDMY(customEnd) : '…'}
											{:else}
												<span class="text-muted-foreground">Pick the first and last day</span>
											{/if}
										</Button>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content class="w-auto p-0" align="start">
									<RangeCalendar
										bind:value={custom}
										numberOfMonths={twoMonths.current ? 2 : 1}
										onValueChange={(next) => {
											if (next?.start && next.end) customOpen = false;
										}}
									/>
								</Popover.Content>
							</Popover.Root>
						</div>
						<input type="hidden" name="start" value={customStart} />
						<input type="hidden" name="end" value={customEnd} />
						<Button type="submit" variant="outline" disabled={!customEnd}>Start invoice</Button>
					</form>
				</details>
			</section>

			<section aria-labelledby="history-heading">
				<div class="mb-3 flex items-center justify-between gap-3">
					<h2 id="history-heading" class="text-lg">
						Sent to {settings?.collectiveSlug || 'Open Collective'}
					</h2>
					<!-- Always rendered so its space is kept, but only shown once you are known to be connected. -->
					<Button
						variant="ghost"
						size="sm"
						class={me ? '' : 'invisible'}
						onclick={() => expensesQuery?.refresh()}
						disabled={!expensesQuery || loading}
					>
						<!-- Only spins for a refresh: the first load shows skeletons below instead. -->
						{#if loading && expenses}<Spinner />{:else}<RefreshCw />{/if}
						Refresh
					</Button>
				</div>

				{#if expensesPending}
					{@render tableSkeleton()}
				{:else if !me}
					<p class="rounded-xl border border-dashed bg-card/50 p-6 text-sm text-muted-foreground">
						<a href={resolve('settings')} class="font-medium text-foreground underline"
							>Connect Open Collective</a
						>

						to see the expenses you have already sent.
					</p>
				{:else if loadError}
					<p class="flex items-start gap-1.5 text-sm text-destructive" role="alert">
						<CircleAlert size={15} class="mt-0.5 shrink-0" />{loadError}
					</p>
				{:else if !expenses || expenses.length === 0}
					<p class="rounded-xl border border-dashed bg-card/50 p-6 text-sm text-muted-foreground">
						No expenses yet. Start the first one above and it will show up here once submitted.
					</p>
				{:else}
					<ExpensesTable {expenses} highlightUrl={page.state.submittedUrl} />
				{/if}
			</section>
		</div>
	{/if}
</div>
