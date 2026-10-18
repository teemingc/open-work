<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { formatDMY, nextPeriod } from '#lib/format.js';
	import { getSettings } from '#lib/settings.remote.js';
	import { missingForSubmit } from '#lib/settings.js';
	import { CircleAlert, RefreshCw, TriangleAlert } from '@lucide/svelte';
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
		return isHttpError(error) ? error.body.message : 'Could not load your expenses.';
	});
	/** The suggested dates come from the latest expense, so they wait for the list. */
	const expensesPending = $derived(
		!ready || (expensesQuery !== undefined && expenses === undefined && !loadError)
	);

	const suggested = $derived(nextPeriod({ lastEnd: expenses && lastInvoicedEnd(expenses) }));

	let customStart = $state('');
	let customEnd = $state('');
	const customValid = $derived(customStart !== '' && customEnd !== '' && customStart <= customEnd);
</script>

<svelte:head><title>Invoices · Open Work</title></svelte:head>

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
					<Alert.Title class="flex flex-wrap gap-x-3">
						Finish setup to submit invoices
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
						{:else}
							<p
								class="mt-1 animate-in font-display text-2xl whitespace-nowrap duration-300 fade-in sm:text-3xl"
							>
								{formatDMY(suggested.startDate)} – {formatDMY(suggested.endDate)}
							</p>
						{/if}
					</div>
					<Button type="submit" size="lg" disabled={expensesPending}>Start invoice</Button>
				</form>

				<details class="group mt-5 border-t pt-4 text-sm">
					<summary class="cursor-pointer text-muted-foreground hover:text-foreground">
						Use different dates
					</summary>
					<form
						method="GET"
						action={resolve('invoices/new')}
						class="mt-3 flex flex-wrap items-end gap-3"
					>
						<div class="space-y-1.5">
							<Label for="custom-start">From</Label>
							<Input
								id="custom-start"
								name="start"
								type="date"
								bind:value={customStart}
								class="block w-44"
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="custom-end">To</Label>
							<Input
								id="custom-end"
								name="end"
								type="date"
								bind:value={customEnd}
								class="block w-44"
							/>
						</div>
						<Button type="submit" variant="outline" disabled={!customValid}>Start invoice</Button>
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
