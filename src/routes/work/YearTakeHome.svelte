<script lang="ts">
	import { resolve } from '$app/paths';
	import TakeHomeTable from '#lib/components/TakeHomeTable.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { formatMoney } from '#lib/format.js';
	import {
		completeDeductions,
		yearTakeHome,
		type WorkLogData,
		type YearSummary
	} from '#lib/worklog.js';

	let { data, summary }: { data: WorkLogData; summary: YearSummary } = $props();

	const deductions = $derived(completeDeductions(data.deductions));
	const earnings = $derived(summary.earnings);
	const soFar = $derived(
		earnings && yearTakeHome({ gross: earnings.earned, months: earnings.monthsSoFar, deductions })
	);
	const projected = $derived(
		earnings && yearTakeHome({ gross: earnings.projected, months: earnings.months, deductions })
	);
</script>

{#if earnings && soFar && projected}
	<Card.Root>
		<Card.Header>
			<Card.Title>Take-home</Card.Title>
			<Card.Description class="tabular-nums">
				The year could end around {formatMoney(earnings.projected, earnings.currency)} gross.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<TakeHomeTable
				currency={earnings.currency}
				soFar={{ gross: earnings.earned, ...soFar }}
				projected={{ gross: earnings.projected, ...projected }}
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
