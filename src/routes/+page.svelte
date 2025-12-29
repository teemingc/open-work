<script lang="ts">
	import { invoiceStore } from '../lib/invoice.svelte';
	import { calculateTotalHours } from './invoices/[invoiceId]/formatter';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { AlertTriangle, Clock, DollarSign, FileText } from 'lucide-svelte';

	const invoices = $derived(invoiceStore.invoiceList);
	const settings = $derived(invoiceStore.state.settings);

	// Stats
	const draftInvoices = $derived(invoices.filter((inv) => inv.status === 'draft'));
	const unpaidInvoices = $derived(
		invoices.filter((inv) => inv.status === 'submitted' || inv.status === 'approved')
	);
	const unpaidHours = $derived(
		unpaidInvoices.reduce((sum, inv) => sum + calculateTotalHours(inv), 0)
	);
	const unpaidAmount = $derived(
		settings.hourlyRate ? unpaidHours * settings.hourlyRate : undefined
	);
</script>

<div class="mx-auto max-w-7xl px-6 py-8">
	<!-- Recent Drafts -->
	{#if draftInvoices.length > 0}
		<div class="mb-12">
			<h2 class="mb-6 text-2xl">Recent Drafts</h2>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each draftInvoices.slice(0, 3) as invoice (invoice.id)}
					<a
						href={resolve(`/invoices/${invoice.id}`)}
						class="group block overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-primary hover:shadow-md"
					>
						<div class="mb-3 flex items-start justify-between">
							<h3 class="text-lg font-medium group-hover:text-primary">
								{new Date(invoice.year, invoice.month - 1).toLocaleDateString('en-US', {
									month: 'long',
									year: 'numeric'
								})}
							</h3>
							<span
								class="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800"
							>
								Draft
							</span>
						</div>
						<div class="flex items-center gap-4 text-sm text-muted-foreground">
							<span class="flex items-center gap-1">
								<Clock size={14} />
								{calculateTotalHours(invoice)}h
							</span>
							{#if invoice.totalAmount}
								<span class="flex items-center gap-1">
									<DollarSign size={14} />
									{invoice.totalAmount.toFixed(2)}
								</span>
							{/if}
						</div>
						<div class="mt-3 text-xs text-muted-foreground">
							Updated {new Date(invoice.updatedAt).toLocaleDateString()}
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Quick Stats Grid -->
	<div class="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
		<div
			class="group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-lg"
		>
			<div class="absolute top-4 right-4 opacity-10">
				<FileText size={64} />
			</div>
			<div class="relative">
				<div class="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
					<FileText size={16} />
					Total Invoices
				</div>
				<div class="text-4xl font-semibold">{invoices.length}</div>
			</div>
		</div>

		<div
			class="group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-lg"
		>
			<div class="absolute top-4 right-4 opacity-10">
				<Clock size={64} />
			</div>
			<div class="relative">
				<div class="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
					<Clock size={16} />
					Unpaid Hours
				</div>
				<div class="text-4xl font-semibold">{unpaidHours}h</div>
				<div class="mt-1 text-xs text-muted-foreground">{unpaidInvoices.length} invoices</div>
			</div>
		</div>

		{#if unpaidAmount !== undefined}
			<div
				class="group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-lg"
			>
				<div class="absolute top-4 right-4 opacity-10">
					<DollarSign size={64} />
				</div>
				<div class="relative">
					<div class="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<DollarSign size={16} />
						Unpaid Amount
					</div>
					<div class="text-4xl font-semibold">${unpaidAmount.toFixed(2)}</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Setup Prompt -->
	{#if !settings.githubUsername || settings.repositories.length === 0}
		<div
			class="overflow-hidden rounded-2xl border border-yellow-200 bg-linear-to-br from-yellow-50 to-background p-8 shadow-lg"
		>
			<div class="flex items-start gap-4">
				<div class="rounded-full bg-yellow-100 p-3">
					<AlertTriangle size={24} class="text-yellow-700" />
				</div>
				<div class="flex-1">
					<h3 class="mb-2 text-xl font-medium">Complete Setup</h3>
					<p class="mb-4 text-sm text-muted-foreground">
						Configure your GitHub username and repositories to start fetching contributions
						automatically.
					</p>
					<Button href={resolve('/settings')} class="gap-2">Go to Settings →</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
