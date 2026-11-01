<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { formatDMY, formatHours, formatMoney, toIsoDate } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import type { InvoiceStatus } from '#lib/worklog.js';
	import { CircleAlert, RotateCcw, Save, Send } from '@lucide/svelte';
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

<!--
	The same paper as the Open Collective preview, so both kinds of invoice look like invoices. This
	one you send yourself, so its number is filled in on the paper.
-->
<figure class="mx-0 mt-0">
	<div
		class="rounded-sm border border-neutral-300 bg-white p-6 text-[13px] leading-snug text-neutral-900 shadow-[0_1px_0_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(30_41_59/0.25)]"
	>
		<div class="flex items-baseline justify-between gap-4">
			<p class="font-display text-2xl leading-none">Invoice</p>
			<div class="flex items-center gap-2">
				<Label for="invoice-number" class="font-normal text-neutral-500">No.</Label>
				<Input
					id="invoice-number"
					class="h-8 w-40 border-neutral-300 bg-white text-right font-medium tabular-nums"
					bind:value={() => draft.number, (value) => (draft.numberOverride = value)}
				/>
			</div>
		</div>
		{#if draft.numberOverride !== undefined && !saved}
			<p class="mt-1 text-right">
				<button
					type="button"
					class="inline-flex items-center gap-1 text-xs text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline"
					onclick={() => (draft.numberOverride = undefined)}
				>
					<RotateCcw size={12} />Use the suggested number
				</button>
			</p>
		{/if}

		<dl class="mt-6 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1">
			<dt class="font-semibold">Bill to</dt>
			<dd>{draft.client?.name}</dd>
			<dt class="font-semibold">Period</dt>
			<dd class="tabular-nums">{formatDMY(draft.startDate)} – {formatDMY(draft.endDate)}</dd>
		</dl>

		<div class="mt-5 flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-3">
			<span class="text-neutral-700 tabular-nums">
				{formatHours(draft.hours)} h × {formatMoney(draft.rate, draft.currency)}
			</span>
			<span class="tabular-nums">{formatMoney(draft.cents / 100, draft.currency)}</span>
		</div>
		<!-- Ruled off twice under the total, as a ledger closes a sum. -->
		<div
			class="mt-3 flex items-baseline justify-between gap-3 border-y-[3px] border-double border-neutral-300 py-2"
		>
			<span class="font-semibold">Total</span>
			<span class="font-display text-2xl tabular-nums" aria-live="polite">
				{formatMoney(draft.cents / 100, draft.currency)}
			</span>
		</div>
	</div>
	<figcaption class="mt-3 text-xs text-muted-foreground">
		{draft.client?.name} is invoiced by email. Send it yourself; it is kept in your work log.
	</figcaption>
</figure>

<section class="space-y-4 rounded-xl border bg-card p-5" aria-labelledby="email-invoice-heading">
	<h2 id="email-invoice-heading" class="text-lg">Save</h2>

	{#if problems.length > 0}
		<ul class="space-y-1 text-sm text-muted-foreground">
			{#each problems as problem (problem)}
				<li class="flex items-start gap-1.5">
					<CircleAlert size={15} class="mt-0.5 shrink-0" />{problem}
				</li>
			{/each}
		</ul>
	{/if}

	{#if !saved || saved.status === 'draft'}
		<div class="grid gap-2 sm:grid-cols-[1fr_auto]">
			<Button
				size="lg"
				class="motion-safe:active:scale-[0.98]"
				disabled={problems.length > 0}
				onclick={() => save('sent')}
			>
				<Send />Save as sent
			</Button>
			<Button
				size="lg"
				variant="outline"
				disabled={problems.length > 0}
				onclick={() => save('draft')}
			>
				<Save />Save draft
			</Button>
		</div>
	{:else}
		<Button
			size="lg"
			class="w-full motion-safe:active:scale-[0.98]"
			disabled={problems.length > 0}
			onclick={() => save(saved.status)}
		>
			<Save />Save changes
		</Button>
	{/if}
</section>
