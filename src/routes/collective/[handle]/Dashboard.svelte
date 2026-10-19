<script lang="ts">
	import { chartPadding, TICK_LENGTH, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { scaleBand, scaleTime } from 'd3-scale';
	import { Area, AreaChart, BarChart, Circle, LinearGradient, ScatterChart } from 'layerchart';
	import { ExternalLink, TrendingDown, TrendingUp } from '@lucide/svelte';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import {
		bandTickFormat,
		compactFormat,
		monthLabel,
		moneyFormat,
		shortName
	} from './chart-format';
	import ExpenseCategories from './ExpenseCategories.svelte';
	import {
		change,
		forecast,
		forecastRange,
		monthEnd,
		monthsBetween,
		paidTo,
		previousAverages,
		accountsByMonth,
		transactionsUrl
	} from './financials';
	import CollectiveSearch from './CollectiveSearch.svelte';
	import IncomeSources from './IncomeSources.svelte';
	import MoneyRow from './MoneyRow.svelte';
	import { rememberCollective } from '#lib/recent-collectives.js';
	import { getIncomeSources, type CollectiveStats } from './stats.remote';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import YourEarnings from './YourEarnings.svelte';

	// The stats arrive as a prop rather than from an `await` in this component. Values derived
	// after a top-level `await` stop caching once it resolves, so charts drawn later, as they
	// scroll into view, would recompute them on every read and lock up the page.
	let {
		data,
		me
	}: { data: CollectiveStats; /** Your Open Collective slug, if connected. */ me?: string } =
		$props();

	// Read without `await`. A Svelte bug: while any boundary on the page waits on an `await`, values
	// derived in components that mount in the meantime are recomputed on every read, so charts
	// mounted then (as you scroll) lock up the page.
	const incomeQuery = $derived(getIncomeSources(data.slug));

	// Any visit counts as recent, not only a pick from the search.
	$effect(() => {
		rememberCollective({ slug: data.slug, name: data.name, imageUrl: data.imageUrl });
	});

	const RANGES = { '1y': 12, '2y': 24, all: Infinity } as const;
	type Range = keyof typeof RANGES;

	let range = $state<Range>('2y');
	let basis = $state('6');

	const now = $derived(new Date(data.fetchedAt));
	const balance = $derived(data.months.at(-1)?.balance ?? 0);

	// Approved expenses will be paid soon, so they are taken out before forecasting.
	const committed = $derived(
		data.unpaid.filter((e) => e.approved).reduce((sum, e) => sum + e.amount, 0)
	);
	const awaitingApproval = $derived(
		data.unpaid.filter((e) => !e.approved).reduce((sum, e) => sum + e.amount, 0)
	);
	const available = $derived(balance - committed);

	const result = $derived(
		forecast({ months: data.months, basis: Number(basis) || 6, now, start: available })
	);
	const shown = $derived(data.months.slice(-Math.min(RANGES[range] ?? 24, data.months.length)));
	const shownKeys = $derived(shown.map((m) => m.key));

	const money = $derived(moneyFormat(data.currency));
	const compact = $derived(compactFormat(data.currency));
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });
	const signed = (value: number) => (value > 0 ? '+' : '') + money.format(value);

	const monthYear = new Intl.DateTimeFormat('en', {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const longMonthYear = new Intl.DateTimeFormat('en', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const dayMonthYear = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const partialKey = $derived(data.months.find((m) => m.partial)?.key);
	const labelMonth = (key: string) => monthLabel({ key, partialKey });

	const history = $derived(
		shown.map((m) => ({ date: m.partial ? now : monthEnd(m.key), balance: Math.round(m.balance) }))
	);
	const projection = $derived(
		result.points.map((p) => ({ date: p.date, balance: Math.round(p.balance) }))
	);
	/** How far the forecast moves when it is based on the last 3, 6 or 12 months instead. */
	const band = $derived(
		forecastRange({
			months: data.months,
			bases: [3, 6, 12],
			now,
			start: available,
			dates: result.points.map((p) => p.date)
		})
	);
	/** The axis is sized from the series, which leave out the band, so a rising band ran off the top. */
	const balanceMax = $derived(
		Math.max(
			0,
			...history.map((p) => p.balance),
			...projection.map((p) => p.balance),
			...band.map((p) => p.high)
		)
	);

	const previous = $derived(previousAverages({ months: data.months, basis: result.basis }));
	/** How each average moved against the same number of months before it. */
	const trends = $derived({
		income: previous && change(previous.avgIncome, result.avgIncome),
		expenses: previous && change(previous.avgExpenses, result.avgExpenses),
		net: previous && change(previous.avgIncome - previous.avgExpenses, result.avgNet)
	});

	const paidToMe = $derived(paidTo({ payouts: data.payouts, slug: me, months: data.months }));

	// Expenses are negative so they hang below income on the same axis.
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
				lost: m.net < 0 ? Math.round(m.net) : null
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

	const payees = $derived(accountsByMonth({ rows: data.payouts, months: shownKeys, limit: 7 }));
	const payeeName = $derived(
		new Map(payees.accounts.map((account) => [account.slug, shortName(account.name)]))
	);
	const payeeSeries = $derived(
		(['you', 'others'] as const).map((key) => ({
			key,
			label: payeeConfig[key].label,
			color: payeeConfig[key].color,
			data: payees.cells.filter((cell) => (cell.slug === me) === (key === 'you'))
		}))
	);

	const runwayMonths = $derived(result.zeroDate ? monthsBetween(now, result.zeroDate) : null);

	const balanceConfig = {
		balance: { label: 'Balance', color: 'var(--color-chart-balance)' },
		forecast: { label: 'Forecast', color: 'var(--color-chart-balance)' }
	} satisfies Chart.ChartConfig;

	const flowConfig = {
		income: { label: 'Income', color: 'var(--color-chart-income)' },
		expenses: { label: 'Expenses', color: 'var(--color-chart-expenses)' },
		you: { label: 'Paid to you', color: 'var(--color-chart-expenses)' },
		others: { label: 'Paid to others', color: 'var(--color-chart-expenses-muted)' }
	} satisfies Chart.ChartConfig;

	const flowSeries = $derived(
		(me ? (['income', 'you', 'others'] as const) : (['income', 'expenses'] as const)).map(
			(key) => ({ key, label: flowConfig[key].label, color: flowConfig[key].color })
		)
	);

	const payeeConfig = {
		you: { label: 'You', color: 'var(--color-chart-expenses)' },
		others: { label: 'Paid', color: 'var(--color-chart-expenses-muted)' }
	} satisfies Chart.ChartConfig;

	const netConfig = {
		gained: { label: 'Gained', color: 'var(--color-chart-income)' },
		lost: { label: 'Lost', color: 'var(--color-chart-expenses)' }
	} satisfies Chart.ChartConfig;

	/** Changes smaller than this are noise, so their badges stay uncoloured. */
	const STEADY = 0.05;

	/**
	 * A relative change as a trend badge, or nothing without an earlier window to compare. Coloured
	 * by whether the change is good for the collective, so rising expenses read as bad news.
	 */
	function trendBadge(change: number | undefined, goodWhen: 'up' | 'down'): Stat['badge'] {
		if (change === undefined) return undefined;
		const good = goodWhen === 'up' ? change > 0 : change < 0;
		return {
			text: `${change > 0 ? '+' : ''}${percent.format(change)}`,
			icon: change >= 0 ? 'up' : 'down',
			tone:
				Math.abs(change) < STEADY
					? undefined
					: good
						? 'border-status-paid/30 text-status-paid'
						: 'border-destructive/30 text-destructive',
			title: `Change on the ${result.basis} complete months before`
		};
	}

	const stats = $derived<Stat[]>([
		{
			label: 'Available',
			value: money.format(available),
			note: `${money.format(balance)} balance, less ${money.format(committed)} approved`,
			badge:
				runwayMonths === null
					? undefined
					: { text: `${runwayMonths} months left`, icon: 'hourglass', tone: 'text-destructive' }
		},
		{
			label: 'Average month',
			value: signed(result.avgNet),
			tone: result.avgNet < 0 ? 'text-destructive' : 'text-status-paid',
			note: `Income covers ${percent.format(result.avgExpenses ? result.avgIncome / result.avgExpenses : 1)} of expenses`,
			badge: trendBadge(trends.net, 'up')
		},
		{
			label: 'Average income',
			value: money.format(result.avgIncome),
			note: `Over the last ${result.basis} complete months`,
			badge: trendBadge(trends.income, 'up')
		},
		{
			label: 'Average expenses',
			value: money.format(result.avgExpenses),
			note: awaitingApproval
				? `${money.format(awaitingApproval)} more awaits approval`
				: `Over the last ${result.basis} complete months`,
			badge: trendBadge(trends.expenses, 'down')
		}
	]);

	function open(url: string) {
		window.open(url, '_blank', 'noopener');
	}

	function openMonth(_event: MouseEvent, { data: row }: { data: { month: string } }) {
		open(transactionsUrl({ slug: data.slug, month: row.month }));
	}

	/** A point on the balance line opens that month's transactions; the forecast has none yet. */
	function openBalanceMonth(_event: MouseEvent, { data: point }: { data: { date: Date } }) {
		if (point.date > now) return;
		open(transactionsUrl({ slug: data.slug, month: point.date.toISOString().slice(0, 7) }));
	}

	/** The "others" row has no slug, so it opens every expense. */
	function openPayee(
		_event: MouseEvent,
		{ data: cell }: { data: { slug: string; month: string } }
	) {
		open(
			transactionsUrl({
				slug: data.slug,
				month: cell.month,
				account: cell.slug || undefined,
				kinds: ['EXPENSE']
			})
		);
	}

	const tickFormat = $derived(bandTickFormat(shownKeys));
	import LazyChart from './LazyChart.svelte';
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

<div class="flex animate-in flex-col gap-8 duration-300 fade-in">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<!-- The logo and name open the collective on Open Collective; the icon says it leaves the app. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
		<a
			href={`https://opencollective.com/${data.slug}`}
			target="_blank"
			rel="noreferrer"
			class="group flex min-w-0 items-center gap-4 rounded-xl"
		>
			{#if data.imageUrl}
				<img
					src={data.imageUrl}
					alt=""
					class="size-16 shrink-0 rounded-xl border bg-card object-contain"
				/>
			{/if}
			<h1
				class="flex min-w-0 items-center gap-2 leading-none decoration-1 underline-offset-6 group-hover:underline"
			>
				<span class="truncate">{data.name}</span>
				<!-- Nudged down to sit on the baseline and fill the x-height, like a lowercase letter. -->
				<ExternalLink
					class="size-5 shrink-0 translate-y-[0.18em] text-muted-foreground group-hover:text-foreground"
					aria-hidden="true"
				/>
			</h1>
			<span class="sr-only">on Open Collective (opens in a new tab)</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		<CollectiveSearch name="Find another collective" slug={data.slug} />
	</div>

	{#if data.months.length === 0}
		<Alert.Root>
			<Alert.Title>No transactions yet</Alert.Title>
			<Alert.Description>This collective has not received or spent any money.</Alert.Description>
		</Alert.Root>
	{:else}
		<Alert.Root
			variant={result.zeroDate ? 'destructive' : 'default'}
			class={result.avgNet >= 0
				? 'border-status-paid/30 bg-status-paid/5 text-status-paid *:data-[slot=alert-description]:text-status-paid/80'
				: undefined}
		>
			{#if result.avgNet < 0}
				<TrendingDown />
			{:else}
				<TrendingUp />
			{/if}
			<Alert.Title>
				{#if result.zeroDate}
					Money runs out around {longMonthYear.format(result.zeroDate)}
				{:else if result.avgNet < 0}
					Shrinking, but no end in sight
				{:else}
					Balance is growing
				{/if}
			</Alert.Title>
			<Alert.Description>
				<p>
					{#if result.zeroDate}
						{runwayMonths} months left. The {money.format(available)} available drops by about
						{money.format(-result.avgNet)} a month, the average of the last {result.basis} complete months.
					{:else}
						The balance grows by about {money.format(result.avgNet)} a month, the average of the last
						{result.basis} complete months.
					{/if}
				</p>
			</Alert.Description>
		</Alert.Root>

		<!-- One compact strip, so the balance chart is on screen when the page opens. -->
		<StatStrip {stats} />

		<div class="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
			<div class="flex items-center gap-3">
				<span id="range-label" class="text-muted-foreground">Show</span>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					aria-labelledby="range-label"
					bind:value={() => range, (value) => value && (range = value as Range)}
				>
					<ToggleGroup.Item value="1y">12 months</ToggleGroup.Item>
					<ToggleGroup.Item value="2y">2 years</ToggleGroup.Item>
					<ToggleGroup.Item value="all">All time</ToggleGroup.Item>
				</ToggleGroup.Root>
			</div>
			<div class="flex items-center gap-3">
				<span id="basis-label" class="text-muted-foreground">Average of last</span>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					aria-labelledby="basis-label"
					bind:value={() => basis, (value) => value && (basis = value)}
				>
					<ToggleGroup.Item value="3">3 months</ToggleGroup.Item>
					<ToggleGroup.Item value="6">6 months</ToggleGroup.Item>
					<ToggleGroup.Item value="12">12 months</ToggleGroup.Item>
				</ToggleGroup.Root>
			</div>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Balance and forecast</Card.Title>
				<Card.Description>
					The dashed line assumes every month from now looks like the average month, starting from
					what is available. The shaded band shows where it lands with a 3, 6 or 12 month average.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Chart.Container config={balanceConfig} class="aspect-auto h-80 w-full cursor-pointer">
					<AreaChart
						padding={chartPadding()}
						onTooltipClick={openBalanceMonth}
						x="date"
						y="balance"
						xScale={scaleTime()}
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
								x: [now, projection.at(-1)?.date ?? now],
								label: 'Forecast',
								labelPlacement: 'top-left',
								labelXOffset: 8,
								labelYOffset: 8,
								props: {
									rect: { class: 'fill-muted/50' },
									label: { class: 'fill-muted-foreground text-xs font-medium' }
								}
							},
							...(result.zeroDate
								? [
										{
											type: 'line' as const,
											x: result.zeroDate,
											label: `Runs out ${monthYear.format(result.zeroDate)}`,
											labelPlacement: 'top-left' as const,
											labelXOffset: 6,
											// Below the "Forecast" label, which it would overlap on narrow screens.
											labelYOffset: 26,
											props: {
												line: { class: 'stroke-destructive', dashArray: [2, 3] },
												label: { class: 'fill-destructive text-xs font-medium' }
											}
										},
										{
											type: 'point' as const,
											x: result.zeroDate,
											y: 0,
											r: 4,
											props: { circle: { class: 'fill-destructive stroke-card' } }
										}
									]
								: [])
						]}
						props={{
							xAxis: {
								tickLength: TICK_LENGTH,
								format: (d: Date) => monthYear.format(d),
								ticks: 6
							},
							yAxis: {
								tickLength: TICK_LENGTH,
								tickLabelProps: Y_TICK_LABEL,
								format: (v: number) => compact.format(v)
							}
						}}
					>
						{#snippet marks()}
							<!-- Spans the whole chart rather than each area's own box, so the same height has the same
							shade. Per area, a rising forecast stretched the fade over its tall box and left a pale
							wedge below the band. -->
							<LinearGradient
								stops={[
									[0, 'color-mix(in oklab, var(--color-chart-balance) 40%, transparent)'],
									[1, 'color-mix(in oklab, var(--color-chart-balance) 2%, transparent)']
								]}
								vertical
								units="userSpaceOnUse"
							>
								{#snippet children({ gradient })}
									<Area
										data={band}
										x="date"
										y0="low"
										y1="high"
										fill="color-mix(in oklab, var(--color-chart-balance) 14%, transparent)"
									/>
									<Area seriesKey="balance" fill={gradient} line={{ strokeWidth: 2 }} />
									<Area
										seriesKey="forecast"
										fill={gradient}
										opacity={0.5}
										line={{ strokeWidth: 2, 'stroke-dasharray': '6 5' }}
									/>
								{/snippet}
							</LinearGradient>
						{/snippet}
						{#snippet tooltip()}
							<Chart.Tooltip
								labelFormatter={(d: Date) => dayMonthYear.format(d)}
								formatter={moneyRow}
							/>
						{/snippet}
					</AreaChart>
				</Chart.Container>
			</Card.Content>
		</Card.Root>

		<div class="grid gap-4 lg:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<Card.Title>Income and expenses</Card.Title>
					<Card.Description>
						{money.format(totals.income)} in, {money.format(totals.expenses)} out over {totals.months}
						complete months{#if me}, {money.format(totals.mine)}
							({percent.format(totals.expenses ? totals.mine / totals.expenses : 0)}) of it to you{/if}.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<Chart.Container config={flowConfig} class="mb-3 aspect-auto h-64 w-full cursor-pointer">
						<BarChart
							padding={chartPadding({ legend: true })}
							data={monthly}
							x="month"
							xScale={scaleBand().padding(0.2)}
							seriesLayout="stackDiverging"
							onTooltipClick={openMonth}
							legend
							series={flowSeries}
							props={{
								bars: { radius: 2, strokeWidth: 0 },
								xAxis: { tickLength: TICK_LENGTH, format: tickFormat },
								yAxis: {
									tickLength: TICK_LENGTH,
									tickLabelProps: Y_TICK_LABEL,
									format: (v: number) => compact.format(Math.abs(v))
								}
							}}
						>
							{#snippet tooltip()}
								<Chart.Tooltip labelFormatter={labelMonth} formatter={moneyRow} />
							{/snippet}
						</BarChart>
					</Chart.Container>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Gained or lost each month</Card.Title>
					<Card.Description>
						{signed(totals.net)} over {totals.months} complete months.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<Chart.Container config={netConfig} class="aspect-auto h-64 w-full cursor-pointer">
						<BarChart
							padding={chartPadding()}
							data={monthly}
							x="month"
							xScale={scaleBand().padding(0.2)}
							seriesLayout="stackDiverging"
							onTooltipClick={openMonth}
							series={[
								{ key: 'gained', label: netConfig.gained.label, color: netConfig.gained.color },
								{ key: 'lost', label: netConfig.lost.label, color: netConfig.lost.color }
							]}
							props={{
								bars: { radius: 2, strokeWidth: 0 },
								xAxis: { tickLength: TICK_LENGTH, format: tickFormat },
								yAxis: {
									tickLength: TICK_LENGTH,
									tickLabelProps: Y_TICK_LABEL,
									format: (v: number) => compact.format(v)
								}
							}}
						>
							{#snippet tooltip()}
								<Chart.Tooltip labelFormatter={labelMonth} formatter={moneyRow} />
							{/snippet}
						</BarChart>
					</Chart.Container>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- The charts above as figures, for screen readers and keyboards: each month opens its transactions. -->
		<details class="rounded-xl border bg-card text-sm">
			<summary class="cursor-pointer px-4 py-3 font-medium">Monthly figures</summary>
			<div class="overflow-x-auto border-t">
				<table class="ledger">
					<caption class="sr-only">Income, expenses and balance by month</caption>
					<thead class="text-xs">
						<tr>
							<th class="px-4 py-2">Month</th>
							<th class="px-4 py-2 text-right">Income</th>
							<th class="px-4 py-2 text-right">Expenses</th>
							<th class="px-4 py-2 text-right">Gained or lost</th>
							<th class="px-4 py-2 text-right">Balance</th>
						</tr>
					</thead>
					<tbody>
						{#each shown as month (month.key)}
							<tr>
								<th scope="row" class="px-4 py-2 font-normal">
									<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
									<a
										href={transactionsUrl({ slug: data.slug, month: month.key })}
										target="_blank"
										rel="noreferrer"
										class="hover:underline"
									>
										{labelMonth(month.key)}
										<span class="sr-only">(opens in a new tab)</span>
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								</th>
								<td class="px-4 py-2 text-right">{money.format(month.income)}</td>
								<td class="px-4 py-2 text-right">{money.format(month.expenses)}</td>
								<td class="px-4 py-2 text-right">{signed(Math.round(month.net))}</td>
								<td class="px-4 py-2 text-right">{money.format(month.balance)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>

		<div class="grid gap-4 {me ? 'lg:grid-cols-2' : ''}">
			{#if me}
				<YourEarnings
					slug={data.slug}
					currency={data.currency}
					months={shownKeys}
					{partialKey}
					{now}
					{me}
					payouts={data.payouts}
					unpaid={data.unpaid}
				/>
			{/if}
			{#if payees.cells.length > 0}
				<Card.Root>
					<Card.Header>
						<Card.Title>Who was paid</Card.Title>
						<Card.Description>
							Expenses paid out each month, by payee. The bigger the dot, the more was paid.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<LazyChart class="h-72">
							<Chart.Container config={payeeConfig} class="aspect-auto h-72 w-full cursor-pointer">
								<ScatterChart
									series={payeeSeries}
									onTooltipClick={openPayee}
									x="month"
									xScale={scaleBand()}
									xDomain={shownKeys}
									y="slug"
									yScale={scaleBand()}
									yDomain={payees.accounts.map((account) => account.slug)}
									r="amount"
									rRange={[2, 11]}
									padding={chartPadding({ left: 120 })}
									props={{
										points: { strokeWidth: 0, fillOpacity: 0.85 },
										grid: { x: false, y: true, bandAlign: 'between' },
										xAxis: { tickLength: TICK_LENGTH, format: tickFormat },
										yAxis: {
											tickLength: TICK_LENGTH,
											// Rows, not values: each label sits beside its row of dots.
											tickLabelProps: { verticalAnchor: 'middle' },
											format: (slug: string) => payeeName.get(slug) ?? ''
										},
										tooltip: { context: { mode: 'band' } }
									}}
								>
									<!--
										Rings the hovered dot. Replaces the built-in highlight, which drew its point at the
										start of the row, where it looked like another payment.
									-->
									{#snippet highlight({ context })}
										{@const cell = context.tooltip.data}
										{#if cell}
											<Circle
												cx={context.xGet(cell) + (context.xScale.bandwidth?.() ?? 0) / 2}
												cy={context.yGet(cell) + (context.yScale.bandwidth?.() ?? 0) / 2}
												r={context.rGet(cell) + 3}
												class="pointer-events-none fill-none stroke-primary"
												strokeWidth={1.5}
											/>
										{/if}
									{/snippet}
									{#snippet tooltip({ context })}
										{@const cell = context.tooltip.data as {
											name: string;
											month: string;
											amount: number;
										} | null}
										<Chart.Tooltip
											hideIndicator
											labelFormatter={() => (cell ? labelMonth(cell.month) : '')}
										>
											{#snippet formatter()}
												{#if cell}
													<MoneyRow value={cell.amount} name={cell.name} {money} />
												{/if}
											{/snippet}
										</Chart.Tooltip>
									{/snippet}
								</ScatterChart>
							</Chart.Container>
						</LazyChart>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>

		<ExpenseCategories
			slug={data.slug}
			currency={data.currency}
			months={shownKeys}
			{partialKey}
			payouts={data.payouts}
		/>

		{#if incomeQuery.current}
			<IncomeSources
				income={incomeQuery.current}
				slug={data.slug}
				currency={data.currency}
				months={shownKeys}
				{partialKey}
				{range}
				{now}
			/>
		{:else if incomeQuery.error}
			<Alert.Root variant="destructive">
				<Alert.Title>Could not load contributions</Alert.Title>
				<Alert.Description>
					<RetryableError error={incomeQuery.error} onretry={() => incomeQuery.refresh()} />
				</Alert.Description>
			</Alert.Root>
		{:else}
			<div class="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading contributions">
				{#each [0, 1] as card (card)}
					<Card.Root>
						<Card.Header>
							<Skeleton class="h-5 w-56" />
							<Skeleton class="h-4 w-72 max-w-full" />
						</Card.Header>
						<Card.Content>
							<Skeleton class="h-64 w-full" />
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	{/if}
</div>
