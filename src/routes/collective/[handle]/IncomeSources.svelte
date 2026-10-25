<script lang="ts">
	import { TooltipLink } from '#lib/tooltip-link.svelte.js';
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import { Badge, badgeVariants } from '#lib/components/ui/badge/index.js';
	import { cn } from '#lib/utils.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import { scaleBand, scalePoint } from 'd3-scale';
	import { Asterisk, ExternalLink, Users } from '@lucide/svelte';
	import {
		bandTickLabel,
		bandTicks,
		compactFormat,
		monthLabel,
		moneyFormat,
		periodPhrase
	} from './chart-format';
	import { backerStatus, transactionsUrl, type Backer, type SizeTier } from './financials';
	import BackerWaffle from './BackerWaffle.svelte';
	import LogoMark from './LogoMark.svelte';
	import MoneyRow from './MoneyRow.svelte';
	import { getGivingNow, type IncomeSources } from './stats.remote';

	let {
		income,
		received,
		slug,
		currency,
		months,
		partialKey,
		range,
		now,
		backersOnly = false
	}: {
		/**
		 * Passed in rather than awaited here: values derived after a top-level `await` stop caching
		 * once it resolves, and the chart, drawn later as it scrolls into view, would lock up the page.
		 */
		income: IncomeSources;
		/** All that came in over these months, contributions or not. */
		received: number;
		/** The collective. */
		slug: string;
		currency: string;
		months: string[];
		partialKey?: string;
		range: '1y' | '2y' | 'all';
		now: Date;
		/** Only who gives, for a fund, which passes on one or two big gifts rather than living on them. */
		backersOnly?: boolean;
	} = $props();

	const CONTRIBUTION_KINDS = ['CONTRIBUTION', 'ADDED_FUNDS', 'BALANCE_TRANSFER'];
	/** Gave the most, then less, then least: fading shades of the income colour. */
	/** The others' size tiers as recurring and one-off giving, recurring first, each with its totals. */
	function givingGroups(tiers: SizeTier[]) {
		return [true, false]
			.map((recurring) => {
				const group = tiers.filter((tier) => tier.recurring === recurring);
				return {
					recurring,
					tiers: group,
					count: group.reduce((sum, tier) => sum + tier.count, 0),
					amount: group.reduce((sum, tier) => sum + tier.amount, 0)
				};
			})
			.filter((group) => group.tiers.length);
	}

	const money = $derived(moneyFormat(currency));
	const compact = $derived(compactFormat(currency));
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });
	const monthYear = new Intl.DateTimeFormat('en', {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});

	const rows = $derived(
		months.map((month) => {
			const found = income.months.find((m) => m.month === month);
			return {
				month,
				recurring: Math.round(found?.recurring ?? 0),
				oneOff: Math.round(found?.oneOff ?? 0),
				transferred: Math.round(found?.transferred ?? 0)
			};
		})
	);
	/**
	 * Summed before rounding: rounding each month first can drift the total by up to 50¢ a month,
	 * enough for a backer's exact amount to come to more than 100% of it.
	 */
	const inRange = $derived(income.months.filter((m) => months.includes(m.month)));
	const recurring = $derived(inRange.reduce((sum, m) => sum + m.recurring, 0));
	const transferred = $derived(inRange.reduce((sum, m) => sum + m.transferred, 0));
	const total = $derived(inRange.reduce((sum, m) => sum + m.recurring + m.oneOff, 0));

	/**
	 * The top backers, with everyone else as two rows rather than one: the others who gave regularly
	 * and those who gave once or now and then, each in its place by size, so neither hides in a tooltip.
	 */
	const backers = $derived(
		income.backers[range]
			.flatMap((backer) =>
				backer.slug || !backer.tiers?.length
					? [{ ...backer, recurring: undefined as boolean | undefined }]
					: givingGroups(backer.tiers).map((group) => ({
							...backer,
							name: `${group.count} other ${group.recurring ? 'recurring' : 'one-off'} ${group.count === 1 ? 'backer' : 'backers'}`,
							amount: group.amount,
							tiers: group.tiers,
							recurring: group.recurring
						}))
			)
			.sort((a, b) => b.amount - a.amount)
	);
	/** Each bar is that backer's share of everything contributed in the range. */
	const share = (amount: number) => (total ? (amount / total) * 100 : 0);
	/** Rounded, but never down to a misleading 0%. */
	const shareLabel = (amount: number) =>
		amount > 0 && share(amount) < 1 ? '<1%' : percent.format(share(amount) / 100);
	/** Where each row's bar starts: the share of everyone listed above it, so the bars step down the list. */
	const offsets = $derived(
		backers.reduce<number[]>((starts, backer, index) => {
			starts.push(index ? starts[index - 1] + share(backers[index - 1].amount) : 0);
			return starts;
		}, [])
	);
	/** The biggest single backer: not the others together, nor a platform passing on many gifts. */
	const biggest = $derived(backers.find((backer) => backer.slug && !backer.channel));
	const topShare = $derived(total && biggest ? biggest.amount / total : 0);

	const contributionsUrl = ({ month }: { month: string }) =>
		transactionsUrl({ slug, month, kinds: CONTRIBUTION_KINDS });
	const contributionsLink = new TooltipLink(contributionsUrl);
	const backersLink = new TooltipLink(contributionsUrl);

	const config = {
		recurring: { label: 'Recurring', color: 'var(--color-chart-income)' },
		oneOff: { label: 'One-off', color: 'var(--color-chart-income-muted)' }
	} satisfies ChartConfig;

	/** Recurring backers at the end of `month`: the count of the latest month up to it with any change. */
	const activeAt = (month: string) =>
		income.recurring.findLast((m) => m.month <= month)?.active ?? 0;

	/** The same month a year earlier, as YYYY-MM. */
	const yearEarlier = (month: string) => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;

	/**
	 * Each month with the count a year earlier, left out before the first backer started, when there
	 * is nothing to compare with.
	 */
	const changes = $derived(
		months.map((month) => {
			const found = income.recurring.find((m) => m.month === month);
			const earlier = yearEarlier(month);
			return {
				month,
				started: found?.started ?? 0,
				stopped: found?.stopped ?? 0,
				startedBy: found?.startedBy ?? [],
				stoppedBy: found?.stoppedBy ?? [],
				active: activeAt(month),
				yearBefore: earlier >= income.recurring[0].month ? activeAt(earlier) : undefined
			};
		})
	);
	const compared = (d: { yearBefore?: number }) => d.yearBefore !== undefined;
	/** The top backers' logos on the line: this big, and stacked this far apart in a busy month. */
	const MARK_RADIUS = 7;
	const MARK_STEP = 2 * MARK_RADIUS + 5;
	/** The top backers shown below, the ones whose starts and stops are marked on the line. */
	const topSlugs = $derived(
		new Set(backers.filter((backer) => backer.slug && !backer.channel).map((backer) => backer.slug))
	);
	/**
	 * When a top backer started or stopped giving regularly, with the count that month to place it
	 * by. `index` stacks a month's starts above the line, and its stops below, one after another.
	 */
	const topChanges = $derived(
		changes.flatMap((change) =>
			(['started', 'stopped'] as const).flatMap((kind) =>
				change[kind === 'started' ? 'startedBy' : 'stoppedBy']
					.filter((backer) => topSlugs.has(backer.slug))
					.map((backer, index) => ({
						month: change.month,
						active: change.active,
						kind,
						backer,
						index
					}))
			)
		)
	);
	/** The top backers who stopped giving regularly, listed or marked on the line. */
	const stoppedTop = $derived(
		[
			...new Set([
				...backers
					.filter(
						(backer) =>
							backer.slug &&
							!backer.channel &&
							backer.history &&
							backerStatus({ ...backer.history, now }) === 'Stopped'
					)
					.map((backer) => backer.slug),
				...topChanges
					.filter((change) => change.kind === 'stopped')
					.map((change) => change.backer.slug)
			])
		].sort()
	);
	/** Where each of them still gives regularly, asked of Open Collective once they are known. */
	const givingNow = $derived(stoppedTop.length ? getGivingNow(stoppedTop) : undefined);
	/**
	 * Whether a backer who stopped giving here stopped all their regular giving on Open Collective,
	 * or still gives elsewhere: a budget cut reads differently from leaving this collective alone.
	 * Nothing until known.
	 */
	function stoppedWhere(backer: string): 'everywhere' | 'here' | undefined {
		const elsewhere = givingNow?.current?.[backer]?.filter((other) => other !== slug);
		if (!elsewhere) return undefined;
		return elsewhere.length ? 'here' : 'everywhere';
	}
	/** What the asterisk on a Stopped badge means. */
	const STOPPED_EVERYWHERE =
		'It stopped all its regular giving on Open Collective, not only to this collective.';
	/** How many who started or stopped a tooltip names, before saying how many more. */
	const NAMED_BACKERS = 4;
	const started = $derived(changes.reduce((sum, row) => sum + row.started, 0));
	const stopped = $derived(changes.reduce((sum, row) => sum + row.stopped, 0));
	const activeNow = $derived(income.recurring.at(-1)?.active ?? 0);
	const backerCount = (count: number) => `${count} ${count === 1 ? 'backer' : 'backers'}`;
	/** Counts of backers, formatted for the rows that otherwise show money. */
	const whole = new Intl.NumberFormat('en-US');

	const changeConfig = {
		active: { label: 'Giving regularly', color: 'var(--color-chart-income)' },
		yearBefore: { label: 'A year earlier', color: 'var(--color-muted-foreground)' },
		started: { label: 'Started', color: 'var(--color-chart-income)' },
		stopped: { label: 'Stopped', color: 'var(--color-chart-expenses)' }
	} satisfies ChartConfig;
	import LazyChart from '#lib/components/LazyChart.svelte';
</script>

<!--
	Who started or stopped: each with their logo, a few by name, then how many more. A top backer who
	stopped all their regular giving, not only here, says "everywhere".
-->
{#snippet backerList(backers: Backer[], stopped = false)}
	<ul class="grid max-w-56 gap-1 pl-4.5">
		{#each backers.slice(0, NAMED_BACKERS) as backer, index (index)}
			<li class="flex min-w-0 items-center gap-1.5">
				{#if backer.imageUrl}
					<img
						src={backer.imageUrl}
						alt=""
						class="size-4 shrink-0 rounded-full border bg-card object-cover"
					/>
				{:else}
					<span class="size-4 shrink-0 rounded-full border bg-muted"></span>
				{/if}
				<span class="truncate text-muted-foreground">{backer.name}</span>
				{#if stopped && topSlugs.has(backer.slug) && stoppedWhere(backer.slug) === 'everywhere'}
					<span class="shrink-0 text-muted-foreground/70">everywhere</span>
				{/if}
			</li>
		{/each}
		{#if backers.length > NAMED_BACKERS}
			<li class="text-muted-foreground">and {backers.length - NAMED_BACKERS} more</li>
		{/if}
	</ul>
{/snippet}

{#snippet row({ value, name, item }: { value: unknown; name: string; item: { color?: string } })}
	{#if typeof value === 'number'}
		<MoneyRow {value} {name} color={item.color} {money} />
	{/if}
{/snippet}

{#if total === 0}
	<Card.Root class="animate-in duration-300 fade-in">
		<Card.Header>
			<Card.Title>Contributions</Card.Title>
			<Card.Description>
				No contributions {periodPhrase(months) || 'yet'}.
				{#if received >= 1}
					{money.format(received)} arrived without being recorded as contributions.
				{/if}
			</Card.Description>
		</Card.Header>
	</Card.Root>
{:else}
	<!-- Cards may shrink below their longest name, which truncates instead of widening the page. -->
	<div
		class={[
			'grid animate-in gap-4 duration-300 fade-in *:min-w-0',
			!backersOnly && 'lg:grid-cols-2'
		]}
	>
		<!-- Two charts stacked beside the backers list, the first growing to match its height. -->
		{#if !backersOnly}
			<div class="flex flex-col gap-4">
				<Card.Root class="flex-1">
					<Card.Header>
						<Card.Title>Recurring and one-off contributions</Card.Title>
						<Card.Description>
							{money.format(total)} contributed {periodPhrase(months)}, {percent.format(
								total ? recurring / total : 0
							)} of it from recurring contributions.
							{#if transferred}
								{total - transferred < 0.005 ? 'All of it' : money.format(transferred)} was moved from
								other accounts' balances on Open Collective, not paid in.
							{/if}
						</Card.Description>
					</Card.Header>
					<!--
			Grows to the height of the backers list beside it instead of leaving a gap. At least as tall
			as the chart while it waits, since growing from nothing leaves it no height of its own.
		-->
					<Card.Content class="flex flex-1 flex-col">
						<LazyChart class="mb-3 min-h-64 flex-1">
							{#snippet children({ BarChart, Chart, Legend, legendMotion })}
								<Chart.Container {config} class="aspect-auto h-full min-h-64 w-full cursor-pointer">
									<BarChart
										padding={chartPadding({ legend: true })}
										data={rows}
										x="month"
										xScale={scaleBand().padding(0.2)}
										seriesLayout="stack"
										onTooltipClick={contributionsLink.click}
										series={[
											{
												key: 'recurring',
												label: config.recurring.label,
												color: config.recurring.color
											},
											{ key: 'oneOff', label: config.oneOff.label, color: config.oneOff.color }
										]}
										props={{
											bars: { radius: 2, strokeWidth: 0, motion: legendMotion },
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
											},
											tooltip: { context: { locked: contributionsLink.locked } }
										}}
									>
										{#snippet tooltip()}
											<Chart.Tooltip
												labelFormatter={(key: string) => monthLabel({ key, partialKey })}
												formatter={row}
												link={contributionsLink}
											/>
										{/snippet}
										{#snippet legend({ context })}
											<Legend {context} placement="bottom" />
										{/snippet}
									</BarChart>
								</Chart.Container>
							{/snippet}
						</LazyChart>
					</Card.Content>
				</Card.Root>

				{#if income.recurring.length}
					<Card.Root>
						<Card.Header>
							<Card.Title>Recurring backers</Card.Title>
							<Card.Description>
								{backerCount(activeNow)}
								{activeNow === 1 ? 'gives' : 'give'} regularly now.
								{#if started || stopped}
									{started} started and {stopped} stopped {periodPhrase(months)}.
								{:else}
									None started or stopped {periodPhrase(months)}.
								{/if}
								<!-- How to read the chart, on its own line apart from what the figures say. -->
								<span class="block"
									>Green when it was more than a year before it, red when fewer.</span
								>
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<LazyChart class="h-56">
								{#snippet children({ Area, AreaChart, Chart, Threshold })}
									<Chart.Container
										config={changeConfig}
										class="aspect-auto h-56 w-full cursor-pointer"
									>
										<!--
									Every start and stop is in the tooltip; the line is what they add up to. Only the top
									backers' are marked on it, by their logos: starts above the line, stops below. Each
									month's point sits where the bars above centre theirs.
								-->
										<AreaChart
											padding={chartPadding()}
											data={changes}
											x="month"
											xScale={scalePoint().padding(0.6)}
											y={['active', 'yearBefore']}
											yNice
											onTooltipClick={backersLink.click}
											series={[
												{
													key: 'active',
													label: changeConfig.active.label,
													color: changeConfig.active.color
												}
											]}
											props={{
												xAxis: {
													tickLength: TICK_LENGTH,
													tickOcclusion: X_TICK_OCCLUSION,
													ticks: bandTicks(months),
													format: bandTickLabel
												},
												yAxis: {
													tickLength: TICK_LENGTH,
													tickLabelProps: Y_TICK_LABEL,
													format: (v: number) => whole.format(v)
												},
												tooltip: { context: { locked: backersLink.locked } }
											}}
										>
											{#snippet marks()}
												<!-- Shaded between the count and the year before, like the balance chart. -->
												<Threshold defined={compared}>
													{#snippet above({ defined })}
														<Area
															y0="active"
															y1="yearBefore"
															{defined}
															fill="color-mix(in oklab, var(--color-status-paid) 22%, transparent)"
														/>
													{/snippet}
													{#snippet below({ defined })}
														<Area
															y0="active"
															y1="yearBefore"
															{defined}
															fill="color-mix(in oklab, var(--color-destructive) 22%, transparent)"
														/>
													{/snippet}
												</Threshold>
												<Area
													y0="yearBefore"
													y1="yearBefore"
													defined={compared}
													fill="none"
													line={{ class: 'stroke-muted-foreground', 'stroke-dasharray': '2 3' }}
												/>
												<Area seriesKey="active" fill="none" line={{ strokeWidth: 2 }} />
											{/snippet}
											{#snippet aboveMarks({ context })}
												{#each topChanges as change (change.month + change.kind + change.backer.slug)}
													{const x = $derived(context.xScale(change.month) ?? 0)}
													{const y = $derived(context.yScale(change.active) ?? 0)}
													{const offset = $derived((change.index + 1) * MARK_STEP)}
													<g
														class="pointer-events-none"
														aria-label="{change.backer.name} {change.kind} giving regularly"
													>
														<LogoMark
															{x}
															y={change.kind === 'started' ? y - offset : y + offset}
															r={MARK_RADIUS}
															name={change.backer.name}
															imageUrl={change.backer.imageUrl}
															recurring={false}
														/>
														<circle
															cx={x}
															cy={change.kind === 'started' ? y - offset : y + offset}
															r={MARK_RADIUS + 1.5}
															class="fill-none {change.kind === 'started'
																? 'stroke-chart-income'
																: 'stroke-chart-expenses'}"
															stroke-width="1.5"
														/>
													</g>
												{/each}
											{/snippet}
											{#snippet tooltip({ context })}
												{@const hovered = context.tooltip.data as (typeof changes)[number] | null}
												<Chart.Tooltip
													labelFormatter={(key: string) => monthLabel({ key, partialKey })}
													link={backersLink}
												>
													{#snippet formatter()}
														{#if hovered}
															<div class="flex w-full flex-col gap-1.5">
																<MoneyRow
																	value={hovered.active}
																	name={changeConfig.active.label}
																	color={changeConfig.active.color}
																	money={whole}
																/>
																{#if hovered.yearBefore !== undefined}
																	<MoneyRow
																		value={hovered.yearBefore}
																		name={changeConfig.yearBefore.label}
																		color={changeConfig.yearBefore.color}
																		money={whole}
																	/>
																{/if}
																<MoneyRow
																	value={hovered.started}
																	name={changeConfig.started.label}
																	color={changeConfig.started.color}
																	money={whole}
																/>
																{#if hovered.startedBy.length}
																	{@render backerList(hovered.startedBy)}
																{/if}
																<MoneyRow
																	value={hovered.stopped}
																	name={changeConfig.stopped.label}
																	color={changeConfig.stopped.color}
																	money={whole}
																/>
																{#if hovered.stoppedBy.length}
																	{@render backerList(hovered.stoppedBy, true)}
																{/if}
															</div>
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
				{/if}
			</div>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>Top backers</Card.Title>
				<Card.Description>
					<!-- Says the period first, as every figure below, the others' split included, covers it. -->
					What each backer gave {periodPhrase(months)}.
					{#if topShare}
						The biggest gave {percent.format(topShare)} of all contributions.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ol class="flex flex-col gap-4 text-sm">
					{#each backers as backer, index (backer.slug || backer.name)}
						<li class="flex items-start gap-3">
							<!--
							The share leads each row, so the column of figures reads as the breakdown. Nudged
							down so the tops of its figures line up with the tops of the name's letters.
						-->
							<span
								class="mt-0.5 w-13 shrink-0 text-right font-display text-xl leading-none font-medium text-(--heading) tabular-nums"
							>
								{shareLabel(backer.amount)}
							</span>
							<div class="flex min-w-0 flex-1 flex-col gap-1.5">
								<div class="flex items-baseline justify-between gap-3">
									{#if backer.slug}
										<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
										<a
											href={transactionsUrl({
												slug,
												account: backer.slug,
												kinds: CONTRIBUTION_KINDS
											})}
											target="_blank"
											rel="noreferrer"
											class="flex min-w-0 items-center gap-2 font-medium hover:underline"
										>
											<!-- Their avatar or logo, as in "Who was paid", or a blank disc without one. -->
											{#if backer.imageUrl}
												<img
													src={backer.imageUrl}
													alt=""
													class="size-5 shrink-0 rounded-full border bg-card object-cover"
													loading="lazy"
												/>
											{:else}
												<span class="size-5 shrink-0 rounded-full border bg-muted"></span>
											{/if}
											<span class="truncate">{backer.name}</span>
											<ExternalLink size={12} class="shrink-0 text-muted-foreground" />
											<span class="sr-only">(opens in a new tab)</span>
										</a>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{:else}
										<!-- Everyone outside the top backers. The page cannot leave those out, so it lists every contribution in these months. -->
										<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
										<a
											href={transactionsUrl({
												slug,
												between: { from: months[0], to: months[months.length - 1] },
												kinds: CONTRIBUTION_KINDS
											})}
											target="_blank"
											rel="noreferrer"
											class="flex min-w-0 items-center gap-2 font-medium text-muted-foreground hover:text-foreground hover:underline"
										>
											<span
												class="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
											>
												<Users class="size-3" aria-hidden="true" />
											</span>
											{backer.name}
											<ExternalLink size={12} class="shrink-0" />
											<span class="sr-only">(opens in a new tab)</span>
										</a>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{/if}
									<span class="shrink-0 font-medium tabular-nums"
										>{money.format(backer.amount)}</span
									>
								</div>
								<!--
							The whole track is everything contributed in these months. The pale run is what the rows
							above gave, so each bar picks up where the last one stopped.
						-->
								<div class="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
									<div
										class="absolute inset-y-0 left-0 bg-chart-income-muted/45"
										style:width="{offsets[index]}%"
									></div>
									<!-- The others who gave once or now and then are paler, as one-off giving is in the chart above. -->
									<div
										class="absolute inset-y-0 rounded-full {backer.recurring === false
											? 'bg-chart-income-muted'
											: 'bg-chart-income'}"
										style:left="{offsets[index]}%"
										style:width="max({share(backer.amount)}%, 0.25rem)"
									></div>
								</div>
								{#if backer.tiers?.length}
									<!-- How many gave how much, and for those who give regularly, what that averages a month. -->
									<div
										class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
									>
										<span>
											{backer.tiers
												.map(
													(tier) =>
														`${tier.count} ${
															tier.max === null
																? `gave ${money.format(tier.min)}+`
																: tier.min === 0
																	? `gave under ${money.format(tier.max)}`
																	: `gave ${money.format(tier.min)}–${money.format(tier.max - 1)}`
														}`
												)
												.join(', ')}
										</span>
										{#if backer.recurring}
											<Badge variant="secondary"
												>{money.format(backer.amount / months.length)}/month avg</Badge
											>
										{/if}
									</div>
								{/if}
								{#if backer.history}
									{@const status = backerStatus({ ...backer.history, now })}
									{@const per =
										backer.history.frequency === 'MONTHLY'
											? 'month'
											: backer.history.frequency === 'YEARLY'
												? 'year'
												: undefined}
									<div
										class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
									>
										<!-- Shortens to "Oct 2026" or "Mar – May 2026" when the ends share a month or year. -->
										<span>
											{monthYear.formatRange(
												new Date(backer.history.first),
												new Date(backer.history.last)
											)},
										</span>
										<span>
											{backer.history.contributions}
											{backer.history.contributions === 1 ? 'contribution' : 'contributions'}
										</span>
										<!--
									A platform passes on many people's money in batches that Open Collective records as
									one-off, whatever each person chose, so it gets an average per month instead of a
									frequency, counted from its first contribution in these months.
								-->
										<!-- On phones the badge always takes its own line, rather than whichever line it fits on. -->
										<span class="flex basis-full items-center gap-x-2 sm:basis-auto">
											{#if backer.channel}
												{@const first = backer.history.first.slice(0, 7)}
												{@const active = months.filter((month) => month >= first).length}
												{#if active}
													<Badge variant="secondary"
														>{money.format(backer.amount / active)}/month avg</Badge
													>
												{/if}
											{:else if status === 'Stopped'}
												<!--
													An asterisk when it stopped all its regular giving on Open Collective, not only
													here, which hovering with a mouse or a tap on a phone explains. A plain "Stopped"
													already means here.
												-->
												{#if stoppedWhere(backer.slug) === 'everywhere'}
													<Popover.Root>
														<Popover.Trigger
															openOnHover
															openDelay={200}
															class={cn(badgeVariants({ variant: 'outline' }), 'hover:bg-muted')}
														>
															Stopped<Asterisk class="-ml-0.5 size-2.5!" aria-hidden="true" />
															<span class="sr-only">: {STOPPED_EVERYWHERE}</span>
														</Popover.Trigger>
														<Popover.Content class="w-64 p-3 text-sm" align="start">
															{STOPPED_EVERYWHERE}
														</Popover.Content>
													</Popover.Root>
												{:else}
													<Badge variant="outline">Stopped</Badge>
												{/if}
												{#if per}
													<span>was {money.format(backer.history.lastAmount)}/{per}</span>
												{/if}
											{:else if per}
												<Badge variant="secondary"
													>{money.format(backer.history.lastAmount)}/{per}</Badge
												>
											{:else}
												<Badge variant="secondary"
													>{backer.history.lastTransfer ? 'Balance transfer' : status}</Badge
												>
											{/if}
										</span>
									</div>
								{/if}
							</div>
						</li>
					{/each}
				</ol>
			</Card.Content>
		</Card.Root>

		<!-- What share each backer, platform and everyone else gives. A fund's few backers are clear without it. -->
		{#if !backersOnly}
			<BackerWaffle backers={income.backers[range]} {money} period={periodPhrase(months)} />
		{/if}
	</div>
{/if}
