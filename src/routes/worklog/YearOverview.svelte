<script lang="ts">
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import { resolve } from '$app/paths';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { formatHours, formatMoney } from '#lib/format.js';
	import { converted, summarizeMonth, type WorkLogData } from '#lib/worklog.js';
	import { scaleBand } from 'd3-scale';

	let { data, year, today }: { data: WorkLogData; year: number; today: string } = $props();

	const shortMonth = new Intl.DateTimeFormat('en', { month: 'short' });
	const longMonth = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
	const monthDate = (month: string) => new Date(`${month}-01T00:00:00`);

	const months = $derived.by(() => {
		const last = today.startsWith(String(year)) ? Number(today.slice(5, 7)) : 12;
		return Array.from({ length: last }, (_, i) => {
			const month = `${year}-${String(i + 1).padStart(2, '0')}`;
			const summary = summarizeMonth({ data, month, today });
			return {
				month,
				summary,
				inExchange: converted({ data, amounts: summary.amounts })
			};
		});
	});

	const chartData = $derived(
		months.map(({ month, summary }) => ({
			month,
			expected: summary.expected,
			logged: summary.logged
		}))
	);

	const totals = $derived.by(() => {
		const amounts: Record<string, number> = {};
		for (const { summary } of months) {
			for (const [currency, amount] of Object.entries(summary.amounts)) {
				amounts[currency] = (amounts[currency] ?? 0) + amount;
			}
		}
		return {
			// Only months with logged time, so starting partway through the year is not a shortfall.
			expected: months
				.filter(({ summary }) => summary.logged > 0)
				.reduce((sum, { summary }) => sum + summary.expected, 0),
			logged: months.reduce((sum, { summary }) => sum + summary.logged, 0),
			holidays: months.reduce((sum, { summary }) => sum + summary.holidays, 0),
			leave: months.reduce((sum, { summary }) => sum + summary.leave, 0),
			amounts,
			inExchange: converted({ data, amounts })
		};
	});

	const config = {
		expected: { label: 'Expected', color: 'var(--color-chart-other)' },
		logged: { label: 'Logged', color: 'var(--color-chart-balance)' }
	} satisfies ChartConfig;

	const money = (amounts: Record<string, number>) =>
		Object.entries(amounts)
			.map(([currency, amount]) => formatMoney(amount, currency))
			.join(' + ') || '—';
</script>

{#snippet hoursRow({ value, name }: { value: unknown; name: string })}
	<div class="flex w-full justify-between gap-4">
		<span class="text-muted-foreground">{name}</span>
		<span class="font-medium tabular-nums">{formatHours(Number(value))} h</span>
	</div>
{/snippet}

<Card.Root>
	<Card.Header>
		<Card.Title>{year} so far</Card.Title>
		<Card.Description>
			{#if totals.logged === 0}
				Nothing logged in {year} yet. Each month's hours and earnings appear here as you log time.
			{:else}
				{formatHours(totals.logged)} h logged against {formatHours(totals.expected)} h expected in the
				months you logged, with {totals.holidays}
				{totals.holidays === 1 ? 'holiday' : 'holidays'} and {totals.leave} days of leave.
				{money(totals.amounts)}{#if totals.inExchange !== undefined && data.exchange}
					({formatMoney(totals.inExchange, data.exchange.to)}){/if} earned.
			{/if}
		</Card.Description>
	</Card.Header>
	{#if totals.logged > 0}
		<Card.Content class="space-y-4">
			<LazyChart class="h-56">
				{#snippet children({ BarChart, Chart, Legend })}
					<Chart.Container {config} class="aspect-auto h-56 w-full">
						<BarChart
							padding={chartPadding({ left: 44, legend: true })}
							data={chartData}
							x="month"
							xScale={scaleBand().padding(0.2)}
							seriesLayout="group"
							series={[
								{ key: 'expected', label: config.expected.label, color: config.expected.color },
								{ key: 'logged', label: config.logged.label, color: config.logged.color }
							]}
							props={{
								bars: { radius: 2, strokeWidth: 0 },
								xAxis: {
									tickLength: TICK_LENGTH,
									tickOcclusion: X_TICK_OCCLUSION,
									format: (month: string) => shortMonth.format(monthDate(month))
								},
								yAxis: {
									tickLength: TICK_LENGTH,
									tickLabelProps: Y_TICK_LABEL,
									format: (v: number) => `${v} h`
								}
							}}
						>
							{#snippet tooltip()}
								<Chart.Tooltip
									labelFormatter={(month: string) => longMonth.format(monthDate(month))}
									formatter={hoursRow}
								/>
							{/snippet}
							{#snippet legend({ context })}
								<Legend {context} placement="bottom" />
							{/snippet}
						</BarChart>
					</Chart.Container>
				{/snippet}
			</LazyChart>

			<div class="overflow-x-auto rounded-lg border bg-card">
				<table class="ledger text-sm">
					<caption class="sr-only">Hours and earnings by month</caption>
					<thead class="text-xs">
						<tr>
							<th class="px-3 py-2 font-medium">Month</th>
							<th class="px-3 py-2 text-right font-medium">Working days</th>
							<th class="px-3 py-2 text-right font-medium">Expected</th>
							<th class="px-3 py-2 text-right font-medium">Logged</th>
							<th class="px-3 py-2 text-right font-medium">Difference</th>
							<th class="px-3 py-2 text-right font-medium">Earned</th>
						</tr>
					</thead>
					<tbody>
						{#each months as { month, summary, inExchange } (month)}
							{@const difference = summary.logged - summary.expected}
							<tr>
								<td class="px-3 py-2">
									<a href="{resolve('/worklog')}?month={month}" class="hover:underline">
										{shortMonth.format(monthDate(month))}
									</a>
								</td>
								<td class="px-3 py-2 text-right">{summary.workingDays}</td>
								<td class="px-3 py-2 text-right">{formatHours(summary.expected)}</td>
								<td class="px-3 py-2 text-right">{formatHours(summary.logged)}</td>
								{#if summary.logged > 0}
									<td
										class="px-3 py-2 text-right {difference >= 0
											? 'text-status-paid'
											: 'text-destructive'}"
									>
										{difference > 0 ? '+' : ''}{formatHours(difference)}
									</td>
								{:else}
									<!-- Nothing logged is not a shortfall: the month may predate using the app. -->
									<td class="px-3 py-2 text-right text-muted-foreground">—</td>
								{/if}
								<td class="px-3 py-2 text-right">
									{inExchange !== undefined && data.exchange
										? formatMoney(inExchange, data.exchange.to)
										: money(summary.amounts)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card.Content>
	{/if}
</Card.Root>
