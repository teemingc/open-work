<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { formatDMY, toIsoDate } from '#lib/format.js';
	import {
		emptyInvoicing,
		entriesFor,
		invoiceDates,
		invoiceEmailHref,
		invoiceFileName,
		invoiceLogLines,
		invoiceMissing,
		invoiceTotals,
		type Client,
		type Invoice,
		type Invoicing
	} from '#lib/worklog.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import {
		ArrowLeft,
		Check,
		CircleAlert,
		Download,
		Mail,
		Pencil,
		TriangleAlert
	} from '@lucide/svelte';
	import { onDestroy, untrack } from 'svelte';
	import StatusBadge from '../StatusBadge.svelte';
	import type { FacturXRequest, FacturXResponse } from './factur-x.worker';

	let { data }: { data: { id: string; store: WorkLogStore } } = $props();

	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => data.store);
	const invoice = $derived(store.invoice(data.id));
	const client = $derived(invoice && store.client(invoice.clientId));
	const invoicing = $derived(store.data.invoicing ?? emptyInvoicing());
	const today = toIsoDate(new Date());
	let paying = $state(false);
	const missing = $derived(client ? invoiceMissing({ invoicing, client }) : []);
	const fileName = $derived(
		invoice && client ? `${invoiceFileName({ client, invoice })}.pdf` : 'invoice.pdf'
	);

	/** The PDF, with its EN 16931 data embedded: drawn here, so the invoice never leaves the browser. */
	async function makePdf({
		invoice,
		client,
		invoicing
	}: {
		invoice: Invoice;
		client: Client;
		invoicing: Invoicing;
	}): Promise<string> {
		const [{ drawInvoicePdf, invoiceFonts }, { toEInvoice }] = await Promise.all([
			import('#lib/invoice-pdf.js'),
			import('#lib/e-invoice.js')
		]);
		const logLines = invoiceLogLines(
			entriesFor({
				entries: store.data.entries,
				clientId: invoice.clientId,
				startDate: invoice.startDate,
				endDate: invoice.endDate
			})
		);
		const pdf = await drawInvoicePdf({
			invoice,
			client,
			invoicing,
			logLines,
			today,
			fontBytes: await invoiceFonts()
		});
		const facturX = await embedInvoice({
			data: toEInvoice({ invoice, client, invoicing, today }),
			pdf,
			fileName,
			title: `Invoice ${invoice.number || ''}`.trim()
		});
		const url = URL.createObjectURL(
			new Blob([facturX as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
		);
		urls.push(url);
		return url;
	}

	/** Embeds the e-invoice data in a worker; see `factur-x.worker.ts` for why. */
	function embedInvoice(request: FacturXRequest): Promise<Uint8Array> {
		const worker = new Worker(new URL('./factur-x.worker.ts', import.meta.url), {
			type: 'module'
		});
		return new Promise<Uint8Array>((resolve, reject) => {
			worker.onmessage = (event: MessageEvent<FacturXResponse>) => {
				if ('pdf' in event.data) resolve(event.data.pdf);
				else reject(new Error(event.data.error));
			};
			worker.onerror = (event) => reject(new Error(event.message || 'The PDF could not be made.'));
			worker.postMessage(request);
		}).finally(() => worker.terminate());
	}

	/** Every PDF made, let go of when the page closes. */
	const urls: string[] = [];
	onDestroy(() => urls.forEach((url) => URL.revokeObjectURL(url)));

	// Remade whenever the invoice or your details change, from plain copies of them.
	const pdf = $derived(
		invoice && client && missing.length === 0
			? makePdf({
					invoice: $state.snapshot(invoice),
					client: $state.snapshot(client),
					invoicing: $state.snapshot(invoicing)
				})
			: undefined
	);

	function markSent(invoice: Invoice, client: Client) {
		const { dueOn } = invoiceDates({ invoice, client, today });
		store.setInvoiceStatus({ id: invoice.id, status: 'sent', on: today, dueOn });
	}
</script>

<svelte:head>
	<title>{invoice?.number || 'Invoice'} · Open Work</title>
</svelte:head>

<div class="space-y-6">
	<a
		href={resolve('/invoices')}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeft size={14} /> Invoices
	</a>

	{#if !invoice || !client}
		<p class="rounded-xl border border-dashed bg-card/50 p-6 text-sm text-muted-foreground">
			This invoice is not in this browser’s work log. It may have been deleted, or saved on another
			device that has not synced yet.
		</p>
	{:else}
		{const dates = $derived(invoiceDates({ invoice, client, today }))}
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div>
				<h1 class="font-display text-3xl">{invoice.number || 'Invoice'}</h1>
				<p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<StatusBadge status={invoice.status.toUpperCase()} />
					<span>{client.name}</span>
					<span class="tabular-nums">
						{invoice.status === 'paid' && invoice.paidOn
							? `Paid ${formatDMY(invoice.paidOn)}`
							: `Due ${formatDMY(dates.dueOn)}`}
					</span>
				</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" href="{resolve('/invoices/new')}?invoice={invoice.id}">
					<Pencil /> Edit
				</Button>
				{#await pdf then url}
					{#if url}
						<Button variant="outline" href={url} download={fileName}>
							<Download /> Download PDF
						</Button>
					{/if}
				{/await}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- opens your mail app -->
				<Button variant="outline" href={invoiceEmailHref({ client, invoice, invoicing })}>
					<Mail /> Email {client.name}
				</Button>
				{#if invoice.status === 'draft'}
					<Button onclick={() => markSent(invoice, client)}><Check /> Mark sent</Button>
				{:else if invoice.status === 'sent'}
					{const due = $derived(invoiceTotals({ invoice, client }).due)}
					<Popover.Root bind:open={paying}>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button {...props}><Check /> Mark paid</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content align="end" class="w-72">
							<form
								class="space-y-3"
								onsubmit={(event) => {
									event.preventDefault();
									const received = Number(new FormData(event.currentTarget).get('received'));
									if (!(received >= 0)) return;
									store.setInvoiceStatus({
										id: invoice.id,
										status: 'paid',
										on: today,
										paidAmount: received
									});
									paying = false;
								}}
							>
								<div class="space-y-1.5">
									<Label for="received">Amount received ({invoice.currency})</Label>
									<Input
										id="received"
										name="received"
										type="number"
										inputmode="decimal"
										min="0"
										step="0.01"
										class="tabular-nums"
										value={due.toFixed(2)}
									/>
								</div>
								<Button type="submit" class="w-full"><Check /> Mark paid</Button>
							</form>
						</Popover.Content>
					</Popover.Root>
				{/if}
			</div>
		</div>

		{#if missing.length > 0}
			<Alert.Root variant="warning">
				<TriangleAlert />
				<Alert.Title>
					Add {missing.join(', ').replace(/, ([^,]*)$/, ' and $1')} to make this invoice.
					<a href={resolve('/settings/invoicing')} class="underline">Go to Invoicing settings</a>
				</Alert.Title>
			</Alert.Root>
		{:else}
			{#await pdf}
				<Skeleton class="aspect-[1/1.414] w-full max-w-3xl" />
			{:then url}
				<iframe
					src={url}
					title="Invoice {invoice.number}"
					class="aspect-[1/1.414] w-full max-w-3xl rounded-sm border bg-white"
				></iframe>
			{:catch error}
				<p class="flex items-start gap-1.5 text-sm text-destructive" role="alert">
					<CircleAlert size={15} class="mt-0.5 shrink-0" />
					Could not make the PDF: {error instanceof Error ? error.message : String(error)}
				</p>
			{/await}
		{/if}
	{/if}
</div>
