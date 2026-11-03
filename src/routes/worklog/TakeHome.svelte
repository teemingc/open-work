<script lang="ts">
	import { resolve } from '$app/paths';
	import TakeHomeTable from '#lib/components/TakeHomeTable.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { formatMoney } from '#lib/format.js';
	import {
		completeDeductions,
		monthProjection,
		takeHome,
		type MonthSummary,
		type WorkLogData
	} from '#lib/worklog.js';

	let { data, summary }: { data: WorkLogData; summary: MonthSummary } = $props();

	const projection = $derived(monthProjection({ data, summary }));
	const deductions = $derived(completeDeductions(data.deductions));
	const soFar = $derived(projection && takeHome({ gross: projection.earned, deductions }));
	const projected = $derived(projection && takeHome({ gross: projection.average, deductions }));
	const money = (amount: number) => formatMoney(amount, projection?.currency ?? 'USD');
</script>

{#if projection && soFar && projected}
	<Card.Root>
		<Card.Header>
			<Card.Title>Take-home</Card.Title>
			<Card.Description class="tabular-nums">
				The month could end between {money(projection.low)} and {money(projection.high)} gross.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<TakeHomeTable
				currency={projection.currency}
				soFar={{ gross: projection.earned, ...soFar }}
				projected={{ gross: projection.average, ...projected }}
			/>
			{#if deductions.length === 0}
				<a
					href={resolve('/settings/hours')}
					class="mt-3 inline-block text-sm text-muted-foreground underline hover:text-foreground"
				>
					Add deductions like income tax
				</a>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
