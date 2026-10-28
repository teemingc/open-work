<script lang="ts">
	import { TooltipLink } from '#lib/tooltip-link.svelte.js';
	import { cubicInOut } from 'svelte/easing';
	import { prefersReducedMotion, Tween } from 'svelte/motion';
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import { scaleUtc } from 'd3-scale';
	import type { TextProps } from 'layerchart';
	import { ArrowRight } from '@lucide/svelte';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { compactFormat, moneyFormat } from '#lib/chart-format.js';
	import { monthEnd, transactionsUrl, type Forecast, type Month } from '#lib/financials.js';
	import MoneyRow from './MoneyRow.svelte';

	let {
		slug,
		currency,
		months,
		shown,
		now,
		result,
		forecastWith,
		forecastSpan,
		runningLow
	}: {
		/** The collective. */
		slug: string;
		currency: string;
		/** Every month on record. */
		months: Month[];
		/** The months the range shows. */
		shown: Month[];
		now: Date;
		result: Forecast;
		/** The forecast with `net` a month in place of the average. */
		forecastWith: (net: number) => Forecast;
		/** Every month forecast, even after the money runs out. */
		forecastSpan: Date[];
		/** Under a year of money left, which the chart marks in red. */
		runningLow: boolean;
	} = $props();

	const money = $derived(moneyFormat(currency));
	const compact = $derived(compactFormat(currency));

	/**
	 * The change a month the chart draws, eased from one average to the next, so the forecast and
	 * everything drawn from it turn together rather than the line alone. Where the forecast sets the
	 * top of the axis, before or after, it changes at once: its line then ends in the top corner
	 * however steep, so easing would only slide the scale and the history under it.
	 */
	const easedNet = Tween.of(() => result.avgNet, {
		duration: (from, to) =>
			prefersReducedMotion.current ||
			[from, to].some(
				(net) => Math.max(...forecastWith(net).points.map((p) => p.balance)) > recordedTop
			)
				? 0
				: 300,
		easing: cubicInOut
	});
	/** `result` as the chart draws it, which differs only while a new average eases in. */
	const drawn = $derived(
		easedNet.current === result.avgNet ? result : forecastWith(easedNet.current)
	);
	/** The highest balance on record the chart shows: the months shown, and the year before them. */
	const recordedTop = $derived(
		Math.max(0, ...months.slice(-(shown.length + 12)).map((m) => Math.round(m.balance)))
	);

	const monthYear = new Intl.DateTimeFormat('en', {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const dayMonthYear = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});

	const history = $derived(
		shown.map((m) => ({ date: m.partial ? now : monthEnd(m.key), balance: Math.round(m.balance) }))
	);
	const projection = $derived(
		drawn.points.map((p) => ({ date: p.date, balance: Math.round(p.balance) }))
	);
	/** Each month's balance, recorded or forecast, by its "YYYY-MM" key. Recorded wins where both exist. */
	const balanceByMonth = $derived(
		new Map([
			...projection.map((p) => [p.date.toISOString().slice(0, 7), p.balance] as const),
			...months.map((m) => [m.key, Math.round(m.balance)] as const)
		])
	);
	/** The balance in the same month a year before `date`, if there is one. */
	const balanceYearBefore = (date: Date) => {
		const [year, month] = date.toISOString().slice(0, 7).split('-');
		return balanceByMonth.get(`${Number(year) - 1}-${month}`);
	};
	/**
	 * Balance and forecast against the balance a year before, the baseline that colours the chart
	 * green where the collective has more than it did and red where it has less.
	 */
	const trend = $derived(
		[...history, ...projection].map((p) => ({ ...p, yearBefore: balanceYearBefore(p.date) }))
	);
	/** The axis is sized from the series, which leave out the year before, so a richer year ran off the top. */
	const balanceMax = $derived(
		Math.max(0, ...trend.map((p) => Math.max(p.balance, p.yearBefore ?? 0)))
	);

	/** When the money runs out within the years forecast, as the projection then ends there. */
	const runsOutDate = $derived(
		result.zeroDate && result.points.at(-1)?.date.getTime() === result.zeroDate.getTime()
			? result.zeroDate
			: null
	);
	/** Where the drawn forecast reaches nothing, which moves with it while a new average eases in. */
	const runsOutX = $derived(
		drawn.zeroDate && drawn.points.at(-1)?.date.getTime() === drawn.zeroDate.getTime()
			? drawn.zeroDate
			: null
	);
	/** How wide "Forecast" is drawn, measured once the web font is in, so its arrow sits just after. */
	let forecastWidth = $state(50);

	function measureForecast(text: SVGTextElement) {
		document.fonts.ready.then(() => (forecastWidth = text.getComputedTextLength()));
	}

	const balanceConfig = {
		balance: { label: 'Balance', color: 'var(--color-chart-balance)' },
		forecast: { label: 'Forecast', color: 'var(--color-chart-balance)' }
	} satisfies ChartConfig;

	/** A point on the balance line links to that month's transactions; the forecast has none yet. */
	const balanceLink = new TooltipLink(({ date }: { date: Date }) =>
		date > now ? undefined : transactionsUrl({ slug: slug, month: date.toISOString().slice(0, 7) })
	);
</script>

{#snippet forecastLabel({ props }: { props: TextProps })}
	<g transform="translate({props.x} {props.y})" class="pointer-events-none">
		<text class="fill-muted-foreground text-xs font-medium" {@attach measureForecast}>Forecast</text
		>
		<ArrowRight x={forecastWidth + 3} y={-10} size={12} class="text-muted-foreground" />
	</g>
{/snippet}

<!--
	On two lines, which keeps it inside the forecast range on a phone. Outlined in the card's colour, so
	it reads over the hatching and the gridlines behind it.
-->
{#snippet runsOutLabel({ props }: { props: TextProps })}
	{const date = $derived(runsOutDate ?? runsOutX)}
	{#if date}
		<text
			transform="translate({props.x} {props.y})"
			text-anchor="end"
			class={[
				'pointer-events-none stroke-card! [stroke-width:4px] text-xs font-medium [paint-order:stroke] [stroke-linejoin:round]',
				runningLow ? 'fill-destructive' : 'fill-muted-foreground'
			]}
		>
			<!-- The banner's words, so a long runway never reads as a warning. -->
			<tspan x="0" dy="0.9em">{runningLow ? 'Runs out' : 'Funded until'}</tspan>
			<tspan x="0" dy="1.25em">{monthYear.format(date)}</tspan>
		</text>
	{/if}
{/snippet}

<Card.Root>
	<Card.Header>
		<Card.Title>Balance and forecast</Card.Title>
		<Card.Description>
			Green when the balance is higher than a year earlier, red when lower.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<LazyChart class="h-80">
			{#snippet children({ Area, AreaChart, Chart, ClipPath })}
				<Chart.Container config={balanceConfig} class="aspect-auto h-80 w-full cursor-pointer">
					<AreaChart
						padding={chartPadding()}
						onTooltipClick={balanceLink.click}
						x="date"
						y="balance"
						xScale={scaleUtc()}
						xDomain={[history[0]?.date ?? now, forecastSpan.at(-1) ?? now]}
						yDomain={[0, balanceMax]}
						yNice
						seriesLayout="overlap"
						highlight={{
							lines: true,
							// Hovering a dot highlights its series and fades the other one, so moving along
							// the line where balance meets forecast made the areas flicker.
							points: { class: 'pointer-events-none' }
						}}
						series={[
							{
								key: 'balance',
								label: balanceConfig.balance.label,
								color: balanceConfig.balance.color,
								data: history
							},
							{
								key: 'forecast',
								label: balanceConfig.forecast.label,
								color: balanceConfig.forecast.color,
								data: projection
							}
						]}
						annotations={[
							{
								type: 'range',
								x: [now, forecastSpan.at(-1) ?? now],
								// Above the plot, like a column heading, so it never meets the end date inside it.
								label: forecastLabel,
								labelPlacement: 'top-left',
								labelYOffset: -6,
								pattern: {
									size: 8,
									lines: {
										rotate: -45,
										color: 'var(--color-muted-foreground)',
										opacity: 0.3
									}
								}
							},
							{
								type: 'line',
								x: now,
								props: {
									line: { class: 'stroke-muted-foreground/60!', dashArray: [2, 3] }
								}
							},
							...(runsOutX
								? [
										{
											type: 'line' as const,
											x: runsOutX,
											label: runsOutLabel,
											labelPlacement: 'top-left' as const,
											labelXOffset: 6,
											labelYOffset: 8,
											props: {
												line: {
													class: runningLow ? 'stroke-destructive!' : 'stroke-muted-foreground!',
													dashArray: [2, 3]
												}
											}
										},
										{
											type: 'point' as const,
											x: runsOutX,
											y: 0,
											r: 4,
											props: {
												circle: {
													class: runningLow
														? 'fill-destructive stroke-card'
														: 'fill-muted-foreground stroke-card'
												}
											}
										}
									]
								: [])
						]}
						props={{
							xAxis: {
								tickLength: TICK_LENGTH,
								tickOcclusion: X_TICK_OCCLUSION,
								format: (d: Date) => monthYear.format(d),
								ticks: 6
							},
							yAxis: {
								tickLength: TICK_LENGTH,
								tickLabelProps: Y_TICK_LABEL,
								format: (v: number) => compact.format(v)
							},
							tooltip: { context: { locked: balanceLink.locked } }
						}}
					>
						{#snippet marks()}
							<!-- Between the balance and the year before: red where the year before is above the
				balance, green where it is below, split by clipping to either side of the balance. -->
							<ClipPath>
								{#snippet clip()}
									<Area data={trend} y0="balance" y1={() => balanceMax * 2 + 1} />
								{/snippet}
								<Area
									data={trend}
									y0="yearBefore"
									y1="balance"
									defined={(d: { yearBefore?: number }) => d.yearBefore !== undefined}
									fill="color-mix(in oklab, var(--color-destructive) 22%, transparent)"
								/>
							</ClipPath>
							<ClipPath>
								{#snippet clip()}
									<Area data={trend} y0={() => 0} y1="balance" />
								{/snippet}
								<Area
									data={trend}
									y0="yearBefore"
									y1="balance"
									defined={(d: { yearBefore?: number }) => d.yearBefore !== undefined}
									fill="color-mix(in oklab, var(--color-status-paid) 22%, transparent)"
								/>
							</ClipPath>
							<Area
								data={trend}
								y0="yearBefore"
								y1="yearBefore"
								defined={(d: { yearBefore?: number }) => d.yearBefore !== undefined}
								fill="none"
								line={{ class: 'stroke-muted-foreground', 'stroke-dasharray': '2 3' }}
							/>
							<Area seriesKey="balance" fill="none" line={{ strokeWidth: 2 }} />
							<!-- Solid like the balance: the hatched range already says it is a forecast. -->
							<Area seriesKey="forecast" fill="none" line={{ strokeWidth: 2 }} />
						{/snippet}
						{#snippet tooltip({ context })}
							{const point = $derived(context.tooltip.data as { date: Date } | null)}
							{const yearBefore = $derived(point ? balanceYearBefore(point.date) : undefined)}
							<Chart.Tooltip
								labelFormatter={(d: Date) => dayMonthYear.format(d)}
								link={balanceLink}
							>
								{#snippet formatter({ value, name, item, index, payload })}
									{#if typeof value === 'number'}
										<MoneyRow {value} {name} color={item.color} {money} />
									{/if}
									<!-- Once, after the last series, where balance and forecast meet. -->
									{#if yearBefore !== undefined && index === payload.length - 1}
										<MoneyRow
											value={yearBefore}
											name="A year earlier"
											color="var(--color-muted-foreground)"
											{money}
										/>
									{/if}
								{/snippet}
							</Chart.Tooltip>
						{/snippet}
					</AreaChart>
				</Chart.Container>
			{/snippet}
		</LazyChart>
	</Card.Content>
</Card.Root>
