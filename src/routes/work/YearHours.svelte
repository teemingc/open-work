<script lang="ts">
	import { resolve } from '$app/paths';
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import { formatHours, formatMoney, parseIsoDate } from '#lib/format.js';
	import { homeAmount, type WorkLogData, type YearSummary } from '#lib/worklog.js';
	import { scaleTime } from 'd3-scale';

	let { data, summary, today }: { data: WorkLogData; summary: YearSummary; today: string } =
		$props();

	/** How tall the chart's legend is, so the plot leaves it room. */
	let legendHeight = $state(20);

	const shortMonth = new Intl.DateTimeFormat('en', { month: 'short' });
	const dayMonth = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' });

	const config = {
		expected: { label: 'Expected', color: 'var(--color-chart-other)' },
		logged: { label: 'Logged', color: 'var(--color-chart-balance)' }
	} satisfies ChartConfig;

	const points = $derived(summary.days.map((day) => ({ ...day, date: parseIsoDate(day.date) })));
	const logged = (point: { logged: number | null }) => point.logged !== null;
	const todayDate = $derived(
		points.some((point) => point.logged !== null) && points.some((point) => point.logged === null)
			? parseIsoDate(today)
			: undefined
	);

	/** The months up to this one: those ahead have nothing to show yet. */
	const rows = $derived(
		summary.months
			.filter((month) => month.month <= today.slice(0, 7))
			.map((month) => ({
				month: month.month,
				logged: month.logged,
				difference: month.logged - month.expectedSoFar,
				earned: homeAmount({ data, amounts: month.amounts })
			}))
	);
</script>

{#snippet hoursRow({ value, name }: { value: unknown; name: string })}
	{#if value !== null && value !== undefined}
		<div class="flex w-full justify-between gap-4">
			<span class="text-muted-foreground">{name}</span>
			<span class="font-medium tabular-nums">{formatHours(Number(value))} h</span>
		</div>
	{/if}
{/snippet}

<Card.Root>
	<Card.Header>
		<Card.Title>Hours</Card.Title>
		<Card.Description>
			{formatHours(summary.logged)} h logged against {formatHours(summary.expectedSoFar)} h expected so
			far, of {formatHours(summary.expected)} h for the year.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<LazyChart class="h-64">
			{#snippet children({ AnnotationLine, Area, AreaChart, Chart, Legend, Threshold })}
				<Chart.Container {config} class="aspect-auto h-64 w-full">
					<AreaChart
						padding={chartPadding({ left: 52, legend: legendHeight })}
						data={points}
						x="date"
						xScale={scaleTime()}
						y={['logged', 'expected']}
						yDomain={[0, null]}
						yNice
						series={[
							{ key: 'expected', label: config.expected.label, color: config.expected.color },
							{ key: 'logged', label: config.logged.label, color: config.logged.color }
						]}
						props={{
							xAxis: {
								tickLength: TICK_LENGTH,
								tickOcclusion: X_TICK_OCCLUSION,
								format: (d: Date) => shortMonth.format(d)
							},
							yAxis: {
								tickLength: TICK_LENGTH,
								tickLabelProps: Y_TICK_LABEL,
								format: (v: number) => `${v} h`
							}
						}}
					>
						{#snippet marks()}
							<!-- Shaded between the two running totals, like the collective's recurring backers. -->
							<Threshold defined={logged}>
								{#snippet above({ defined })}
									<Area
										y0="logged"
										y1="expected"
										{defined}
										fill="color-mix(in oklab, var(--color-status-paid) 22%, transparent)"
									/>
								{/snippet}
								{#snippet below({ defined })}
									<Area
										y0="logged"
										y1="expected"
										{defined}
										fill="color-mix(in oklab, var(--color-destructive) 22%, transparent)"
									/>
								{/snippet}
							</Threshold>
							<Area
								y0="expected"
								y1="expected"
								fill="none"
								line={{ class: 'stroke-muted-foreground', 'stroke-dasharray': '4 4' }}
							/>
							<Area
								y0="logged"
								y1="logged"
								defined={logged}
								fill="none"
								line={{ stroke: config.logged.color, strokeWidth: 2 }}
							/>
						{/snippet}
						{#snippet aboveMarks()}
							{#if todayDate}
								<AnnotationLine
									x={todayDate}
									label="Today"
									props={{
										line: { class: 'stroke-muted-foreground', 'stroke-dasharray': '2 2' },
										label: { class: 'fill-muted-foreground text-xs' }
									}}
								/>
							{/if}
						{/snippet}
						{#snippet tooltip()}
							<Chart.Tooltip
								labelFormatter={(d: Date) => dayMonth.format(d)}
								formatter={hoursRow}
							/>
						{/snippet}
						{#snippet legend({ context })}
							<Legend {context} bind:height={legendHeight} />
						{/snippet}
					</AreaChart>
				</Chart.Container>
			{/snippet}
		</LazyChart>

		<div class="-mx-3 overflow-x-auto">
			<table class="ledger text-sm max-sm:ledger-stacked">
				<caption class="sr-only">Hours and earnings by month</caption>
				<thead class="text-xs">
					<tr>
						<th class="px-3 py-2 font-medium">Month</th>
						<th class="px-3 py-2 text-right font-medium">Logged</th>
						<th class="px-3 py-2 text-right font-medium">Against expected</th>
						<th class="px-3 py-2 text-right font-medium">Earned</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.month)}
						<tr>
							<td class="px-3 py-2">
								<a href="{resolve('/worklog')}?month={row.month}" class="hover:underline">
									{shortMonth.format(parseIsoDate(`${row.month}-01`))}
								</a>
							</td>
							<td data-label="Logged" class="px-3 py-2 text-right">{formatHours(row.logged)}</td>
							<td
								data-label="Against expected"
								class={[
									'px-3 py-2 text-right',
									row.difference >= 0 ? 'text-status-paid' : 'text-destructive'
								]}
							>
								{row.difference > 0 ? '+' : ''}{formatHours(row.difference)}
							</td>
							<td data-label="Earned" class="px-3 py-2 text-right">
								{row.earned ? formatMoney(row.earned.amount, row.earned.currency) : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Card.Content>
</Card.Root>
