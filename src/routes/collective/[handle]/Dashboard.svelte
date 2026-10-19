<script lang="ts">
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { scaleBand, scaleTime } from 'd3-scale';
	import { CalendarClock, ExternalLink, TrendingDown, TrendingUp } from '@lucide/svelte';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import { bandTickLabel, bandTicks, compactFormat, monthLabel, moneyFormat } from './chart-format';
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
	import {
		getIncomeSources,
		type CollectiveStats,
		type IncomeSources as Income
	} from './stats.remote';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import YourEarnings from './YourEarnings.svelte';

	// The stats arrive as a prop rather than from an `await` in this component. Values derived
	// after a top-level `await` stop caching once it resolves, so charts drawn later, as they
	// scroll into view, would recompute them on every read and lock up the page.
	let {
		data,
		me,
		income: cachedIncome
	}: {
		data: CollectiveStats;
		/** Your Open Collective slug, if connected. */
		me?: string;
		/** The contributions, if the server already had them. */
		income: Income | null;
	} = $props();

	// Fetched only when the server did not have them yet. Read without `await`. A Svelte bug: while
	// any boundary on the page waits on an `await`, values derived in components that mount in the
	// meantime are recomputed on every read, so charts mounted then (as you scroll) lock up the page.
	const incomeQuery = $derived(cachedIncome ? undefined : getIncomeSources(data.slug));
	const income = $derived(cachedIncome ?? incomeQuery?.current);

	// Any visit counts as recent, not only a pick from the search.
	$effect(() => {
		rememberCollective({ slug: data.slug, name: data.name, imageUrl: data.imageUrl });
	});

	const RANGES = { '1y': 12, '2y': 24, all: Infinity } as const;
	type Range = keyof typeof RANGES;

	let range = $state<Range>('2y');
	let basis = $state('6');

	const now = $derived(new Date(data.fetchedAt));
	/** The name split before its last word, which keeps the link icon beside it. */
	const nameStart = $derived(data.name.slice(0, data.name.lastIndexOf(' ') + 1));
	const nameEnd = $derived(data.name.slice(nameStart.length));
	/** The averages and forecast need at least one month that is over. */
	const tooNew = $derived(data.months.every((m) => m.partial));
	/** This month so far, which a collective too new to forecast has alone. */
	const thisMonth = $derived(data.months.find((m) => m.partial));
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
	/** Everything that came in and went out in the months shown, this month included. */
	const shownIncome = $derived(shown.reduce((sum, m) => sum + m.income, 0));
	const shownExpenses = $derived(shown.reduce((sum, m) => sum + m.expenses, 0));

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

	/** How wide a payee's name may be beside the "Who was paid" chart. */
	const PAYEE_LABEL_WIDTH = 110;
	/** Room for a payee's total, like "$12,300", on the other side. */
	const PAYEE_TOTAL_WIDTH = 60;
	/** The payee chart's width, for sizing its dots. */
	let payeeWidth = $state(0);
	/**
	 * The biggest dot: under half a month's width, so dots in neighbouring months never overlap and
	 * each is its own target, but no bigger than 11px however wide the chart.
	 */
	const payeeMaxRadius = $derived.by(() => {
		const plot =
			payeeWidth - (PAYEE_LABEL_WIDTH + TICK_LENGTH + 6) - (PAYEE_TOTAL_WIDTH + TICK_LENGTH);
		return Math.max(1.5, Math.min(11, (plot / Math.max(1, shownKeys.length)) * 0.45));
	});
	/** The axis labels' size, for measuring them. */
	const LABEL_STYLE = { fontSize: '12px' } as CSSStyleDeclaration;
	const payees = $derived(accountsByMonth({ rows: data.payouts, months: shownKeys, limit: 7 }));
	const payeeName = $derived(
		new Map(payees.accounts.map((account) => [account.slug, account.name]))
	);
	/** What each payee was paid over the months shown, for the column beside the chart. */
	const payeeTotals = $derived(
		payees.cells.reduce(
			(totals, cell) => totals.set(cell.slug, (totals.get(cell.slug) ?? 0) + cell.amount),
			new Map<string, number>()
		)
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
	} satisfies ChartConfig;

	const flowConfig = {
		income: { label: 'Income', color: 'var(--color-chart-income)' },
		expenses: { label: 'Expenses', color: 'var(--color-chart-expenses)' },
		you: { label: 'Paid to you', color: 'var(--color-chart-expenses)' },
		others: { label: 'Paid to others', color: 'var(--color-chart-expenses-muted)' }
	} satisfies ChartConfig;

	const flowSeries = $derived(
		(me ? (['income', 'you', 'others'] as const) : (['income', 'expenses'] as const)).map(
			(key) => ({ key, label: flowConfig[key].label, color: flowConfig[key].color })
		)
	);

	const payeeConfig = {
		you: { label: 'You', color: 'var(--color-chart-expenses)' },
		others: { label: 'Paid', color: 'var(--color-chart-expenses-muted)' }
	} satisfies ChartConfig;

	const netConfig = {
		gained: { label: 'Gained', color: 'var(--color-chart-income)' },
		lost: { label: 'Lost', color: 'var(--color-chart-expenses)' }
	} satisfies ChartConfig;

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

	const ticks = $derived(bandTicks(shownKeys));
	import LazyChart from '#lib/components/LazyChart.svelte';
</script>

<svelte:head>
	<meta
		name="description"
		content="{data.name} on Open Collective: its balance, runway, income, expenses and who funds it."
	/>
</svelte:head>

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
	<div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
		<!-- The logo and name open the collective on Open Collective; the icon says it leaves the app. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
		<a
			href={`https://opencollective.com/${data.slug}`}
			target="_blank"
			rel="noreferrer"
			class="group flex min-w-0 items-center gap-4 rounded-xl"
		>
			{#if data.imageUrl}
				<!--
					Centred on the middle of the name's letters, from the top of a "d" to the bottom of a "y",
					where the link icon sits too. Centring on the line instead puts it 0.13em higher, level
					with the middle of the capitals, which looks high beside a lowercase name. A new image for
					each collective, so the last one's logo does not show while this one's loads.
				-->
				{#key data.imageUrl}
					<img
						src={data.imageUrl}
						alt=""
						class="size-16 shrink-0 translate-y-[calc(var(--h1-size)*0.13)] rounded-xl border bg-card object-contain"
					/>
				{/key}
			{/if}
			<!--
				A long name wraps rather than being cut off. The icon stays with the last word, so it is
				never left alone on a line. Sized and spaced in ems to keep its look as the heading scales,
				and lowered a little, since its drawing leaves a margin inside its box.
			-->
			<h1
				class="min-w-0 leading-tight text-balance decoration-1 underline-offset-6 group-hover:underline"
			>
				{nameStart}<span class="whitespace-nowrap"
					>{nameEnd}<ExternalLink
						class="ml-[0.3em] inline-block size-[0.6em] align-[-0.05em] text-muted-foreground group-hover:text-foreground"
						aria-hidden="true"
					/></span
				>
			</h1>
			<span class="sr-only">on Open Collective (opens in a new tab)</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		<!--
			On phones the search comes first, as a tool for the whole page, so the collective's name leads
			straight into what is shown about it. Beside the name on wider screens.
		-->
		<div class="order-first sm:order-none">
			<CollectiveSearch name="Find another collective" slug={data.slug} />
		</div>
	</div>

	{#if data.months.length === 0}
		<Alert.Root>
			<Alert.Title>No transactions yet</Alert.Title>
			<Alert.Description>This collective has not received or spent any money.</Alert.Description>
		</Alert.Root>
	{:else}
		{#if tooNew}
			<Alert.Root>
				<CalendarClock />
				<Alert.Title>Too new to forecast</Alert.Title>
				<Alert.Description>
					<p>
						Open Collective has no complete month for this collective yet. The averages and forecast
						appear once {longMonthYear.format(now)} is over.
					</p>
				</Alert.Description>
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
							{money.format(-result.avgNet)} a month, the average of the last {result.basis} complete
							months.
						{:else}
							The balance grows by about {money.format(result.avgNet)} a month, the average of the last
							{result.basis} complete months.
						{/if}
					</p>
				</Alert.Description>
			</Alert.Root>
		{/if}

		<!--
			One compact strip, so the balance chart is on screen when the page opens. Averages of no months
			say nothing, so only what is available shows until there are some.
		-->
		<StatStrip stats={tooNew ? stats.slice(0, 1) : stats} />

		{#if !tooNew}
			<!--
				One row where both fit. Below that, a label column and a button column, so the two sets of
				buttons start at the same place.
			-->
			<div
				class="grid w-fit grid-cols-[auto_auto] items-center gap-x-3 gap-y-3 text-sm md:flex md:gap-x-8"
			>
				<div class="contents md:flex md:items-center md:gap-3">
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
				<div class="contents md:flex md:items-center md:gap-3">
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
					<LazyChart class="h-80">
						{#snippet children({ Area, AreaChart, Chart, LinearGradient })}
							<Chart.Container
								config={balanceConfig}
								class="aspect-auto h-80 w-full cursor-pointer"
							>
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
											tickOcclusion: X_TICK_OCCLUSION,
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
						{/snippet}
					</LazyChart>
				</Card.Content>
			</Card.Root>
		{/if}

		<div class="grid gap-4 lg:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<Card.Title>Income and expenses</Card.Title>
					<Card.Description>
						{#if tooNew && thisMonth}
							{money.format(thisMonth.income)} in and {money.format(thisMonth.expenses)} out so far this
							month.
						{:else}
							{money.format(totals.income)} in, {money.format(totals.expenses)} out over {totals.months}
							complete months{#if me}, {money.format(totals.mine)}
								({percent.format(totals.expenses ? totals.mine / totals.expenses : 0)}) of it to you{/if}.
						{/if}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<LazyChart class="mb-3 h-64">
						{#snippet children({ BarChart, Chart })}
							<Chart.Container config={flowConfig} class="aspect-auto h-64 w-full cursor-pointer">
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
										}
									}}
								>
									{#snippet tooltip()}
										<Chart.Tooltip labelFormatter={labelMonth} formatter={moneyRow} />
									{/snippet}
								</BarChart>
							</Chart.Container>
						{/snippet}
					</LazyChart>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Gained or lost each month</Card.Title>
					<Card.Description>
						{#if tooNew && thisMonth}
							{signed(Math.round(thisMonth.net))} so far this month.
						{:else}
							{signed(totals.net)} over {totals.months} complete months.
						{/if}
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<LazyChart class="h-64">
						{#snippet children({ BarChart, Chart })}
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
										xAxis: {
											tickLength: TICK_LENGTH,
											tickOcclusion: X_TICK_OCCLUSION,
											ticks,
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
										<Chart.Tooltip labelFormatter={labelMonth} formatter={moneyRow} />
									{/snippet}
								</BarChart>
							</Chart.Container>
						{/snippet}
					</LazyChart>
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

		<!-- Left out when it has neither card, so it adds no gap of its own. -->
		{#if me || payees.cells.length > 0}
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
								Expenses paid out each month, by payee. The bigger the dot, the more was paid, and
								each payee's total is on the right.
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<div bind:clientWidth={payeeWidth}>
								<LazyChart class="h-72">
									{#snippet children({ Axis, Chart, Circle, ScatterChart })}
										<Chart.Container
											config={payeeConfig}
											class="aspect-auto h-72 w-full cursor-pointer"
										>
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
												rRange={[Math.min(2, payeeMaxRadius), payeeMaxRadius]}
												padding={chartPadding({
													left: PAYEE_LABEL_WIDTH + TICK_LENGTH,
													right: PAYEE_TOTAL_WIDTH + TICK_LENGTH
												})}
												props={{
													points: { strokeWidth: 0, fillOpacity: 0.85 },
													grid: { x: false, y: true, bandAlign: 'between' },
													xAxis: {
														tickLength: TICK_LENGTH,
														tickOcclusion: X_TICK_OCCLUSION,
														ticks,
														format: bandTickLabel
													},
													yAxis: {
														tickLength: TICK_LENGTH,
														// Rows, not values: each label sits beside its row of dots. Cut to the room the
														// padding leaves, measured, since names of the same length differ in width.
														// Measured at the labels' own size; LayerChart would use the page's 16px.
														tickLabelProps: {
															verticalAnchor: 'middle',
															truncate: { maxWidth: PAYEE_LABEL_WIDTH, style: LABEL_STYLE }
														},
														format: (slug: string) => payeeName.get(slug) ?? ''
													},
													tooltip: { context: { mode: 'band' } }
												}}
											>
												<!--
										Rings the hovered dot. Replaces the built-in highlight, which drew its point at the
										start of the row, where it looked like another payment.
									-->
												<!-- Each payee's total at the end of their row, like a ledger's totals column. -->
												{#snippet aboveMarks()}
													<Axis
														placement="right"
														tickLength={TICK_LENGTH}
														rule={false}
														grid={false}
														format={(slug: string) => money.format(payeeTotals.get(slug) ?? 0)}
														tickLabelProps={{
															verticalAnchor: 'middle',
															// Right-aligned in their column, so the figures line up by digit.
															textAnchor: 'end',
															dx: PAYEE_TOTAL_WIDTH,
															class: 'tabular-nums'
														}}
													/>
												{/snippet}
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
									{/snippet}
								</LazyChart>
							</div>
						</Card.Content>
					</Card.Root>
				{/if}
			</div>
		{/if}

		<ExpenseCategories
			slug={data.slug}
			currency={data.currency}
			months={shownKeys}
			{partialKey}
			payouts={data.payouts}
			spent={shownExpenses}
		/>

		{#if income}
			<IncomeSources
				{income}
				received={shownIncome}
				slug={data.slug}
				currency={data.currency}
				months={shownKeys}
				{partialKey}
				{range}
				{now}
			/>
		{:else if incomeQuery?.error}
			<Alert.Root variant="destructive">
				<Alert.Title>Could not load contributions</Alert.Title>
				<Alert.Description>
					<RetryableError error={incomeQuery.error} onretry={() => incomeQuery?.refresh()} />
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
