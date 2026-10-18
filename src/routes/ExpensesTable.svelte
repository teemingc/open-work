<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { formatDMY, formatMoney, toIsoDate } from '#lib/format.js';
	import type { Expense } from '#lib/opencollective.remote.js';
	import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from '@lucide/svelte';
	import { sortExpenses, type ExpenseSortKey } from './expenses';
	import StatusBadge from './StatusBadge.svelte';

	let {
		expenses,
		highlightUrl
	}: {
		expenses: Expense[];
		/** Briefly marks this expense, such as one just submitted. */
		highlightUrl?: string;
	} = $props();

	/** Enough for the last few months; the rest are one click away. */
	const PAGE = 15;

	const COLUMNS: { key: ExpenseSortKey; label: string; align?: 'right' }[] = [
		{ key: 'title', label: 'Title' },
		{ key: 'createdAt', label: 'Sent' },
		{ key: 'amount', label: 'Amount', align: 'right' },
		{ key: 'status', label: 'Status' }
	];

	let sortKey = $state<ExpenseSortKey>('createdAt');
	let descending = $state(true);
	let showAll = $state(false);

	const sorted = $derived(sortExpenses({ expenses, key: sortKey, descending }));
	const shown = $derived(showAll ? sorted : sorted.slice(0, PAGE));

	function sortBy(key: ExpenseSortKey) {
		if (sortKey === key) {
			descending = !descending;
		} else {
			sortKey = key;
			// Text reads best A to Z; dates and amounts biggest first.
			descending = key === 'createdAt' || key === 'amount';
		}
	}
</script>

<div class="animate-in overflow-x-auto rounded-xl border bg-card duration-300 fade-in">
	<table class="w-full text-sm">
		<thead class="border-b text-left text-muted-foreground">
			<tr>
				{#each COLUMNS as column (column.key)}
					<th
						scope="col"
						class="px-2 py-1.5 font-medium {column.align === 'right' ? 'text-right' : ''}"
						aria-sort={sortKey === column.key ? (descending ? 'descending' : 'ascending') : 'none'}
					>
						<button
							type="button"
							class="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent hover:text-foreground {sortKey ===
							column.key
								? 'text-foreground'
								: ''}"
							onclick={() => sortBy(column.key)}
						>
							{column.label}
							{#if sortKey !== column.key}
								<ArrowUpDown size={13} class="opacity-50" />
							{:else if descending}
								<ArrowDown size={13} />
							{:else}
								<ArrowUp size={13} />
							{/if}
						</button>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody class="divide-y">
			{#each shown as expense (expense.id)}
				<tr class={['hover:bg-accent/50', expense.url === highlightUrl && 'just-submitted']}>
					<td class="px-4 py-3">
						<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
						<a
							href={expense.url}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1.5 font-medium hover:underline"
						>
							{expense.title}
							<ExternalLink size={13} class="shrink-0 text-muted-foreground" />
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</td>
					<td class="px-4 py-3 whitespace-nowrap tabular-nums">
						{formatDMY(toIsoDate(new Date(expense.createdAt)))}
					</td>
					<td class="px-4 py-3 text-right tabular-nums">
						{formatMoney(expense.amountInCents / 100, expense.currency)}
					</td>
					<td class="px-4 py-3"><StatusBadge status={expense.status} /></td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if sorted.length > PAGE}
		<div class="flex justify-center border-t p-2">
			<Button variant="ghost" size="sm" onclick={() => (showAll = !showAll)}>
				{showAll ? 'Show fewer' : `Show all ${sorted.length} expenses`}
			</Button>
		</div>
	{/if}
</div>

<style>
	/* Fades from a tint to nothing, so the expense you just sent is easy to find. */
	.just-submitted {
		animation: just-submitted 1200ms cubic-bezier(0.23, 1, 0.32, 1) 300ms backwards;
	}

	@keyframes just-submitted {
		from {
			background-color: color-mix(in oklch, var(--primary) 12%, transparent);
		}
	}
</style>
