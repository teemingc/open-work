<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { nextPeriod, toIsoDate } from '#lib/format.js';
	import { missingFromSettings } from '#lib/settings.js';
	import { CircleAlert, TriangleAlert } from '@lucide/svelte';
	import { getExpenses, getMe } from '#lib/opencollective.remote.js';
	import { isHttpError } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import {
		activeClients,
		availableCredit,
		invoiceFrequency,
		lastInvoicedEnd,
		openCollectiveRate,
		type Client
	} from '#lib/worklog.js';
	import { openWorkLogWithSettings } from '#lib/open-work-log.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { lastInvoicedEnd as lastExpenseEnd } from './expenses';
	import EmailInvoicesTable from './EmailInvoicesTable.svelte';
	import NextInvoice from './NextInvoice.svelte';

	// Read without `await`, so the page shows straight away with one set of skeletons while your
	// account, settings and expenses load, rather than a page spinner followed by more spinners.
	const meQuery = getMe();
	/** `undefined` while loading, `null` when not connected. */
	const me = $derived(meQuery.current);
	/**
	 * The work log, in this browser's IndexedDB: your settings, your clients, how often each is
	 * invoiced, and the invoices sent by email.
	 */
	let store = $state<WorkLogStore>();
	onMount(async () => {
		({ store } = await openWorkLogWithSettings());
	});
	const settings = $derived(store?.settings);
	const ready = $derived(me !== undefined && settings !== undefined);
	const accountError = $derived(meQuery.error);

	const missing = $derived(
		me !== undefined && settings
			? missingFromSettings({
					settings,
					connected: me !== null,
					rate: store && openCollectiveRate(store.data.clients)
				})
			: []
	);

	// Not awaited, so a slow or failing list never blocks starting an invoice.
	const expensesQuery = $derived(me ? getExpenses() : undefined);
	const loadError = $derived.by(() => {
		const error = expensesQuery?.error;
		if (!error) return '';
		return isHttpError(error) ? error.body.message : 'Failed to load your expenses.';
	});
	const clients = $derived(store ? activeClients(store.data.clients) : []);
	/** Where your clients are invoiced, archived ones too, so their past expenses still show. */
	const collectives = $derived(
		new Set(
			store?.data.clients.flatMap((client) =>
				client.openCollective && client.collective ? [client.collective] : []
			)
		)
	);
	/** Only those sent to your clients, not expenses you sent to other collectives. */
	const expenses = $derived(
		expensesQuery?.current?.filter((expense) => collectives.has(expense.collective))
	);
	const showExpenses = $derived(
		clients.length === 0 || clients.some((other) => other.openCollective)
	);
	const showEmailed = $derived(
		!!store && (store.data.invoices.length > 0 || clients.some((other) => !other.openCollective))
	);

	/** The list of expenses Open Collective clients' suggested dates wait for. */
	const expensesPending = $derived(
		!ready ||
			store === undefined ||
			(expensesQuery !== undefined && expenses === undefined && !loadError)
	);
	const today = toIsoDate(new Date());

	/**
	 * Each client's next invoice, so everything due can be started from one place. A client
	 * invoiced by email has its last invoice in the work log rather than Open Collective.
	 */
	const nextInvoices = $derived.by(() => {
		if (!ready || store === undefined) return undefined;
		const work = store;
		return (clients.length > 0 ? clients : [undefined]).map((client?: Client) => {
			const byEmail = client !== undefined && !client.openCollective;
			const period = nextPeriod({
				lastEnd: byEmail
					? lastInvoicedEnd({ invoices: work.data.invoices, clientId: client.id })
					: expenses &&
						lastExpenseEnd(expenses.filter((expense) => expense.collective === client?.collective)),
				frequency: client && invoiceFrequency(client)
			});
			return {
				client,
				// The suggested dates come from the latest invoice, so they wait for the list.
				pending: !byEmail && expensesPending,
				// Without the list, a suggestion could repeat a period already invoiced.
				failed: !byEmail && !!loadError,
				period
			};
		});
	});
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
			{:else if missing.length > 0 && showExpenses}
				<Alert.Root variant="warning">
					<TriangleAlert />
					<!-- One line: the notice is short, and the link is the only thing to do about it. -->
					<Alert.Title>
						Finish setup to submit invoices.
						<a href={resolve('settings')} class="underline">Go to settings</a>
					</Alert.Title>
				</Alert.Root>
			{/if}

			<!-- Titled like the section below it, so the page reads as equal parts. -->
			<section aria-labelledby="next-heading">
				<h2 id="next-heading" class="mb-3 text-lg">
					Next invoice{(nextInvoices?.length ?? 0) > 1 ? 's' : ''}
				</h2>
				<ul class="ledger-rows divide-y overflow-hidden rounded-xl border bg-card">
					{#each nextInvoices ?? [undefined] as next, index (next?.client?.id ?? index)}
						<li class="px-5 py-4 sm:px-6 sm:py-5">
							<NextInvoice
								client={next?.client}
								period={next?.period}
								pending={!next || next.pending}
								failed={next?.failed}
								{today}
								entries={store?.data.entries}
								credit={store && next?.client && !next.client.openCollective
									? availableCredit({ invoices: store.data.invoices, client: next.client })
									: 0}
								showName={clients.length > 1}
							/>
						</li>
					{/each}
				</ul>
			</section>

			{#if showEmailed && store}
				<section aria-labelledby="emailed-heading">
					<h2 id="emailed-heading" class="mb-3 text-lg">Invoiced by email</h2>
					{#if store.data.invoices.length === 0}
						<p class="rounded-xl border border-dashed bg-card/50 p-6 text-sm text-muted-foreground">
							No invoices yet. Start one above for a client invoiced by email and save it to see it
							here.
						</p>
					{:else}
						<EmailInvoicesTable {store} />
					{/if}
				</section>
			{/if}
		</div>
	{/if}
</div>
