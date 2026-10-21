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
	import { lastMonthKeys, transactionsUrl, type Payout, type Unpaid } from './financials';
	import MoneyRow from './MoneyRow.svelte';

	let {
		slug,
		currency,
		months,
		partialKey,
		now,
		me,
		payouts,
		unpaid
	}: {
		/** The collective. */
		slug: string;
		currency: string;
		months: string[];
		partialKey?: string;
		now: Date;
		me: string;
		payouts: Payout[];
		unpaid: Unpaid[];
	} = $props();

	const money = $derived(moneyFormat(currency));
	const compact = $derived(compactFormat(currency));

	const mine = $derived(payouts.filter((payout) => payout.slug === me));
	const sumIn = (keys: string[]) =>
		mine.filter((payout) => keys.includes(payout.month)).reduce((sum, p) => sum + p.amount, 0);
	const shownTotal = $derived(sumIn(months));
	const lastYear = $derived(sumIn(lastMonthKeys(now, 12)));
	const thisYear = $derived(
		mine
			.filter((payout) => payout.month.startsWith(String(now.getUTCFullYear())))
			.reduce((sum, p) => sum + p.amount, 0)
	);

	const myUnpaid = $derived(unpaid.filter((expense) => expense.slug === me));
	const approved = $derived(
		myUnpaid.filter((e) => e.approved).reduce((sum, e) => sum + e.amount, 0)
	);
	const pending = $derived(
		myUnpaid.filter((e) => !e.approved).reduce((sum, e) => sum + e.amount, 0)
	);

	// Unpaid expenses go on the current month, the earliest they can be paid.
	const rows = $derived(
		months.map((month) => ({
			month,
			paid: Math.round(
				mine.filter((payout) => payout.month === month).reduce((sum, p) => sum + p.amount, 0)
			),
			unpaid: month === partialKey ? Math.round(approved + pending) : 0
		}))
	);

	const nothing = $derived(rows.every((row) => !row.paid && !row.unpaid));

	function openMonth(_event: MouseEvent, { data: row }: { data: { month: string } }) {
		window.open(
			transactionsUrl({ slug, month: row.month, account: me, kinds: ['EXPENSE'] }),
			'_blank',
			'noopener'
		);
	}

	const config = {
		paid: { label: 'Paid', color: 'var(--color-chart-expenses)' },
		unpaid: { label: 'Not paid yet', color: 'var(--color-chart-expenses-muted)' }
	} satisfies ChartConfig;
	import LazyChart from '#lib/components/LazyChart.svelte';
</script>

{#snippet row({ value, name, item }: { value: unknown; name: string; item: { color?: string } })}
	{#if typeof value === 'number' && value !== 0}
		<MoneyRow {value} {name} color={item.color} {money} />
	{/if}
{/snippet}

<Card.Root>
	<Card.Header>
		<Card.Title>Paid to you</Card.Title>
		<Card.Description>
			{#if nothing}
				Nothing paid to you {periodPhrase(months) || 'yet'}.
			{:else}
				{#if months.length !== 12}
					{money.format(shownTotal)} {periodPhrase(months)},
				{/if}
				{money.format(lastYear)} in the last year and
				{money.format(thisYear)} so far in {now.getUTCFullYear()}.
				{#if approved || pending}
					Not paid yet: {money.format(approved)} approved, {money.format(pending)} awaiting approval.
				{/if}
			{/if}
		</Card.Description>
	</Card.Header>
	{#if !nothing}
		<Card.Content>
			<LazyChart class="mb-3 h-64">
				{#snippet children({ BarChart, Chart })}
					<Chart.Container {config} class="aspect-auto h-64 w-full cursor-pointer">
						<BarChart
							padding={chartPadding({ legend: true })}
							data={rows}
							onTooltipClick={openMonth}
							x="month"
							xScale={scaleBand().padding(0.2)}
							seriesLayout="stack"
							legend
							series={[
								{ key: 'paid', label: config.paid.label, color: config.paid.color },
								{ key: 'unpaid', label: config.unpaid.label, color: config.unpaid.color }
							]}
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
		</Card.Content>
	{/if}
</Card.Root>
