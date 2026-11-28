<script lang="ts">
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import { clientColor } from '#lib/client-colors.js';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import { formatHours, parseIsoDate } from '#lib/format.js';
	import type { Client, YearSummary } from '#lib/worklog.js';
	import { scaleBand } from 'd3-scale';

	let { summary, clients }: { summary: YearSummary; clients: Client[] } = $props();

	/** How tall the chart's legend is, so the plot leaves it room. */
	let legendHeight = $state(20);

	const shortMonth = new Intl.DateTimeFormat('en', { month: 'short' });
	const longMonth = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });

	/** Only clients with time this year get a series. */
	const shownClients = $derived(
		clients
			.map((client, index) => ({ client, color: clientColor(client, index) }))
			.filter(({ client }) =>
				summary.months.some((month) =>
					month.clients.some((total) => total.client.id === client.id && total.hours > 0)
				)
			)
	);
	const config = $derived(
		Object.fromEntries(
			shownClients.map(({ client, color }) => [client.id, { label: client.name, color }])
		) satisfies ChartConfig
	);
	const months = $derived(
		summary.months.map((month) => ({
			month: month.month,
			...Object.fromEntries(
				shownClients.map(({ client }) => [
					client.id,
					month.clients.find((total) => total.client.id === client.id)?.hours ?? 0
				])
			)
		}))
	);
	const monthDate = (month: string) => parseIsoDate(`${month}-01`);
</script>

{#snippet hoursRow({ value, name }: { value: unknown; name: string })}
	<div class="flex w-full justify-between gap-4">
		<span class="text-muted-foreground">{name}</span>
		<span class="font-medium tabular-nums">{formatHours(Number(value))} h</span>
	</div>
{/snippet}

<Card.Root class="@container/card">
	<Card.Header>
		<Card.Title>Hours each month</Card.Title>
	</Card.Header>
	<Card.Content class="px-2 pt-4 sm:px-6 sm:pt-6">
		<LazyChart class="h-64">
			{#snippet children({ BarChart, Chart, Legend, legendMotion })}
				<Chart.Container {config} class="aspect-auto h-64 w-full">
					<BarChart
						padding={chartPadding({
							left: 44,
							legend: shownClients.length > 1 ? legendHeight : false
						})}
						data={months}
						x="month"
						xScale={scaleBand().padding(0.25)}
						seriesLayout="stack"
						series={shownClients.map(({ client, color }) => ({
							key: client.id,
							label: client.name,
							color
						}))}
						props={{
							bars: { radius: 2, strokeWidth: 0, motion: legendMotion },
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
						<!-- One client needs no key: the title says what the bars are. -->
						{#snippet legend({ context })}
							{#if shownClients.length > 1}
								<Legend {context} bind:height={legendHeight} />
							{/if}
						{/snippet}
					</BarChart>
				</Chart.Container>
			{/snippet}
		</LazyChart>
	</Card.Content>
</Card.Root>
