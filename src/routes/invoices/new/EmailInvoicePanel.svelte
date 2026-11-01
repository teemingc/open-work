<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { formatDMY, formatHours, formatMoney, toIsoDate } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import type { InvoiceStatus } from '#lib/worklog.js';
	import { RotateCcw, Save, Send } from '@lucide/svelte';
	import type { Draft } from './draft.svelte';

	let {
		draft,
		store,
		onsaved
	}: { draft: Draft; store: WorkLogStore; onsaved: (id: string) => void } = $props();

	const saved = $derived(draft.invoiceId ? store.invoice(draft.invoiceId) : undefined);
	const problems = $derived([
		...(draft.startDate <= draft.endDate ? [] : ['Make the period end on or after it starts']),
		...(draft.hours > 0 ? [] : ['Log your time or enter the hours you worked'])
	]);

	function save(status: InvoiceStatus) {
		onsaved(store.saveInvoice(draft.toInvoice({ status, today: toIsoDate(new Date()) })).id);
	}
</script>

<section class="space-y-5 rounded-xl border bg-card p-5" aria-labelledby="email-invoice-heading">
	<div>
		<h2 id="email-invoice-heading" class="text-lg">Invoice for {draft.client?.name}</h2>
		<p class="text-sm text-muted-foreground">
			{draft.client?.name} is invoiced by email, so this invoice is kept in your work log. Mark it sent
			once you have emailed it.
		</p>
	</div>

	<div class="space-y-1.5">
		<div class="flex items-center justify-between">
			<Label for="invoice-number">Invoice number</Label>
			{#if draft.numberOverride !== undefined && !saved}
				<Button
					variant="ghost"
					size="sm"
					class="h-auto py-0"
					onclick={() => (draft.numberOverride = undefined)}><RotateCcw />Use suggested</Button
				>
			{/if}
		</div>
		<Input
			id="invoice-number"
			bind:value={() => draft.number, (value) => (draft.numberOverride = value)}
		/>
	</div>

	<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
		<dt class="text-muted-foreground">Period</dt>
		<dd class="text-right">{formatDMY(draft.startDate)} – {formatDMY(draft.endDate)}</dd>
		<dt class="text-muted-foreground">Hours</dt>
		<dd class="text-right tabular-nums">{formatHours(draft.hours)}</dd>
		<dt class="text-muted-foreground">Total</dt>
		<dd class="text-right font-semibold tabular-nums">
			{formatMoney(draft.cents / 100, draft.currency)}
		</dd>
	</dl>

	{#if problems.length > 0}
		<ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
			{#each problems as problem (problem)}<li>{problem}</li>{/each}
		</ul>
	{/if}

	<div class="flex flex-wrap gap-2">
		{#if !saved || saved.status === 'draft'}
			<Button disabled={problems.length > 0} onclick={() => save('sent')}>
				<Send /> Save as sent
			</Button>
			<Button variant="outline" disabled={problems.length > 0} onclick={() => save('draft')}>
				<Save /> Save draft
			</Button>
		{:else}
			<Button disabled={problems.length > 0} onclick={() => save(saved.status)}>
				<Save /> Save changes
			</Button>
		{/if}
	</div>
</section>
