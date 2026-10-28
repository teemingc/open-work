<script lang="ts">
	import { TooltipLink } from '#lib/tooltip-link.svelte.js';
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import { scaleBand } from 'd3-scale';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import {
		bandTickLabel,
		bandTicks,
		compactFormat,
		monthLabel,
		moneyFormat
	} from '#lib/chart-format.js';
	import { paidTo, transactionsUrl, type Month, type Payout } from '#lib/financials.js';
	import MoneyRow from './MoneyRow.svelte';

	let {
		slug,
		currency,
		months,
		shown,
		now,
		me,
		payouts
	}: {
		/** The collective. */
		slug: string;
		currency: string;
		/** Every month on record. */
		months: Month[];
		/** The months the range shows. */
		shown: Month[];
		now: Date;
		/** Your Open Collective slug, if connected. */
		me?: string;
		payouts: Payout[];
	} = $props();

	/** The averages need at least one month that is over. */
	const tooNew = $derived(months.every((m) => m.partial));
	/** This month so far, which a collective too new to forecast has alone. */
	const thisMonth = $derived(months.find((m) => m.partial));
	const partialKey = $derived(thisMonth?.key);
	const labelMonth = (key: string) => monthLabel({ key, partialKey });

	const money = $derived(moneyFormat(currency));
	const compact = $derived(compactFormat(currency));
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });
	const signed = (value: number) => (value > 0 ? '+' : '') + money.format(value);

	const dayMonth = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});

	const paidToMe = $derived(paidTo({ payouts: payouts, slug: me, months: months }));

	// Expenses are negative so they hang below contributions on the same axis.
	const monthly = $derived(
		shown.map((m) => {
			const mine = paidToMe.get(m.key) ?? 0;
			return {
				month: m.key,
				income: Math.round(m.income),
				expenses: -Math.round(m.expenses),
				you: -Math.round(mine),
				others: -Math.round(m.expenses - mine),
				gained: m.net >= 0 ? Math.round(m.net) : null,
				spent: m.net < 0 ? Math.round(m.net) : null
			};
		})
	);

	const totals = $derived.by(() => {
		const complete = shown.filter((m) => !m.partial);
		const income = complete.reduce((sum, m) => sum + m.income, 0);
		const expenses = complete.reduce((sum, m) => sum + m.expenses, 0);
		const mine = complete.reduce((sum, m) => sum + (paidToMe.get(m.key) ?? 0), 0);
		return { months: complete.length, income, expenses, mine, net: income - expenses };
	});

	const flowConfig = {
		income: { label: 'Contributions', color: 'var(--color-chart-income)' },
		expenses: { label: 'Expenses', color: 'var(--color-chart-expenses)' },
		you: { label: 'Paid to you', color: 'var(--color-chart-expenses)' },
		others: { label: 'Paid to others', color: 'var(--color-chart-expenses-muted)' }
	} satisfies ChartConfig;

	/**
	 * Contributions above the axis and expenses below it, rather than side by side or one inside the
	 * other, which stayed readable however many months are shown and however narrow the screen.
	 */
	const flowSeries = $derived(
		(me ? (['income', 'you', 'others'] as const) : (['income', 'expenses'] as const)).map(
			(key) => ({ key, label: flowConfig[key].label, color: flowConfig[key].color })
		)
	);

	/** In the chart above's colours: a gain as contributions, money spent from the balance as expenses. */
	const netConfig = {
		gained: { label: 'Gained', color: 'var(--color-chart-income)' },
		spent: { label: 'Spent', color: 'var(--color-chart-expenses)' }
	} satisfies ChartConfig;
	const netSeries = (['gained', 'spent'] as const).map((key) => ({
		key,
		label: netConfig[key].label,
		color: netConfig[key].color
	}));

	const monthLink = new TooltipLink(({ month }: { month: string }) =>
		transactionsUrl({ slug: slug, month })
	);

	const ticks = $derived(bandTicks(shown.map((m) => m.key)));
</script>

{#snippet moneyRow({
	value,
	name,
	item
}: {
	value: unknown;
	name: string;
	item: { color?: string };
})}
	{#if typeof value === 'number'}
		<MoneyRow {value} {name} color={item.color} {money} />
	{/if}
{/snippet}

<Card.Root>
	<Card.Header>
		<Card.Title>Expenses and contributions</Card.Title>
		<Card.Description>
			{#if tooNew && thisMonth}
				Contributions of {money.format(thisMonth.income)} and expenses of {money.format(
					thisMonth.expenses
				)} so far this month.
			{:else}
				Contributions of {money.format(totals.income)} and expenses of {money.format(
					totals.expenses
				)} over {totals.months} months{#if me}. {money.format(totals.mine)}
					({percent.format(totals.expenses ? totals.mine / totals.expenses : 0)}) of expenses went
					to you{/if}.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<LazyChart class="mb-3 h-64">
			{#snippet children({ BarChart, Chart, Legend, legendMotion })}
				<Chart.Container config={flowConfig} class="aspect-auto h-64 w-full cursor-pointer">
					<BarChart
						padding={chartPadding({ legend: true })}
						data={monthly}
						x="month"
						xScale={scaleBand().padding(0.2)}
						seriesLayout="stackDiverging"
						onTooltipClick={monthLink.click}
						series={flowSeries}
						props={{
							bars: { radius: 2, strokeWidth: 0, motion: legendMotion },
							xAxis: {
								tickLength: TICK_LENGTH,
								tickOcclusion: X_TICK_OCCLUSION,
								ticks,
								format: bandTickLabel
							},
							yAxis: {
								tickLength: TICK_LENGTH,
								tickLabelProps: Y_TICK_LABEL,
								format: (v: number) => compact.format(Math.abs(v))
							},
							tooltip: { context: { locked: monthLink.locked } }
						}}
					>
						{#snippet tooltip()}
							<Chart.Tooltip labelFormatter={labelMonth} formatter={moneyRow} link={monthLink} />
						{/snippet}
						{#snippet legend({ context })}
							<Legend {context} placement="bottom" />
						{/snippet}
					</BarChart>
				</Chart.Container>
			{/snippet}
		</LazyChart>
		<!--
			What each month left behind, contributions less expenses, under the months it comes from.
			Its own scale, so a small gain still shows beside months of large flows.
		-->
		<h3 class="mt-6 text-sm font-medium">Net change</h3>
		<p class="text-sm text-muted-foreground">
			{#if tooNew && thisMonth}
				{signed(Math.round(thisMonth.net))} so far this month.
			{:else}
				{signed(Math.round(totals.net))} over {totals.months} months.
			{/if}
		</p>
		<LazyChart class="mt-2 h-36">
			{#snippet children({ BarChart, Chart })}
				<Chart.Container config={netConfig} class="aspect-auto h-36 w-full cursor-pointer">
					<BarChart
						padding={chartPadding()}
						data={monthly}
						x="month"
						xScale={scaleBand().padding(0.2)}
						seriesLayout="stackDiverging"
						series={netSeries}
						onTooltipClick={monthLink.click}
						props={{
							bars: { radius: 2, strokeWidth: 0 },
							xAxis: {
								tickLength: TICK_LENGTH,
								tickOcclusion: X_TICK_OCCLUSION,
								ticks,
								format: bandTickLabel
							},
							yAxis: {
								tickLength: TICK_LENGTH,
								tickLabelProps: Y_TICK_LABEL,
								ticks: 3,
								format: (v: number) => compact.format(v)
							},
							tooltip: { context: { locked: monthLink.locked } }
						}}
					>
						{#snippet tooltip()}
							<Chart.Tooltip labelFormatter={labelMonth} formatter={moneyRow} link={monthLink} />
						{/snippet}
					</BarChart>
				</Chart.Container>
			{/snippet}
		</LazyChart>
	</Card.Content>
</Card.Root>

<!--
The charts above as figures, for screen readers and keyboards: each month opens its transactions.
On phones the gain or loss, which is income less expenses, makes way for the rest, and the
month and the contributions heading shorten, so the table fits without scrolling sideways. On
wide screens the table stops short of the card's edge, so a month stays near its figures. The
month still in progress is ruled off with its figures in italics, as a ledger marks an entry not
yet closed, and says how far its figures go.
-->
<details class="rounded-xl border bg-card text-sm">
	<summary class="cursor-pointer px-4 py-3 font-medium">Monthly figures</summary>
	<div class="overflow-x-auto border-t">
		<table class="ledger">
			<caption class="sr-only">Contributions, expenses and balance by month</caption>
			<thead class="text-xs">
				<tr>
					<th class="py-2 pr-1.5 pl-3 sm:px-4">Month</th>
					<th class="px-1.5 py-2 text-right sm:px-4">
						<span class="sm:hidden">Gifts</span>
						<span class="hidden sm:inline">Contributions</span>
					</th>
					<th class="px-1.5 py-2 text-right sm:px-4">Expenses</th>
					<th class="hidden px-4 py-2 text-right sm:table-cell">Net change</th>
					<th class="py-2 pr-3 pl-1.5 text-right sm:px-4">Balance</th>
				</tr>
			</thead>
			<tbody>
				{#each shown as month (month.key)}
					{const partial = $derived(month.key === partialKey)}
					<tr class={partial ? 'border-t border-dashed border-rule/40 [&>td]:italic' : ''}>
						<th scope="row" class="py-2 pr-1.5 pl-3 font-normal whitespace-nowrap sm:px-4">
							<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
							<a
								href={transactionsUrl({ slug: slug, month: month.key })}
								target="_blank"
								rel="noreferrer"
								class="hover:underline"
							>
								<span class="sm:hidden">{bandTickLabel(month.key)}</span>
								<span class="hidden sm:inline">{monthLabel({ key: month.key })}</span>
								{#if partial}
									<span class="block text-xs text-muted-foreground italic">
										to {dayMonth.format(now)}
									</span>
								{/if}
								<span class="sr-only">(opens in a new tab)</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						</th>
						<td class="px-1.5 py-2 text-right sm:px-4">{money.format(month.income)}</td>
						<td class="px-1.5 py-2 text-right sm:px-4">{money.format(month.expenses)}</td>
						<td class="hidden px-4 py-2 text-right sm:table-cell"
							>{signed(Math.round(month.net))}</td
						>
						<td class="py-2 pr-3 pl-1.5 text-right sm:px-4">{money.format(month.balance)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</details>
