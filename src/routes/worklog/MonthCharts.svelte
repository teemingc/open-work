<script lang="ts">
	import { chartPadding, TICK_LENGTH, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import { formatHours, parseIsoDate } from '#lib/format.js';
	import type { Client, MonthSummary } from '#lib/worklog.js';
	import { scaleBand, scaleTime } from 'd3-scale';
	import { BarChart, LineChart } from 'layerchart';
	import { clientColor } from './colors';

	let { summary, clients, today }: { summary: MonthSummary; clients: Client[]; today: string } =
		$props();

	const dayMonth = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' });
	const weekdayDayMonth = new Intl.DateTimeFormat('en', {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});

	const paceConfig = {
		expected: { label: 'Expected', color: 'var(--color-chart-other)' },
		logged: { label: 'Logged', color: 'var(--color-chart-balance)' }
	} satisfies Chart.ChartConfig;

	const expectedLine = $derived(
		summary.days.map((day) => ({ date: parseIsoDate(day.date), hours: day.cumulativeExpected }))
	);
	// Stops at today: the days ahead have nothing logged yet.
	const loggedLine = $derived(
		summary.days
			.filter((day) => day.date <= today)
			.map((day) => ({ date: parseIsoDate(day.date), hours: day.cumulativeLogged }))
	);

	/** Only clients with time this month get a series. */
	const shownClients = $derived(
		clients
			.map((client, index) => ({ client, color: clientColor(index) }))
			.filter(({ client }) => summary.clients.some((total) => total.client.id === client.id))
	);
	const dailyConfig = $derived(
		Object.fromEntries(
			shownClients.map(({ client, color }) => [client.id, { label: client.name, color }])
		) satisfies Chart.ChartConfig
	);
	const daily = $derived(
		summary.days.map((day) => ({
			date: day.date,
			...Object.fromEntries(
				shownClients.map(({ client }) => [client.id, day.byClient[client.id] ?? 0])
			)
		}))
	);
	const dayLabel = (date: string) => String(parseIsoDate(date).getDate());
</script>

{#snippet hoursRow({ value, name }: { value: unknown; name: string })}
	<div class="flex w-full justify-between gap-4">
		<span class="text-muted-foreground">{name}</span>
		<span class="font-medium tabular-nums">{formatHours(Number(value))} h</span>
	</div>
{/snippet}

<div class="grid gap-4">
	<Card.Root>
		<Card.Header>
			<Card.Title>Pace</Card.Title>
			<Card.Description>Hours logged so far against what the working days expect.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Chart.Container config={paceConfig} class="aspect-auto h-64 w-full">
				<LineChart
					padding={chartPadding({ left: 44, legend: true })}
					x="date"
					y="hours"
					xScale={scaleTime()}
					yDomain={[0, null]}
					yNice
					legend
					series={[
						{
							key: 'expected',
							label: paceConfig.expected.label,
							color: paceConfig.expected.color,
							data: expectedLine,
							props: { 'stroke-dasharray': '5 4' }
						},
						{
							key: 'logged',
							label: paceConfig.logged.label,
							color: paceConfig.logged.color,
							data: loggedLine,
							props: { strokeWidth: 2 }
						}
					]}
					props={{
						xAxis: { tickLength: TICK_LENGTH, format: (d: Date) => dayMonth.format(d), ticks: 5 },
						yAxis: {
							tickLength: TICK_LENGTH,
							tickLabelProps: Y_TICK_LABEL,
							format: (v: number) => `${v} h`
						}
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip
							labelFormatter={(d: Date) => weekdayDayMonth.format(d)}
							formatter={hoursRow}
						/>
					{/snippet}
				</LineChart>
			</Chart.Container>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Hours each day</Card.Title>
			<Card.Description
				>By client. A working day expects {formatHours(
					summary.expected / Math.max(1, summary.workingDays)
				)} h.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<Chart.Container config={dailyConfig} class="aspect-auto h-64 w-full">
				<BarChart
					padding={chartPadding({ left: 44, legend: shownClients.length > 1 })}
					data={daily}
					x="date"
					xScale={scaleBand().padding(0.2)}
					seriesLayout="stack"
					legend={shownClients.length > 1}
					series={shownClients.map(({ client, color }) => ({
						key: client.id,
						label: client.name,
						color
					}))}
					props={{
						bars: { radius: 2, strokeWidth: 0 },
						xAxis: {
							tickLength: TICK_LENGTH,
							format: (date: string) => {
								const day = parseIsoDate(date).getDate();
								return day === 1 || day % 5 === 0 ? dayLabel(date) : '';
							}
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
							labelFormatter={(date: string) => weekdayDayMonth.format(parseIsoDate(date))}
							formatter={hoursRow}
						/>
					{/snippet}
				</BarChart>
			</Chart.Container>
		</Card.Content>
	</Card.Root>
</div>
