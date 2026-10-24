<script lang="ts">
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { TooltipLink } from '#lib/tooltip-link.svelte.js';
	import { scaleLinear, scaleTime } from 'd3-scale';
	import { compactFormat, moneyFormat } from './chart-format';
	import { monthsBetween, transactionsUrl } from './financials';
	import type { AheadPoint, HistoryPoint, Recipient, Round } from './grants';
	import MoneyRow from './MoneyRow.svelte';

	let {
		points,
		ahead,
		capped,
		rounds,
		monthly,
		quietSince,
		slug,
		currency,
		now
	}: {
		/** All it had received and given away so far. */
		points: HistoryPoint[];
		/** All it will have given if it keeps up its monthly gifts, from now; empty without any. */
		ahead: AheadPoint[];
		/** The monthly gifts are paid for past the last of `ahead`, which stops at a limit. */
		capped: boolean;
		/** Every day it gave on, to say in a tooltip what a step was. */
		rounds: Round[];
		/** Who it gives to every month, and how much, which is what the line ahead climbs by. */
		monthly: Recipient[];
		/** When it last gave, if it has not given for a while, so the quiet stretch is marked. */
		quietSince: Date | undefined;
		/** The fund's own slug, for links to its transactions. */
		slug: string;
		currency: string;
		now: Date;
	} = $props();

	const money = $derived(moneyFormat(currency));
	const compact = $derived(compactFormat(currency));
	const monthYear = new Intl.DateTimeFormat('en', {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const dayMonth = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});
	const dayMonthYear = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});

	const config = {
		received: { label: 'Received', color: 'var(--color-chart-income)' },
		given: { label: 'Given away', color: 'var(--color-chart-expenses)' },
		ahead: { label: 'Monthly gifts ahead', color: 'var(--color-chart-expenses)' }
	} satisfies ChartConfig;

	const received = $derived(points.at(-1)?.received ?? 0);
	/** One money scale for both sides, so the lines run on across today. */
	const yMax = $derived(scaleLinear().domain([0, received]).nice().domain()[1]);
	const start = $derived(points[0]?.date ?? now);
	/** Under a few months, days tell the steps apart better than months. */
	const short = $derived(monthsBetween(start, now) < 3);

	const roundOn = $derived(new Map(rounds.map((round) => [round.key, round])));
	type Step = HistoryPoint & { round?: Round };
	/**
	 * One point a day, holding the day's last totals, so a day with several gifts is one step and its
	 * tooltip says all it gave that day.
	 */
	const days = $derived(
		points.reduce<Step[]>((days, point) => {
			const key = point.date.toISOString().slice(0, 10);
			const last = days.at(-1);
			if (last && last.date.toISOString().slice(0, 10) === key)
				Object.assign(last, { received: point.received, given: point.given });
			else days.push({ ...point });
			return days;
		}, [])
	);
	/** Running totals hold until the next change, so each point is drawn as a step. */
	const steps = $derived(
		days.flatMap((day, index): Step[] => {
			const before = days[index - 1];
			if (!before) return [day];
			const round =
				day.given > before.given ? roundOn.get(day.date.toISOString().slice(0, 10)) : undefined;
			return [
				{ ...before, date: day.date },
				{ ...day, round }
			];
		})
	);
	const end = $derived(ahead.at(-1)?.date);
	const perMonth = $derived(monthly.reduce((sum, r) => sum + r.monthly, 0));

	/** Up to this many projects in a round are named; past it, how many, with their logos below. */
	const NAMED = 3;
	/** Past this many, a round's logos end in a count, so the tooltip stays one row. */
	const LOGOS = 16;

	/** Who a round went to, the most given first, in a line short enough for a tooltip. */
	const names = (round: Round) => {
		const [first, second, ...rest] = round.gifts.map((gift) => gift.name);
		if (!second) return first;
		if (!rest.length) return `${first} and ${second}`;
		if (rest.length === 1) return `${first}, ${second} and ${rest[0]}`;
		return `${first}, ${second} and ${rest.length} more`;
	};

	const pastLink = new TooltipLink(({ date }: Step) =>
		transactionsUrl({ slug, month: date.toISOString().slice(0, 7), kinds: ['CONTRIBUTION'] })
	);
	const aheadLink = new TooltipLink(
		() => `https://opencollective.com/${slug}/recurring-contributions`
	);

	const axis = { tickLength: TICK_LENGTH, tickOcclusion: X_TICK_OCCLUSION };
	/** The days it gave on, each where its step rises to. */
	const risers = $derived(steps.filter((step) => step.round));
	/** A few days of giving are marked by their own dates rather than evenly spaced ones. */
	const dayTicks = $derived(short && risers.length <= 4 ? risers.map((step) => step.date) : 2);
	/** Room a dot needs after the one before it, in pixels, so a busy stretch is not a row of dots. */
	const DOT_ROOM = 16;
	/** The giving days that get a dot: each at least {@link DOT_ROOM} after the last one marked. */
	function spaced(x: (date: Date) => number) {
		let last = -Infinity;
		return new Set(
			risers.filter((step) => {
				if (x(step.date) - last < DOT_ROOM) return false;
				last = x(step.date);
				return true;
			})
		);
	}
	/** Room a round's label needs after the one before it, or the axis, in pixels. */
	const LABEL_ROOM = 44;
	const given = $derived(days.at(-1)?.given ?? 0);
	/** The new years ahead, which mark the months ahead with the fewest labels. */
	const years = $derived.by(() => {
		if (!end) return [];
		const ticks: Date[] = [];
		const span = end.getTime() - now.getTime();
		for (let year = now.getUTCFullYear() + 1; year <= end.getUTCFullYear(); year++) {
			const tick = new Date(Date.UTC(year, 0, 1));
			// Too close to today, its label would run into the last date before it.
			if (tick.getTime() - now.getTime() >= span * 0.15) ticks.push(tick);
		}
		return ticks;
	});
</script>

{#snippet logos(items: { slug: string; imageUrl: string | null; ringed: boolean }[])}
	<!-- Ringed in pink where the gift is monthly, as in the pack. -->
	<ul class="flex max-w-[min(26rem,80vw)] flex-wrap gap-1.5 p-0.5" aria-hidden="true">
		{#each items.slice(0, LOGOS) as item (item.slug)}
			<li
				class={[
					'size-4 shrink-0 overflow-hidden rounded-full bg-card',
					item.ringed
						? 'ring-2 ring-chart-expenses ring-offset-1 ring-offset-background'
						: 'ring-1 ring-border'
				]}
			>
				{#if item.imageUrl}
					<img src={item.imageUrl} alt="" class="size-full object-cover" />
				{/if}
			</li>
		{/each}
		{#if items.length > LOGOS}
			<li class="flex h-4 items-center rounded-full bg-muted px-1.5 text-[10px] font-medium">
				+{items.length - LOGOS}
			</li>
		{/if}
	</ul>
{/snippet}

<div class="flex h-64">
	<LazyChart class="h-full flex-1 {ahead.length ? 'sm:flex-2' : ''}">
		{#snippet children({ Area, AreaChart, Chart, LinearGradient, Pattern })}
			<Chart.Container {config} class="aspect-auto size-full cursor-pointer">
				<AreaChart
					data={steps}
					padding={chartPadding({ left: 36, right: ahead.length ? 0 : 8 })}
					onTooltipClick={pastLink.click}
					x="date"
					xScale={scaleTime()}
					xDomain={[start, now]}
					yDomain={[0, yMax]}
					seriesLayout="overlap"
					highlight={{
						lines: true,
						// Hovering a dot would put its series in focus and fade the other one's line.
						points: { class: 'pointer-events-none' }
					}}
					series={[
						{ key: 'received', label: config.received.label, color: config.received.color },
						{ key: 'given', label: config.given.label, color: config.given.color }
					]}
					annotations={quietSince
						? [
								{
									type: 'range',
									x: [quietSince, now],
									label: `Nothing given since ${dayMonthYear.format(quietSince)}`,
									labelPlacement: 'top-left',
									labelYOffset: -6,
									pattern: {
										size: 8,
										lines: { rotate: -45, color: 'var(--color-muted-foreground)', opacity: 0.3 }
									}
								}
							]
						: []}
					props={{
						xAxis: {
							...axis,
							ticks: dayTicks,
							format: (d: Date) => (short ? dayMonth : monthYear).format(d)
						},
						yAxis: {
							tickLength: TICK_LENGTH,
							tickLabelProps: Y_TICK_LABEL,
							format: (v: number) => compact.format(v)
						},
						tooltip: { context: { locked: pastLink.locked } }
					}}
				>
					{#snippet marks()}
						<Pattern
							size={6}
							lines={{ rotate: -45, color: 'var(--color-chart-balance)', opacity: 0.25 }}
						>
							{#snippet children({ pattern })}
								<Area y0="given" y1="received" fill={pattern} />
							{/snippet}
						</Pattern>
						<LinearGradient
							vertical
							stops={[
								'color-mix(in oklab, var(--color-chart-expenses) 22%, transparent)',
								'color-mix(in oklab, var(--color-chart-expenses) 4%, transparent)'
							]}
						>
							{#snippet children({ gradient })}
								<Area y0={() => 0} y1="given" fill={gradient} />
							{/snippet}
						</LinearGradient>
						<Area seriesKey="received" fill="none" line={{ strokeWidth: 2 }} />
						<Area seriesKey="given" fill="none" line={{ strokeWidth: 2 }} />
					{/snippet}
					{#snippet aboveMarks({ context })}
						<!--
							The days it gave, where there is room for a dot, with what it gave where there is room to
							say. The step line shows every rise; the dots only pick out the ones that stand apart.
						-->
						{const dotted = $derived(spaced(context.xScale))}
						{#each risers as step, index (step.date.getTime())}
							{@const x = context.xScale(step.date)}
							{@const y = context.yScale(step.given)}
							{@const before = risers[index - 1]}
							{#if dotted.has(step)}
								<circle
									cx={x}
									cy={y}
									r="3.5"
									class="pointer-events-none fill-chart-expenses stroke-card"
									stroke-width="1.5"
								/>
							{/if}
							{#if step.round && x - (before ? context.xScale(before.date) : 0) >= LABEL_ROOM}
								<text
									x={x - 5}
									y={y - 6}
									text-anchor="end"
									paint-order="stroke"
									stroke-width="4"
									class="pointer-events-none fill-chart-expenses stroke-card! font-medium tabular-nums"
									>+{compact.format(step.round.total)}</text
								>
							{/if}
						{/each}
						<text
							x={4}
							y={context.yScale(received) - 6}
							paint-order="stroke"
							stroke-width="4"
							class="pointer-events-none fill-chart-income stroke-card! font-medium"
							>{config.received.label}</text
						>
						<text
							x={context.width - 6}
							y={context.yScale(0) - 8}
							text-anchor="end"
							paint-order="stroke"
							stroke-width="4"
							class="pointer-events-none fill-chart-expenses stroke-card! font-medium"
							>{config.given.label}</text
						>
						{#if !ahead.length}
							<text
								x={context.width - 6}
								y={(context.yScale(given) + context.yScale(received)) / 2}
								text-anchor="end"
								dominant-baseline="central"
								paint-order="stroke"
								stroke-width="4"
								class="pointer-events-none fill-chart-balance stroke-card! font-medium"
								>Still to give</text
							>
						{/if}
					{/snippet}
					{#snippet tooltip({ context })}
						{@const step = context.tooltip.data as Step | null}
						<Chart.Tooltip
							labelFormatter={(d: Date) => dayMonthYear.format(d)}
							href={pastLink.href}
						>
							<!--
								Only what happened that day, so the tooltip stays small enough to see the chart past;
								what it received is on the chart and in the figures above.
							-->
							{#snippet formatter({ value, item })}
								{#if item.key === 'given' && typeof value === 'number'}
									{#if step?.round}
										{@const gifts = step.round.gifts}
										{@const amount = money.format(step.round.total)}
										<div class="grid gap-2">
											<p class="max-w-80 text-pretty text-muted-foreground">
												Gave <span class="font-medium text-foreground tabular-nums">{amount}</span>
												to {gifts.length <= NAMED ? names(step.round) : `${gifts.length} projects`}
											</p>
											{@render logos(gifts.map((gift) => ({ ...gift, ringed: gift.recurring })))}
										</div>
									{:else}
										<MoneyRow {value} name="Given so far" {money} />
									{/if}
								{/if}
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</AreaChart>
			</Chart.Container>
		{/snippet}
	</LazyChart>
	{#if ahead.length && end}
		<LazyChart class="h-full flex-1 sm:flex-3">
			{#snippet children({ Area, AreaChart, Chart, Pattern })}
				<Chart.Container {config} class="aspect-auto size-full cursor-pointer">
					<AreaChart
						data={ahead}
						padding={{ ...chartPadding({ left: 0 }), left: 0 }}
						onTooltipClick={aheadLink.click}
						x="date"
						xScale={scaleTime()}
						xDomain={[now, end]}
						yDomain={[0, yMax]}
						axis="x"
						seriesLayout="overlap"
						highlight={{
							lines: true,
							// Hovering a dot would put its series in focus and fade the other one's line.
							points: { class: 'pointer-events-none' }
						}}
						series={[
							{
								key: 'received',
								label: config.received.label,
								color: config.received.color,
								value: () => received
							},
							{ key: 'given', label: 'Total given away by then', color: config.ahead.color }
						]}
						annotations={[
							{
								type: 'line',
								x: now,
								props: { line: { class: 'stroke-muted-foreground/60!', dashArray: [2, 3] } }
							},
							{
								type: 'point',
								x: end,
								y: ahead.at(-1)?.given ?? 0,
								r: 4,
								label: `Funded ${capped ? 'past' : 'to'} ${monthYear.format(end)}`,
								labelPlacement: 'top-left',
								labelYOffset: 10,
								props: {
									circle: { class: 'fill-chart-expenses stroke-card' },
									label: { class: 'fill-chart-expenses font-medium' }
								}
							}
						]}
						props={{
							xAxis: years.length
								? { ...axis, ticks: years, format: (d: Date) => `${d.getUTCFullYear()}` }
								: { ...axis, ticks: 2, format: (d: Date) => monthYear.format(d) },
							tooltip: { context: { locked: aheadLink.locked } }
						}}
					>
						{#snippet marks()}
							<!-- What it still holds, used up month by month by the monthly gifts. -->
							<Pattern
								size={6}
								lines={{ rotate: -45, color: 'var(--color-chart-balance)', opacity: 0.25 }}
							>
								{#snippet children({ pattern })}
									<Area y0="given" y1={() => received} fill={pattern} />
								{/snippet}
							</Pattern>
							<Area seriesKey="received" fill="none" line={{ strokeWidth: 2 }} />
							<Area
								seriesKey="given"
								fill="none"
								line={{ strokeWidth: 2, 'stroke-dasharray': '5 4' }}
							/>
						{/snippet}
						{#snippet aboveMarks({ context })}
							<text
								x={8}
								y={context.yScale(given + (received - given) * 0.7)}
								dominant-baseline="central"
								paint-order="stroke"
								stroke-width="4"
								class="pointer-events-none fill-chart-balance stroke-card! font-medium"
								>Still to give</text
							>
							<!-- On the same line as "Given away" across today. -->
							<text
								x={6}
								y={context.yScale(0) - 8}
								paint-order="stroke"
								stroke-width="4"
								class="pointer-events-none fill-muted-foreground stroke-card! font-medium"
								>Today</text
							>
						{/snippet}
						{#snippet tooltip()}
							<Chart.Tooltip
								labelFormatter={(d: Date) => monthYear.format(d)}
								href={aheadLink.href}
							>
								{#snippet formatter({ value, name, item })}
									{#if item.key === 'given' && typeof value === 'number'}
										<!-- Why the line climbs: the monthly gifts, and who they go to. -->
										<div class="grid w-full gap-2">
											<p class="text-muted-foreground">
												Gives <span class="font-medium text-foreground tabular-nums"
													>{money.format(perMonth)}</span
												>
												to {monthly.length}
												{monthly.length === 1 ? 'project' : 'projects'} every month
											</p>
											{@render logos(monthly.map((r) => ({ ...r, ringed: false })))}
											<MoneyRow {value} {name} {money} />
										</div>
									{/if}
								{/snippet}
							</Chart.Tooltip>
						{/snippet}
					</AreaChart>
				</Chart.Container>
			{/snippet}
		</LazyChart>
	{/if}
</div>
