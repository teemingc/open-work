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

<div class="animate-in overflow-x-auto rounded-xl border bg-card duration-300 fade-in">
	<table class="ledger text-sm">
		<thead>
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
				<tr class={['hover:bg-accent/50', invoice.id === highlightId && 'just-saved']}>
					<td class="px-4 py-3">
						<span class="font-medium">{invoice.number || '—'}</span>
						<span class="block text-xs text-muted-foreground">
							{store.client(invoice.clientId)?.name ?? 'Removed client'}
						</span>
					</td>
					<td class="px-4 py-3 whitespace-nowrap tabular-nums">
						{formatDMY(invoice.startDate)} – {formatDMY(invoice.endDate)}
					</td>
					<td class="px-4 py-3 text-right tabular-nums">
						{formatMoney(invoice.amount, invoice.currency)}
					</td>
					<td class="px-4 py-3 whitespace-nowrap">
						<StatusBadge status={invoice.status.toUpperCase()} />
						{#if invoice.paidOn ?? invoice.sentOn}
							<span class="block text-xs text-muted-foreground tabular-nums">
								{formatDMY((invoice.paidOn ?? invoice.sentOn)!)}
							</span>
						{/if}
					</td>
					<td class="px-4 py-3">
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
