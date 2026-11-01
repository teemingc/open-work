<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { formatDMY, formatMoney, toIsoDate } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import type { Invoice } from '#lib/worklog.js';
	import { Check, Pencil, Send, Trash2 } from '@lucide/svelte';
	import StatusBadge from './StatusBadge.svelte';

	let {
		store,
		highlightId
	}: {
		store: WorkLogStore;
		/** Briefly marks this invoice, such as one just saved. */
		highlightId?: string;
	} = $props();

	/** Newest first, as the list of expenses sent to Open Collective. */
	const invoices = $derived(store.data.invoices.toReversed());
	let removing = $state<Invoice | undefined>();

	function label(invoice: Invoice): string {
		return invoice.number || `${formatDMY(invoice.startDate)} – ${formatDMY(invoice.endDate)}`;
	}
</script>

<!--
	A ledger on a wide screen. On a phone each invoice takes two lines instead of scrolling sideways:
	what it is and what it is for, then where it is at and what to do next.
-->
<div class="animate-in overflow-hidden rounded-xl border bg-card duration-300 fade-in">
	<table class="ledger text-sm">
		<thead class="max-sm:sr-only">
			<tr>
				<th scope="col" class="px-4 py-2.5 font-medium">Invoice</th>
				<th scope="col" class="px-4 py-2.5 font-medium">Period</th>
				<th scope="col" class="px-4 py-2.5 text-right font-medium">Amount</th>
				<th scope="col" class="px-4 py-2.5 font-medium">Status</th>
				<th scope="col" class="px-4 py-2.5"><span class="sr-only">Actions</span></th>
			</tr>
		</thead>
		<tbody>
			{#each invoices as invoice (invoice.id)}
				{const on = invoice.paidOn ?? invoice.sentOn}
				<tr
					class={[
						'grid grid-cols-[minmax(0,1fr)_auto] items-center py-1.5 hover:bg-accent/50 sm:table-row sm:py-0',
						invoice.id === highlightId && 'just-saved'
					]}
				>
					<td class="px-4 pt-1.5 sm:py-3">
						<span class="font-medium whitespace-nowrap">{invoice.number || '—'}</span>
						<span class="block text-xs text-muted-foreground">
							{store.client(invoice.clientId)?.name ?? 'Removed client'}
							<span class="whitespace-nowrap tabular-nums sm:hidden">
								· {formatDMY(invoice.startDate)} – {formatDMY(invoice.endDate)}
							</span>
						</span>
					</td>
					<td class="hidden px-4 py-3 whitespace-nowrap tabular-nums sm:table-cell">
						{formatDMY(invoice.startDate)} – {formatDMY(invoice.endDate)}
					</td>
					<td
						class="self-start px-4 pt-1.5 text-right font-medium tabular-nums sm:py-3 sm:font-normal"
					>
						{formatMoney(invoice.amount, invoice.currency)}
					</td>
					<td
						class="col-span-2 row-start-2 self-center justify-self-start px-4 py-1.5 whitespace-nowrap sm:py-3"
					>
						<!-- The date beside the status it dates, rather than in small type under it. -->
						<span class="inline-flex items-center gap-2">
							<StatusBadge status={invoice.status.toUpperCase()} />
							{#if on}
								<span class="text-xs text-muted-foreground tabular-nums">{formatDMY(on)}</span>
							{/if}
						</span>
					</td>
					<!-- Shares the status's line on a phone, so the amount alone sets the column's width. -->
					<td class="col-span-2 row-start-2 justify-self-end px-2 py-1.5 sm:px-4 sm:py-3">
						<div class="flex justify-end gap-1">
							{#if invoice.status === 'draft'}
								<Button
									variant="ghost"
									size="sm"
									onclick={() =>
										store.setInvoiceStatus({
											id: invoice.id,
											status: 'sent',
											on: toIsoDate(new Date())
										})}
								>
									<Send /> Mark sent
								</Button>
							{:else if invoice.status === 'sent'}
								<Button
									variant="ghost"
									size="sm"
									onclick={() =>
										store.setInvoiceStatus({
											id: invoice.id,
											status: 'paid',
											on: toIsoDate(new Date())
										})}
								>
									<Check /> Mark paid
								</Button>
							{/if}
							<Button
								variant="ghost"
								size="icon"
								href="{resolve('/invoices/new')}?invoice={invoice.id}"
								aria-label="Edit {label(invoice)}"
								title="Edit"
							>
								<Pencil size={16} />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Delete {label(invoice)}"
								title="Delete"
								onclick={() => (removing = invoice)}
							>
								<Trash2 size={16} />
							</Button>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<Dialog.Root bind:open={() => removing !== undefined, (open) => !open && (removing = undefined)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete {removing && label(removing)}?</Dialog.Title>
			<Dialog.Description>
				Its period will be suggested again for the next invoice. The time in your work log stays.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (removing = undefined)}>Keep it</Button>
			<Button
				variant="destructive"
				onclick={() => {
					if (removing) store.removeInvoice(removing.id);
					removing = undefined;
				}}
			>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* Fades from a tint to nothing, so the invoice you just saved is easy to find. */
	.just-saved {
		animation: just-saved 1200ms cubic-bezier(0.23, 1, 0.32, 1) 300ms backwards;
	}

	@keyframes just-saved {
		from {
			background-color: color-mix(in oklch, var(--primary) 12%, transparent);
		}
	}
</style>
