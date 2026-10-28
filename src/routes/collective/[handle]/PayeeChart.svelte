<script lang="ts">
	import { TooltipLink } from '#lib/tooltip-link.svelte.js';
	import { cubicInOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION } from '#lib/chart-padding.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import { scaleBand } from 'd3-scale';
	import type { BrushState } from 'layerchart';
	import type { Rect as RectMark } from 'layerchart/svg';
	import { User, Users } from '@lucide/svelte';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import {
		bandTickLabel,
		bandTicks,
		compactFormat,
		monthLabel,
		moneyFormat,
		periodPhrase
	} from '#lib/chart-format.js';
	import {
		accountTotals,
		byQuarter,
		monthEnd,
		quarterStart,
		transactionsUrl,
		type AccountMonth,
		type Payout
	} from '#lib/financials.js';
	import { dataBackground } from './data-background';
	import MoneyRow from './MoneyRow.svelte';

	let {
		slug,
		currency,
		months: shownKeys,
		partialKey,
		range,
		me,
		payouts,
		payees,
		payeeImages
	}: {
		/** The collective. */
		slug: string;
		currency: string;
		/** The months shown. */
		months: string[];
		partialKey?: string;
		/** The range picked, which starts the columns picked afresh when it changes. */
		range: string;
		me?: string;
		payouts: Payout[];
		/** The payees with rows, from every month shown, and what each was paid each month. */
		payees: { accounts: { slug: string; name: string }[]; cells: AccountMonth[] };
		payeeImages: Record<string, string>;
	} = $props();

	const money = $derived(moneyFormat(currency));
	const compact = $derived(compactFormat(currency));
	const labelMonth = (key: string) => monthLabel({ key, partialKey });

	/** The payee charts' width, totals included, for sizing their dots. */
	let payeeWidth = $state(0);
	/**
	 * On phones, full names and totals left the dots so little room that they all looked the same
	 * size, so names are cut shorter and totals are rounded, like "$54K".
	 */
	const payeeNarrow = $derived(payeeWidth > 0 && payeeWidth < 400);
	/** The column of avatars and names beside the "Expenses by recipient" chart, cut short on phones. */
	const payeeNameWidth = $derived(payeeNarrow ? 100 : 150);
	/**
	 * The totals column beside the charts. On wider screens a bar sits beside each figure, like
	 * "$12,300". On phones, with no room for both, it sits behind a rounded one, like "$54K".
	 */
	const PAYEE_BAR_WIDTH = 48;
	const payeeTotalWidth = $derived(payeeNarrow ? 56 : PAYEE_BAR_WIDTH + 72);
	const payeeTotalFormat = $derived(payeeNarrow ? compact : money);
	/** Room under the rows of dots, which leave their months' labels to the overview below. */
	const PAYEE_ROWS_BOTTOM = 4;
	const PAYEE_OVERVIEW_TOP = 4;
	/** Shared by the dots and the overview under them, so their columns line up. */
	const payeePadding = chartPadding({ left: 2 });
	/** The width the payee chart's dots are drawn across, between the names and the totals. */
	const payeePlot = $derived(
		payeeWidth - payeeNameWidth - payeeTotalWidth - payeePadding.left - payeePadding.right
	);
	/** The dots' chart is drawn this tall, as its `h-64` says. */
	const PAYEE_ROWS_HEIGHT = 256;
	/**
	 * How far from a dot the pointer still finds it: across the whole chart, so every spot finds the
	 * nearest dot. Left at its default of infinity, layerchart drew each dot's hover area with an
	 * infinite circle, which logged errors whenever the dots changed.
	 */
	const payeeHoverRadius = $derived(
		Math.ceil(Math.hypot(Math.max(0, payeePlot), PAYEE_ROWS_HEIGHT))
	);

	/** Narrower than this a month, as on phones, dots barely differ in size, so quarters are shown. */
	const MIN_MONTH_WIDTH = 12;
	const payeeQuarterly = $derived(
		payeeWidth > 0 && payeePlot / Math.max(1, shownKeys.length) < MIN_MONTH_WIDTH
	);
	/** The columns of the payee charts: the months shown, or the first month of each quarter. */
	const payeeKeys = $derived(
		payeeQuarterly ? [...new Set(shownKeys.map(quarterStart))] : shownKeys
	);
	/** The months shown that a column holds: one, or up to three for a quarter. */
	const payeeMonths = (key: string) =>
		payeeQuarterly ? shownKeys.filter((month) => quarterStart(month) === key) : [key];

	/**
	 * The columns picked by brushing the overview under the payee chart. Kept with the columns they
	 * were picked from, since the overview starts afresh when the range or the columns change.
	 */
	const payeeColumnsId = $derived(`${range} ${payeeQuarterly}`);
	let payeeBrush = $state<{ id: string; keys: string[] } | null>(null);
	/** The columns picked, or none when every column counts. */
	const payeePicked = $derived(
		payeeBrush?.id === payeeColumnsId && payeeBrush.keys.length ? payeeBrush.keys : null
	);
	function brushPayees({ brush }: { brush: BrushState }) {
		const [from, to] = brush.x.map((key) => payeeKeys.indexOf(key as string));
		payeeBrush =
			brush.active && from >= 0 && to >= 0
				? { id: payeeColumnsId, keys: payeeKeys.slice(from, to + 1) }
				: null;
	}
	/** The months the totals add up: those in the columns picked, or every month shown. */
	const payeeWindow = $derived(payeePicked ? payeePicked.flatMap(payeeMonths) : shownKeys);

	/**
	 * The biggest dot: under half a column's width, so dots in neighbouring columns never overlap and
	 * each is its own target, but no bigger than 11px however wide the chart.
	 */
	const payeeMaxRadius = $derived(
		Math.max(1.5, Math.min(11, (payeePlot / Math.max(1, payeeKeys.length)) * 0.45))
	);
	/** What each payee was paid over the months picked, for the column beside the chart. */
	const payeeTotals = $derived.by(() => {
		const months = new Set(payeeWindow);
		return payees.cells
			.filter((cell) => months.has(cell.month))
			.reduce(
				(totals, cell) => totals.set(cell.slug, (totals.get(cell.slug) ?? 0) + cell.amount),
				new Map<string, number>()
			);
	});
	/** Every expense in the months picked, on Open Collective, for the payees too many to list. */
	const payeeExpensesUrl = $derived(
		transactionsUrl({
			slug: slug,
			between: { from: payeeWindow[0], to: payeeWindow.at(-1)! },
			kinds: ['EXPENSE']
		})
	);
	/** Who was paid in a column of the overview, by name: the biggest few, and how many more. */
	function paidInColumn(key: string | undefined) {
		const paid = key ? accountTotals({ rows: payouts, months: payeeMonths(key) }) : [];
		const rest = paid.slice(PAYEES_IN_TOOLTIP);
		return {
			shown: paid.slice(0, PAYEES_IN_TOOLTIP),
			rest: { count: rest.length, amount: rest.reduce((sum, account) => sum + account.amount, 0) }
		};
	}
	const PAYEES_IN_TOOLTIP = 6;
	/** What one payee was paid each month picked, or each quarter when there are more than six. */
	function payeePeriods(slug: string): { label: string; amount: number }[] {
		const byQuarter = payeeWindow.length > 6;
		const parts = payouts
			.filter((row) => row.slug === slug && payeeWindow.includes(row.month))
			.reduce((parts, row) => {
				const key = byQuarter ? quarterStart(row.month) : row.month;
				return parts.set(key, (parts.get(key) ?? 0) + row.amount);
			}, new Map<string, number>());
		return [...parts]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, amount]) => ({
				label: byQuarter
					? periodLabel(payeeWindow.filter((month) => quarterStart(month) === key))
					: labelMonth(key),
				amount
			}));
	}
	const payeeTotalMax = $derived(Math.max(1, ...payeeTotals.values()));
	const payeeWindowTotal = $derived([...payeeTotals.values()].reduce((sum, t) => sum + t, 0));
	const payeeCells = $derived(payeeQuarterly ? byQuarter(payees.cells) : payees.cells);
	/** Everything paid out in each column, for the overview under the payee chart. */
	const paidByColumn = $derived.by(() => {
		const paid = payeeCells.reduce(
			(paid, cell) => paid.set(cell.month, (paid.get(cell.month) ?? 0) + cell.amount),
			new Map<string, number>()
		);
		return payeeKeys.map((month) => ({ month, amount: Math.round(paid.get(month) ?? 0) }));
	});
	/** The months the totals add up, in words, as the description says them. */
	const payeePeriod = $derived(
		payeePicked
			? payeePicked.length === 1
				? `in ${payeeColumnLabel(payeePicked[0])}`
				: `from ${labelMonth(payeeWindow[0])} to ${labelMonth(payeeWindow.at(-1)!)}`
			: periodPhrase(shownKeys)
	);
	const payeeSeries = $derived(
		(['you', 'others'] as const).map((key) => ({
			key,
			label: payeeConfig[key].label,
			color: payeeConfig[key].color,
			data: payeeCells.filter((cell) => (cell.slug === me) === (key === 'you'))
		}))
	);

	// Matches the bars: others are muted only when they sit beside what was paid to you.
	const payeeConfig = $derived({
		you: { label: 'You', color: 'var(--color-chart-expenses)' },
		others: {
			label: 'Paid',
			color: me ? 'var(--color-chart-expenses-muted)' : 'var(--color-chart-expenses)'
		}
	} satisfies ChartConfig);

	/**
	 * Glides the hover bands and ring from one dot to the next, rather than jumping, so moving along
	 * a row reads as one motion. Short, so it keeps up with the pointer.
	 */
	const hoverMotion = {
		type: 'tween',
		duration: () => (prefersReducedMotion.current ? 0 : 120),
		easing: cubicInOut
	} as const;

	const payeeOverviewConfig = {
		amount: { label: 'Paid out', color: 'var(--color-chart-expenses)' }
	} satisfies ChartConfig;

	/** The "others" row has no slug, so it links to every expense. */
	const payeeLink = new TooltipLink((cell: { slug: string; month: string }) => {
		const months = payeeMonths(cell.month);
		return transactionsUrl({
			slug: slug,
			between: { from: months[0], to: months.at(-1)! },
			account: cell.slug || undefined,
			kinds: ['EXPENSE']
		});
	});

	const shortMonth = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
	/** Months in words: "Oct 2026", or "Jul–Sep 2026" for a quarter. */
	function periodLabel(months: string[]): string {
		const last = labelMonth(months.at(-1)!);
		return months.length > 1 ? `${shortMonth.format(monthEnd(months[0]))}–${last}` : last;
	}
	/** A payee chart column in words. */
	function payeeColumnLabel(key: string): string {
		return periodLabel(payeeMonths(key));
	}
	/** A quarter on the axis, like "Q3 26". */
	const quarterTick = (key: string) => `Q${(Number(key.slice(5, 7)) + 2) / 3} ${key.slice(2, 4)}`;
	const payeeTicks = $derived(bandTicks(payeeKeys));
</script>

{#snippet payeeFade({
	context,
	Rect
}: {
	context: {
		xScale: ((key: string) => number | undefined) & {
			bandwidth?: () => number;
			step?: () => number;
		};
		height: number;
	};
	Rect: typeof RectMark;
})}
	<!-- Fades the columns left out of the pick, so the ones picked stand out where they are. -->
	{#if payeePicked}
		{const step = $derived(context.xScale.step?.() ?? 0)}
		{const gap = $derived(step - (context.xScale.bandwidth?.() ?? 0))}
		{#each payeeKeys.filter((key) => !payeePicked.includes(key)) as key (key)}
			<Rect
				x={(context.xScale(key) ?? 0) - gap / 2}
				y={0}
				width={step}
				height={context.height}
				class="pointer-events-none fill-card opacity-75"
			/>
		{/each}
	{/if}
{/snippet}

{#snippet payeeBands({
	context,
	Rect,
	column,
	row
}: {
	context: {
		xScale: ((key: string) => number | undefined) & {
			bandwidth?: () => number;
			step?: () => number;
		};
		yScale: ((key: string) => number | undefined) & { bandwidth?: () => number };
		width: number;
		height: number;
	};
	Rect: typeof RectMark;
	column?: string;
	row?: string;
})}
	<!-- Shades the column and row under the pointer, behind the marks, as a punchcard does. -->
	{#if column !== undefined && context.xScale(column) !== undefined}
		{const step = $derived(context.xScale.step?.() ?? 0)}
		{const gap = $derived(step - (context.xScale.bandwidth?.() ?? 0))}
		<Rect
			x={(context.xScale(column) ?? 0) - gap / 2}
			y={0}
			width={step}
			height={context.height}
			class="pointer-events-none fill-muted"
			motion={hoverMotion}
		/>
	{/if}
	{#if row !== undefined && context.yScale(row) !== undefined}
		<Rect
			x={0}
			y={context.yScale(row) ?? 0}
			width={context.width}
			height={context.yScale.bandwidth?.() ?? 0}
			class="pointer-events-none fill-muted"
			motion={hoverMotion}
		/>
	{/if}
{/snippet}

<!-- A payee's avatar and name, cut short to fit. Others share a group icon; a payee without an avatar, a person. -->
{#snippet payeeLabel({ slug, name }: { slug: string; name: string })}
	{const image = $derived(payeeImages[slug])}
	{#if image}
		<img
			src={image}
			alt=""
			class="size-5 shrink-0 rounded-full border bg-card object-cover"
			loading="lazy"
		/>
	{:else}
		<span
			class="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
		>
			{#if slug}
				<User class="size-3" aria-hidden="true" />
			{:else}
				<Users class="size-3" aria-hidden="true" />
			{/if}
		</span>
	{/if}
	<span class="truncate text-muted-foreground">{name}</span>
{/snippet}

<!--
	What makes up a total: each month picked, or each quarter when there are more than six; for the
	others row, each payee in it instead.
-->
{#snippet payeeBreakdown({ slug, name }: { slug: string; name: string })}
	<p class="truncate px-1 pb-1 text-xs font-medium">{name}</p>
	<ul class="max-h-56 space-y-0.5 overflow-y-auto text-xs">
		{#each payeePeriods(slug) as part (part.label)}
			<li class="flex justify-between gap-3 px-1">
				<span class="min-w-0 truncate text-muted-foreground">{part.label}</span>
				<span class="shrink-0 tabular-nums">{money.format(part.amount)}</span>
			</li>
		{/each}
	</ul>
{/snippet}

<Card.Root>
	<Card.Header>
		<Card.Title>Expenses by recipient</Card.Title>
		<Card.Description>
			Who each {payeeQuarterly ? 'quarter' : 'month'}'s expenses went to, with totals {payeePeriod}.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<!--
			Names, dots and totals side by side, the overview of what was paid under the dots, so
			a month lines up in both and a row runs straight across. Hovering a dot shades its
			row and column among the dots.
		-->
		<div bind:clientWidth={payeeWidth}>
			<LazyChart class="h-84">
				{#snippet children({ BarChart, Chart, Circle, Rect, ScatterChart })}
					<div
						class="grid text-xs"
						style:grid-template-columns="{payeeNameWidth}px minmax(0, 1fr) {payeeTotalWidth}px"
					>
						<div
							class="flex flex-col"
							style:padding-top="{payeePadding.top}px"
							style:padding-bottom="{PAYEE_ROWS_BOTTOM}px"
						>
							{#each payees.accounts as account (account.slug)}
								<div class="flex min-h-0 flex-1 items-center pr-2">
									{#if account.slug}
										<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
										<a
											href="https://opencollective.com/{account.slug}"
											target="_blank"
											rel="noreferrer"
											class="flex min-w-0 items-center gap-2 rounded-sm pl-1 hover:underline"
										>
											{@render payeeLabel(account)}
											<span class="sr-only">on Open Collective (opens in a new tab)</span>
										</a>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{:else}
										<!-- Too many to list here, so the others open every expense in the months picked. -->
										<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
										<a
											href={payeeExpensesUrl}
											target="_blank"
											rel="noreferrer"
											class="flex min-w-0 items-center gap-2 rounded-sm pl-1 hover:underline"
										>
											{@render payeeLabel(account)}
											<span class="sr-only"
												>: their expenses on Open Collective (opens in a new tab)</span
											>
										</a>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{/if}
								</div>
							{/each}
						</div>
						<Chart.Container config={payeeConfig} class="aspect-auto h-64 w-full cursor-pointer">
							<ScatterChart
								series={payeeSeries}
								onTooltipClick={payeeLink.click}
								x="month"
								xScale={scaleBand()}
								xDomain={payeeKeys}
								y="slug"
								yScale={scaleBand()}
								yDomain={payees.accounts.map((account) => account.slug)}
								r="amount"
								rRange={[Math.min(2, payeeMaxRadius), payeeMaxRadius]}
								padding={{ ...payeePadding, bottom: PAYEE_ROWS_BOTTOM }}
								axis={false}
								props={{
									points: { strokeWidth: 0, fillOpacity: 0.85 },
									grid: { x: false, y: true, bandAlign: 'between' },
									// The nearest dot, wherever the pointer is: hovering only the cells with a dot left gaps
									// between them, so moving along a row dropped the highlight and brought it back.
									tooltip: {
										context: { mode: 'voronoi', radius: payeeHoverRadius, locked: payeeLink.locked }
									}
								}}
							>
								{#snippet belowMarks({ context })}
									{const cell = $derived(
										context.tooltip.data as {
											month: string;
											slug: string;
										} | null
									)}
									{@render payeeBands({
										context,
										Rect,
										column: cell?.month,
										row: cell?.slug
									})}
								{/snippet}
								{#snippet aboveMarks({ context })}
									{@render payeeFade({ context, Rect })}
								{/snippet}
								<!--
											Rings the hovered dot. Replaces the built-in highlight, which drew its point at
											the start of the row, where it looked like another payment.
										-->
								{#snippet highlight({ context })}
									{const cell = $derived(context.tooltip.data)}
									{#if cell}
										<Circle
											cx={context.xGet(cell) + (context.xScale.bandwidth?.() ?? 0) / 2}
											cy={context.yGet(cell) + (context.yScale.bandwidth?.() ?? 0) / 2}
											r={context.rGet(cell) + 3}
											class="pointer-events-none fill-none stroke-primary"
											motion={hoverMotion}
											strokeWidth={1.5}
										/>
									{/if}
								{/snippet}
								{#snippet tooltip({ context })}
									{const cell = $derived(
										context.tooltip.data as {
											name: string;
											month: string;
											amount: number;
										} | null
									)}
									<Chart.Tooltip
										hideIndicator
										labelFormatter={() => (cell ? payeeColumnLabel(cell.month) : '')}
										link={payeeLink}
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
						<!--
									Each payee's total at the end of their row, like a ledger's totals column, with a
									bar to compare them by: beside the figure on wider screens, behind it on phones,
									where there is no room for both. Right-aligned, so the figures line up by digit.
								-->
						<div
							class="relative flex flex-col tabular-nums"
							style:padding-top="{payeePadding.top}px"
							style:padding-bottom="{PAYEE_ROWS_BOTTOM}px"
						>
							<span class="absolute top-0 right-0 text-muted-foreground">Total</span>
							{#each payees.accounts as account (account.slug)}
								{const total = $derived(payeeTotals.get(account.slug) ?? 0)}
								{const color = $derived(
									account.slug && account.slug === me
										? payeeConfig.you.color
										: payeeConfig.others.color
								)}
								{#if account.slug}
									<!-- What the total is made of, on hover with a mouse or a tap on a touch screen. -->
									<Popover.Root>
										<Popover.Trigger
											openOnHover
											openDelay={200}
											class="flex min-h-0 w-full flex-1 items-center justify-end gap-2 rounded-sm pl-1 hover:bg-muted"
										>
											{#if payeeNarrow}
												<span
													class="w-full rounded-sm py-0.5 pr-1 text-right"
													{@attach dataBackground({
														value: total,
														max: payeeTotalMax,
														color: `color-mix(in oklab, ${color} 30%, transparent)`
													})}
												>
													{payeeTotalFormat.format(total)}
												</span>
											{:else}
												<span
													class="h-3.5 shrink-0"
													style:width="{PAYEE_BAR_WIDTH}px"
													{@attach dataBackground({
														value: total,
														max: payeeTotalMax,
														color
													})}
												></span>
												<span class="flex-1 pr-1 text-right">{payeeTotalFormat.format(total)}</span>
											{/if}
										</Popover.Trigger>
										<Popover.Content class="w-56 p-2" align="end">
											{@render payeeBreakdown(account)}
										</Popover.Content>
									</Popover.Root>
								{:else}
									<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
									<a
										href={payeeExpensesUrl}
										target="_blank"
										rel="noreferrer"
										class="flex min-h-0 w-full flex-1 items-center justify-end gap-2 rounded-sm pl-1 hover:bg-muted"
									>
										{#if payeeNarrow}
											<span
												class="w-full rounded-sm py-0.5 pr-1 text-right"
												{@attach dataBackground({
													value: total,
													max: payeeTotalMax,
													color: `color-mix(in oklab, ${color} 30%, transparent)`
												})}
											>
												{payeeTotalFormat.format(total)}
											</span>
										{:else}
											<span
												class="h-3.5 shrink-0"
												style:width="{PAYEE_BAR_WIDTH}px"
												{@attach dataBackground({
													value: total,
													max: payeeTotalMax,
													color
												})}
											></span>
											<span class="flex-1 pr-1 text-right">{payeeTotalFormat.format(total)}</span>
										{/if}
										<span class="sr-only"
											>: their expenses on Open Collective (opens in a new tab)</span
										>
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								{/if}
							{/each}
						</div>
						<span></span>
						<!--
									Everything paid out in each column, under the dots. Dragging across it picks the
									columns the totals add up, and fades the rest in both charts; a tap outside the
									pick brings every column back. Starts afresh when the columns change. Swiping up
									or down over it still scrolls the page on a phone; only a sideways drag picks.
								-->
						<div
							class="h-20 [&_.lc-brush-context]:touch-pan-y [&_.lc-brush-handle]:touch-pan-y [&_.lc-brush-range]:touch-pan-y"
						>
							{#key payeeColumnsId}
								<Chart.Container config={payeeOverviewConfig} class="aspect-auto h-20 w-full">
									<BarChart
										data={paidByColumn}
										x="month"
										y="amount"
										xScale={scaleBand().padding(0.15)}
										padding={{ ...payeePadding, top: PAYEE_OVERVIEW_TOP }}
										brush={{ zoomOnBrush: false, onChange: brushPayees }}
										axis="x"
										grid={false}
										series={[
											{
												key: 'amount',
												label: payeeOverviewConfig.amount.label,
												color: payeeOverviewConfig.amount.color
											}
										]}
										props={{
											bars: { radius: 1, strokeWidth: 0 },
											xAxis: {
												tickLength: TICK_LENGTH,
												tickOcclusion: X_TICK_OCCLUSION,
												ticks: payeeTicks,
												format: payeeQuarterly ? quarterTick : bandTickLabel
											}
										}}
									>
										{#snippet aboveMarks({ context })}
											{@render payeeFade({ context, Rect })}
										{/snippet}
										{#snippet tooltip({ context })}
											<!-- Who was paid in the column, each by name, biggest first. -->
											<Chart.Tooltip labelFormatter={payeeColumnLabel}>
												{#snippet formatter({ index, payload })}
													{#if index === payload.length - 1}
														{const paid = $derived(
															paidInColumn(
																(context.tooltip.data as { month: string } | null)?.month
															)
														)}
														<div class="grid gap-1.5">
															{#each paid.shown as account (account.slug)}
																<MoneyRow value={account.amount} name={account.name} {money} />
															{/each}
															{#if paid.rest.count}
																<MoneyRow
																	value={paid.rest.amount}
																	name="{paid.rest.count} more"
																	{money}
																/>
															{/if}
															{#if !paid.shown.length}
																<span class="text-muted-foreground">Nothing paid out</span>
															{/if}
														</div>
													{/if}
												{/snippet}
											</Chart.Tooltip>
										{/snippet}
									</BarChart>
								</Chart.Container>
							{/key}
						</div>
						<!-- What was paid out over the columns picked, level with the overview's bars. -->
						<div
							class="flex items-center justify-end pr-1 font-medium tabular-nums"
							style:padding-top="{PAYEE_OVERVIEW_TOP}px"
							style:padding-bottom="{payeePadding.bottom}px"
						>
							{payeeTotalFormat.format(payeeWindowTotal)}
						</div>
					</div>
				{/snippet}
			</LazyChart>
		</div>
	</Card.Content>
</Card.Root>
