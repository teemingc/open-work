<script lang="ts">
	import { formatAmount } from '#lib/format.js';
	import type { Deduction } from '#lib/worklog.js';

	interface Pay {
		gross: number;
		lines: { deduction: Deduction; amount: number }[];
		net: number;
	}

	let { currency, soFar, projected }: { currency: string; soFar: Pay; projected: Pay } = $props();

	// The table names the currency once, in its corner, so its figures fit a phone.
	const amount = (value: number) => formatAmount(value, currency);
</script>

<div class="@container -mx-2 overflow-x-auto sm:-mx-3">
	<table class="ledger text-sm @max-[15.5rem]:ledger-stacked">
		<thead>
			<tr>
				<th scope="col" class="px-2 py-2 text-left font-normal sm:px-3"
					><span class="sr-only">Line, in </span>{currency}</th
				>
				<th scope="col" class="px-2 py-2 text-right font-medium sm:px-3">So far</th>
				<th scope="col" class="px-2 py-2 text-right font-medium sm:px-3">Projected</th>
			</tr>
		</thead>
		<tbody class="tabular-nums">
			<tr>
				<th scope="row" class="px-2 py-2 text-left font-normal sm:px-3">Gross</th>
				<td data-label="So far" class="px-2 py-2 text-right sm:px-3">{amount(soFar.gross)}</td>
				<td data-label="Projected" class="px-2 py-2 text-right sm:px-3"
					>{amount(projected.gross)}</td
				>
			</tr>
			{#each soFar.lines as line, index (line.deduction.id)}
				<tr>
					<th scope="row" class="px-2 py-2 text-left font-normal text-muted-foreground sm:px-3">
						{line.deduction.name || 'Deduction'}
						{#if line.deduction.kind === 'percent'}
							<span class="tabular-nums">{line.deduction.rate}%</span>
						{/if}
					</th>
					<td data-label="So far" class="px-2 py-2 text-right text-muted-foreground sm:px-3"
						>−{amount(line.amount)}</td
					>
					<td data-label="Projected" class="px-2 py-2 text-right text-muted-foreground sm:px-3">
						−{amount(projected.lines[index].amount)}
					</td>
				</tr>
			{/each}
			<tr class="font-semibold">
				<th scope="row" class="px-2 py-2 text-left sm:px-3">Take-home</th>
				<td data-label="So far" class="px-2 py-2 text-right sm:px-3">{amount(soFar.net)}</td>
				<td data-label="Projected" class="px-2 py-2 text-right sm:px-3">{amount(projected.net)}</td>
			</tr>
		</tbody>
	</table>
</div>
