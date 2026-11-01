<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { toIsoDate } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import {
		emptyInvoicing,
		invoiceLogLines,
		type Client,
		type Invoice,
		type InvoiceStatus,
		type Invoicing
	} from '#lib/worklog.js';
	import { onDestroy } from 'svelte';
	import { CircleAlert, FileText, RotateCcw } from '@lucide/svelte';
	import type { Draft } from './draft.svelte';

	let {
		draft,
		store,
		onsaved
	}: { draft: Draft; store: WorkLogStore; onsaved: (id: string) => void } = $props();

	const saved = $derived(draft.invoiceId ? store.invoice(draft.invoiceId) : undefined);
	const problems = $derived([
		...(draft.startDate <= draft.endDate ? [] : ['Make the period end on or after it starts'])
	]);

	const today = toIsoDate(new Date());
	const invoicing = $derived(store.data.invoicing ?? emptyInvoicing());
	let fonts: Promise<{ regular: Uint8Array; semibold: Uint8Array }> | undefined;
	let previous: string | undefined;

	/** The invoice as a PDF, without its e-invoice data, which only the saved invoice needs. */
	async function drawPreview({
		invoice,
		client,
		invoicing,
		logLines
	}: {
		invoice: Invoice;
		client: Client;
		invoicing: Invoicing;
		logLines: string[];
	}): Promise<string> {
		const { drawInvoicePdf, invoiceFonts } = await import('#lib/invoice-pdf.js');
		fonts ??= invoiceFonts();
		const pdf = await drawInvoicePdf({
			invoice,
			client,
			invoicing,
			logLines,
			today,
			fontBytes: await fonts
		});
		if (previous) URL.revokeObjectURL(previous);
		previous = URL.createObjectURL(
			new Blob([pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
		);
		return previous;
	}
	onDestroy(() => previous && URL.revokeObjectURL(previous));

	// Redrawn as the invoice changes, from plain copies of it.
	const preview = $derived(
		draft.client
			? drawPreview({
					invoice: { id: 'preview', ...draft.toInvoice({ status: 'draft', today }) },
					client: $state.snapshot(draft.client),
					invoicing: $state.snapshot(invoicing),
					logLines: invoiceLogLines(draft.entries)
				})
			: undefined
	);

	function save(status: InvoiceStatus) {
		onsaved(store.saveInvoice(draft.toInvoice({ status, today })).id);
	}
</script>

<!-- The PDF itself, drawn as it will be sent, so the preview and the invoice never differ. -->
<figure class="mx-0 mt-0">
	{#await preview}
		<Skeleton class="aspect-[1/1.414] w-full" />
	{:then url}
		<iframe
			src={url}
			title="Preview of invoice {draft.number}"
			class="aspect-[1/1.414] w-full rounded-sm border bg-white"
		></iframe>
	{:catch error}
		<p class="flex items-start gap-1.5 text-sm text-destructive" role="alert">
			<CircleAlert size={15} class="mt-0.5 shrink-0" />
			Could not draw the preview: {error instanceof Error ? error.message : String(error)}
		</p>
	{/await}
</figure>

<section class="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="email-invoice-heading">
	<h2 id="email-invoice-heading" class="text-lg">Save</h2>

	<div class="max-w-72 space-y-1.5">
		<div class="flex items-baseline justify-between gap-3">
			<Label for="invoice-number">Invoice number</Label>
			{#if draft.numberOverride !== undefined && !saved}
				<button
					type="button"
					class="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
					onclick={() => (draft.numberOverride = undefined)}
				>
					<RotateCcw size={13} />Use suggested
				</button>
			{/if}
		</div>
		<Input
			id="invoice-number"
			class="tabular-nums"
			bind:value={() => draft.number, (value) => (draft.numberOverride = value)}
		/>
	</div>

	{#if problems.length > 0}
		<ul class="space-y-1 text-sm text-muted-foreground">
			{#each problems as problem (problem)}
				<li class="flex items-start gap-1.5">
					<CircleAlert size={15} class="mt-0.5 shrink-0" />{problem}
				</li>
			{/each}
		</ul>
	{/if}

	<!-- Sent once you have emailed it, from the invoice's own page, so saving never marks it sent. -->
	<Button
		size="lg"
		class="w-full motion-safe:active:scale-[0.98]"
		disabled={problems.length > 0 || draft.hours <= 0}
		onclick={() => save(saved?.status ?? 'draft')}
	>
		<FileText />{saved ? 'Save changes' : 'Save and open invoice'}
	</Button>
</section>
