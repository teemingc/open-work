<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card/index.js';
	import { formatAmount, formatMoney } from '#lib/format.js';
	import { monthProjection, takeHome, type MonthSummary, type WorkLogData } from '#lib/worklog.js';

	let { data, summary }: { data: WorkLogData; summary: MonthSummary } = $props();

	const projection = $derived(monthProjection({ data, summary }));
	// One added on Hours and pay but not yet given a rate, amount or bands takes nothing.
	const deductions = $derived(
		data.deductions.filter((deduction) =>
			deduction.kind === 'percent'
				? deduction.rate !== undefined
				: deduction.kind === 'fixed'
					? deduction.amount !== undefined
					: (deduction.bands?.length ?? 0) > 0
		)
	);
	const soFar = $derived(projection && takeHome({ gross: projection.earned, deductions }));
	const projected = $derived(projection && takeHome({ gross: projection.average, deductions }));
	const money = (amount: number) => formatMoney(amount, projection?.currency ?? 'USD');
	// The table names the currency once, in its corner, so its figures fit a phone.
	const amount = (value: number) => formatAmount(value, projection?.currency ?? 'USD');
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
			<div class="@container -mx-2 overflow-x-auto sm:-mx-3">
				<table class="ledger text-sm @max-[15.5rem]:ledger-stacked">
					<thead>
						<tr>
							<th scope="col" class="px-2 py-2 text-left font-normal sm:px-3"
								><span class="sr-only">Line, in </span>{projection.currency}</th
							>
							<th scope="col" class="px-2 py-2 text-right font-medium sm:px-3">So far</th>
							<th scope="col" class="px-2 py-2 text-right font-medium sm:px-3">Projected</th>
						</tr>
					</thead>
					<tbody class="tabular-nums">
						<tr>
							<th scope="row" class="px-2 py-2 text-left font-normal sm:px-3">Gross</th>
							<td data-label="So far" class="px-2 py-2 text-right sm:px-3"
								>{amount(projection.earned)}</td
							>
							<td data-label="Projected" class="px-2 py-2 text-right sm:px-3"
								>{amount(projection.average)}</td
							>
						</tr>
						{#each soFar.lines as line, index (line.deduction.id)}
							<tr>
								<th
									scope="row"
									class="px-2 py-2 text-left font-normal text-muted-foreground sm:px-3"
								>
									{line.deduction.name || 'Deduction'}
									{#if line.deduction.kind === 'percent'}
										<span class="tabular-nums">{line.deduction.rate}%</span>
									{/if}
								</th>
								<td data-label="So far" class="px-2 py-2 text-right text-muted-foreground sm:px-3"
									>−{amount(line.amount)}</td
								>
								<td
									data-label="Projected"
									class="px-2 py-2 text-right text-muted-foreground sm:px-3"
								>
									−{amount(projected.lines[index].amount)}
								</td>
							</tr>
						{/each}
						<tr class="font-semibold">
							<th scope="row" class="px-2 py-2 text-left sm:px-3">Take-home</th>
							<td data-label="So far" class="px-2 py-2 text-right sm:px-3">{amount(soFar.net)}</td>
							<td data-label="Projected" class="px-2 py-2 text-right sm:px-3"
								>{amount(projected.net)}</td
							>
						</tr>
					</tbody>
				</table>
			</div>
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
