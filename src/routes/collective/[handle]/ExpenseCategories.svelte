<script lang="ts">
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import { scaleBand } from 'd3-scale';
	import {
		bandTickLabel,
		bandTicks,
		compactFormat,
		monthLabel,
		moneyFormat,
		periodPhrase
	} from './chart-format';
	import { categoriesByMonth, transactionsUrl, type Payout } from './financials';
	import MoneyRow from './MoneyRow.svelte';

	let {
		slug,
		currency,
		months,
		partialKey,
		payouts,
		spent
	}: {
		/** The collective. */
		slug: string;
		currency: string;
		months: string[];
		partialKey?: string;
		payouts: Payout[];
		/** All that went out in these months, expenses or not. */
		spent: number;
	} = $props();

	const COLORS = [
		'var(--color-chart-1)',
		'var(--color-chart-2)',
		'var(--color-chart-3)',
		'var(--color-chart-4)'
	];

	const money = $derived(moneyFormat(currency));
	const compact = $derived(compactFormat(currency));
	const byCategory = $derived(categoriesByMonth({ payouts, months, limit: 4 }));
	const series = $derived(
		byCategory.categories.map((category, i) => ({
			key: `c${i}`,
			label: category,
			color: category === 'Other' ? 'var(--color-chart-other)' : COLORS[i]
		}))
	);
	const config = $derived(
		Object.fromEntries(
			series.map((s) => [s.key, { label: s.label, color: s.color }])
		) satisfies ChartConfig
	);

	function openMonth(_event: MouseEvent, { data: row }: { data: { month: string } }) {
		window.open(
			transactionsUrl({ slug, month: row.month, kinds: ['EXPENSE'] }),
			'_blank',
			'noopener'
		);
	}
	import LazyChart from '#lib/components/LazyChart.svelte';
</script>

{#snippet row({ value, name, item }: { value: unknown; name: string; item: { color?: string } })}
	{#if typeof value === 'number' && value !== 0}
		<MoneyRow {value} {name} color={item.color} {money} />
	{/if}
{/snippet}

<Card.Root>
	<Card.Header>
		<Card.Title>Expenses by category</Card.Title>
		<Card.Description>
			{#if series.length}
				Paid expenses each month, by accounting category.
			{:else}
				No expenses paid {periodPhrase(months) || 'yet'}.
				{#if spent >= 1}
					The {money.format(spent)} that went out was paid another way, such as contributions to other
					collectives.
				{/if}
			{/if}
		</Card.Description>
	</Card.Header>
	{#if series.length}
		<Card.Content>
			<LazyChart class="h-64">
				{#snippet children({ BarChart, Chart })}
					<Chart.Container {config} class="aspect-auto h-64 w-full cursor-pointer">
						<BarChart
							padding={chartPadding()}
							data={byCategory.rows}
							x="month"
							xScale={scaleBand().padding(0.2)}
							seriesLayout="stack"
							onTooltipClick={openMonth}
							{series}
							props={{
								bars: { radius: 2, strokeWidth: 0 },
								xAxis: {
									tickLength: TICK_LENGTH,
									tickOcclusion: X_TICK_OCCLUSION,
									ticks: bandTicks(months),
									format: bandTickLabel
								},
								yAxis: {
									tickLength: TICK_LENGTH,
									tickLabelProps: Y_TICK_LABEL,
									format: (v: number) => compact.format(v)
								}
							}}
						>
							{#snippet tooltip()}
								<Chart.Tooltip
									labelFormatter={(key: string) => monthLabel({ key, partialKey })}
									formatter={row}
								/>
							{/snippet}
						</BarChart>
					</Chart.Container>
				{/snippet}
			</LazyChart>
			<!-- Category names are long, so this legend wraps where the chart's own would overflow. -->
			<ul
				class="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground"
			>
				{#each series as s (s.key)}
					<li class="flex items-center gap-1.5">
						<span class="size-2.5 shrink-0 rounded-[2px]" style:background={s.color}></span>
						{s.label}
					</li>
				{/each}
			</ul>
		</Card.Content>
	{/if}
</Card.Root>
