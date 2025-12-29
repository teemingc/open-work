<script lang="ts">
	import { invoiceStore } from '$lib/invoice.svelte';
	import type { InvoiceStatus } from '$lib/invoice.svelte';
	import { calculateTotalHours } from './[invoiceId]/formatter';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import { Clock, DollarSign, Calendar, Plus, Trash2 } from 'lucide-svelte';

	let invoices = $derived(invoiceStore.invoiceList);

	let filterStatus = $state<InvoiceStatus | 'all'>('all');
	let sortBy = $state<'newest' | 'oldest' | 'hours'>('newest');

	const filteredAndSorted = $derived(() => {
		let result = invoices;

		// Filter
		if (filterStatus !== 'all') {
			result = result.filter((inv: { status: InvoiceStatus }) => inv.status === filterStatus);
		}

		// Sort
		if (sortBy === 'oldest') {
			result.reverse();
		} else if (sortBy === 'hours') {
			result.sort((a, b) => {
				const aHours = calculateTotalHours(a);
				const bHours = calculateTotalHours(b);
				return bHours - aHours;
			});
		}

		return result;
	});

	const groupedByYear = $derived(() => {
		const groups: Record<number, typeof invoices> = {};
		for (const invoice of filteredAndSorted()) {
			if (!groups[invoice.year]) {
				groups[invoice.year] = [];
			}
			groups[invoice.year].push(invoice);
		}
		return groups;
	});

	function createNewInvoice() {
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;

		try {
			const id = invoiceStore.createInvoice(year, month);
			window.location.href = `/invoices/${id}`;
		} catch {
			alert('An invoice for this month already exists');
		}
	}

	function deleteInvoice(id: string) {
		if (confirm('Are you sure you want to delete this invoice?')) {
			invoiceStore.deleteInvoice(id);
		}
	}

	function getStatusColor(status: InvoiceStatus): string {
		const colors = {
			draft: 'bg-yellow-100 text-yellow-800 border-yellow-200',
			submitted: 'bg-blue-100 text-blue-800 border-blue-200',
			approved: 'bg-green-100 text-green-800 border-green-200',
			paid: 'bg-green-200 text-green-900 border-green-300'
		};
		return colors[status];
	}

	function formatMonth(invoice: (typeof invoices)[0]): string {
		return new Date(invoice.year, invoice.month - 1).toLocaleDateString('en-US', {
			month: 'long'
		});
	}
</script>

<div class="mx-auto max-w-7xl px-6 py-8">
	<div class="mb-8 flex items-end justify-between">
		<div>
			<h1 class="mb-2 text-4xl font-normal">Invoices</h1>
			<p class="text-muted-foreground">Manage your monthly contribution invoices</p>
		</div>
		<Button onclick={createNewInvoice} size="lg" class="gap-2">
			<Plus size={18} />
			Create New Invoice
		</Button>
	</div>

	<!-- Filters Bar -->
	<div class="mb-8 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
		<span class="text-sm font-medium text-muted-foreground">Filter:</span>
		<Select.Root
			value={filterStatus}
			type="single"
			onValueChange={(v) => v && (filterStatus = v as InvoiceStatus | 'all')}
		>
			<Select.Trigger class="w-45">
				{filterStatus === 'all'
					? 'All Statuses'
					: filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="all">All Statuses</Select.Item>
				<Select.Item value="draft">Draft</Select.Item>
				<Select.Item value="submitted">Submitted</Select.Item>
				<Select.Item value="approved">Approved</Select.Item>
				<Select.Item value="paid">Paid</Select.Item>
			</Select.Content>
		</Select.Root>

		<div class="h-6 w-px bg-border"></div>

		<span class="text-sm font-medium text-muted-foreground">Sort:</span>
		<Select.Root
			value={sortBy}
			type="single"
			onValueChange={(v) => v && (sortBy = v as 'newest' | 'oldest' | 'hours')}
		>
			<Select.Trigger class="w-45">
				{sortBy === 'newest' ? 'Newest First' : sortBy === 'oldest' ? 'Oldest First' : 'Most Hours'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="newest">Newest First</Select.Item>
				<Select.Item value="oldest">Oldest First</Select.Item>
				<Select.Item value="hours">Most Hours</Select.Item>
			</Select.Content>
		</Select.Root>
	</div>

	<!-- Invoice List -->
	<div class="space-y-8">
		{#each Object.entries(groupedByYear()).sort(([a], [b]) => Number(b) - Number(a)) as [year, yearInvoices] (year)}
			<div>
				<h2 class="mb-4 text-2xl font-normal">{year}</h2>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each yearInvoices as invoice (invoice.id)}
						<a
							href={resolve(`/invoices/${invoice.id}`)}
							class="group block overflow-hidden rounded-xl border bg-card p-6 shadow-sm transition-all hover:border-primary hover:shadow-lg"
						>
							<div class="mb-4 flex items-start justify-between">
								<h3 class="text-xl font-medium group-hover:text-primary">
									{formatMonth(invoice)}
								</h3>
								<span
									class="rounded-full border px-3 py-1 text-xs font-medium {getStatusColor(
										invoice.status
									)}"
								>
									{invoice.status}
								</span>
							</div>

							<div class="space-y-2 text-sm text-muted-foreground">
								<div class="flex items-center gap-2">
									<Clock size={16} class="shrink-0" />
									<span>{calculateTotalHours(invoice)} hours tracked</span>
								</div>
								{#if invoice.totalAmount}
									<div class="flex items-center gap-2">
										<DollarSign size={16} class="shrink-0" />
										<span>${invoice.totalAmount.toFixed(2)}</span>
									</div>
								{/if}
								<div class="flex items-center gap-2">
									<Calendar size={16} class="shrink-0" />
									<span>Updated {new Date(invoice.updatedAt).toLocaleDateString()}</span>
								</div>
							</div>

							<div class="mt-4 flex items-center gap-2 border-t pt-4">
								<span class="text-sm font-medium group-hover:text-primary">
									{invoice.status === 'draft' ? 'Continue Editing' : 'View Details'}
									→
								</span>
								{#if invoice.status === 'draft'}
									<button
										type="button"
										onclick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											deleteInvoice(invoice.id);
										}}
										class="ml-auto rounded-lg p-2 text-destructive transition-colors hover:bg-destructive/10"
										aria-label="Delete invoice"
									>
										<Trash2 size={16} />
									</button>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			</div>
		{/each}

		{#if filteredAndSorted().length === 0}
			<div class="py-12 text-center text-gray-500">
				<p class="mb-2 text-lg">No invoices found</p>
				<p class="text-sm">Create your first invoice to get started</p>
			</div>
		{/if}
	</div>
</div>
