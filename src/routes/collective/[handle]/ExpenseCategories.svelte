<script lang="ts">
	import { TooltipLink } from '#lib/tooltip-link.svelte.js';
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

	/** Shades of the expenses pink, so the categories read as expenses like everywhere else on the page. */
	const COLORS = [
		'var(--color-chart-expenses-1)',
		'var(--color-chart-expenses-2)',
		'var(--color-chart-expenses-3)',
		'var(--color-chart-expenses-4)'
	];

	const money = $derived(moneyFormat(currency));
	const compact = $derived(compactFormat(currency));
	const byCategory = $derived(categoriesByMonth({ payouts, months, limit: 4 }));
	/**
	 * The categories past the top four, which share the last band, with what each was paid, biggest
	 * first. Empty when every category has a band of its own.
	 */
	const lumped = $derived.by(() => {
		if (byCategory.categories.at(-1) !== 'Other') return [];
		const top = new Set(byCategory.categories.slice(0, -1));
		const keys = new Set(months);
		const totals = payouts
			.filter((payout) => keys.has(payout.month) && !top.has(payout.category))
			.reduce(
				(totals, payout) =>
					totals.set(payout.category, (totals.get(payout.category) ?? 0) + payout.amount),
				new Map<string, number>()
			);
		return [...totals].sort(([, a], [, b]) => b - a);
	});
	/** The last band is named by how many categories it holds, or by its one category. */
	const lumpedLabel = $derived(lumped.length === 1 ? lumped[0][0] : `${lumped.length} more`);
	const series = $derived(
		byCategory.categories.map((category, i) => ({
			key: `c${i}`,
			label: category === 'Other' && lumped.length ? lumpedLabel : category,
			color: category === 'Other' ? 'var(--color-chart-other)' : COLORS[i]
		}))
	);
	/** What each band adds up to over the months shown, by its series key. */
	const bandTotals = $derived(
		new Map(
			series.map((s) => [
				s.key,
				byCategory.rows.reduce((sum, row) => sum + (row[s.key] as number), 0)
			])
		)
	);
	const paidOut = $derived([...bandTotals.values()].reduce((sum, total) => sum + total, 0));
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });
	const config = $derived(
		Object.fromEntries(
			series.map((s) => [s.key, { label: s.label, color: s.color }])
		) satisfies ChartConfig
	);

	/** Measured, since the legend wraps onto more rows the narrower the card. */
	let legendHeight = $state(20);

	const link = new TooltipLink(({ month }: { month: string }) =>
		transactionsUrl({ slug, month, kinds: ['EXPENSE'] })
	);
	import LazyChart from '#lib/components/LazyChart.svelte';
</script>

{#snippet row({
	value,
	name,
	item,
	index,
	payload
}: {
	value: unknown;
	name: string;
	item: { color?: string };
	index: number;
	payload: { value?: unknown }[];
})}
	{#if typeof value === 'number' && value !== 0}
		<MoneyRow {value} {name} color={item.color} {money} />
	{:else if index === payload.length - 1 && payload.every((entry) => !entry.value)}
		<!-- A month with no expenses says so, rather than showing the month alone. -->
		<span class="text-muted-foreground">No expenses paid</span>
	{/if}
{/snippet}

<!--
	What a category's band adds up to over the months shown, and its share of expenses. The last band,
	when it holds several categories, lists them.
-->
{#snippet categoryDetails(key: string)}
	{@const total = bandTotals.get(key) ?? 0}
	{@const share = paidOut ? total / paidOut : 0}
	<div class="flex justify-between gap-3 p-1 text-xs">
		<span class="min-w-0 font-medium">{config[key]?.label}</span>
		<span class="shrink-0 tabular-nums">{money.format(total)}</span>
	</div>
	<p class="px-1 text-xs text-muted-foreground">
		<!-- Rounded to a whole percent, a small share read as none at all. -->
		{share > 0 && share < 0.01 ? 'Less than 1%' : percent.format(share)} of expenses {periodPhrase(
			months
		)}
	</p>
	{#if key === series.at(-1)?.key && lumped.length > 1}
		<ul class="mt-2 max-h-56 space-y-1 overflow-y-auto border-t pt-2 text-xs">
			{#each lumped as [category, amount] (category)}
				<li class="flex justify-between gap-3 px-1">
					<span class="min-w-0 text-muted-foreground">{category}</span>
					<span class="shrink-0 tabular-nums">{money.format(amount)}</span>
				</li>
			{/each}
		</ul>
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
					Expenses of {money.format(spent)} were paid another way, such as contributions to other collectives.
				{/if}
			{/if}
		</Card.Description>
	</Card.Header>
	{#if series.length}
		<Card.Content>
			<LazyChart class="h-72">
				{#snippet children({ BarChart, Chart, Legend, legendMotion })}
					<Chart.Container {config} class="aspect-auto h-72 w-full cursor-pointer">
						<BarChart
							padding={{ ...chartPadding({ legend: true }), bottom: 38 + legendHeight }}
							data={byCategory.rows}
							x="month"
							xScale={scaleBand().padding(0.2)}
							seriesLayout="stack"
							onTooltipClick={link.click}
							{series}
							props={{
								bars: { radius: 2, strokeWidth: 0, motion: legendMotion },
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
								},
								tooltip: { context: { locked: link.locked } }
							}}
						>
							{#snippet legend({ context })}
								<!--
									Category names are long, so the legend wraps and the plot makes room for every row.
									Centred like the other charts' legends where a row holds several. On phones, where it
									becomes a list, left-aligned so the swatches line up, and pulled out by each item's
									padding so they line up with the title too.
								-->
								<div class="absolute inset-x-0 bottom-0 z-1" bind:clientHeight={legendHeight}>
									<Legend
										{context}
										classes={{ root: 'w-full', items: '-mx-2 flex-wrap sm:justify-center' }}
										details={categoryDetails}
									/>
								</div>
							{/snippet}
							{#snippet tooltip()}
								<Chart.Tooltip
									labelFormatter={(key: string) => monthLabel({ key, partialKey })}
									formatter={row}
									{link}
								/>
							{/snippet}
						</BarChart>
					</Chart.Container>
				{/snippet}
			</LazyChart>
		</Card.Content>
	{/if}
</Card.Root>
