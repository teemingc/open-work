<script lang="ts">
	import { chartPadding, TICK_LENGTH, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import { scaleBand } from 'd3-scale';
	import { BarChart } from 'layerchart';
	import { ExternalLink } from '@lucide/svelte';
	import { bandTickFormat, compactFormat, monthLabel, moneyFormat } from './chart-format';
	import { backerStatus, transactionsUrl } from './financials';
	import BackerWaffle from './BackerWaffle.svelte';
	import MoneyRow from './MoneyRow.svelte';
	import type { IncomeSources } from './stats.remote';

	let {
		income,
		slug,
		currency,
		months,
		partialKey,
		range,
		now
	}: {
		/**
		 * Passed in rather than awaited here: values derived after a top-level `await` stop caching
		 * once it resolves, and the chart, drawn later as it scrolls into view, would lock up the page.
		 */
		income: IncomeSources;
		/** The collective. */
		slug: string;
		currency: string;
		months: string[];
		partialKey?: string;
		range: '1y' | '2y' | 'all';
		now: Date;
	} = $props();

	const CONTRIBUTION_KINDS = ['CONTRIBUTION', 'ADDED_FUNDS'];
	/** Gave the most, then less, then least: fading shades of the income colour. */
	const TIER_SHADES = ['bg-chart-income', 'bg-chart-income/60', 'bg-chart-income/30'];

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
				oneOff: Math.round(found?.oneOff ?? 0)
			};
		})
	);
	const recurring = $derived(rows.reduce((sum, row) => sum + row.recurring, 0));
	const total = $derived(rows.reduce((sum, row) => sum + row.recurring + row.oneOff, 0));

	const backers = $derived(income.backers[range]);
	const biggest = $derived(Math.max(...backers.map((backer) => backer.amount), 1));
	const topShare = $derived(total && backers[0]?.slug ? backers[0].amount / total : 0);

	function openMonth(_event: MouseEvent, { data: row }: { data: { month: string } }) {
		window.open(
			transactionsUrl({ slug, month: row.month, kinds: CONTRIBUTION_KINDS }),
			'_blank',
			'noopener'
		);
	}

	const config = {
		recurring: { label: 'Recurring', color: 'var(--color-chart-income)' },
		oneOff: { label: 'One-off', color: 'var(--color-chart-income-muted)' }
	} satisfies Chart.ChartConfig;
	import LazyChart from './LazyChart.svelte';
</script>

{#snippet row({ value, name, item }: { value: unknown; name: string; item: { color?: string } })}
	{#if typeof value === 'number'}
		<MoneyRow {value} {name} color={item.color} {money} />
	{/if}
{/snippet}

<div class="grid animate-in gap-4 duration-300 fade-in lg:grid-cols-2">
	<Card.Root>
		<Card.Header>
			<Card.Title>Recurring and one-off contributions</Card.Title>
			<Card.Description>
				{money.format(total)} contributed in the shown months, {percent.format(
					total ? recurring / total : 0
				)} of it from recurring contributions.
			</Card.Description>
		</Card.Header>
		<!-- Grows to the height of the backers list beside it instead of leaving a gap. -->
		<Card.Content class="flex flex-1 flex-col">
			<LazyChart class="mb-3 h-64 flex-1">
				<Chart.Container {config} class="aspect-auto h-full min-h-64 w-full cursor-pointer">
					<BarChart
						padding={chartPadding({ legend: true })}
						data={rows}
						x="month"
						xScale={scaleBand().padding(0.2)}
						seriesLayout="stack"
						onTooltipClick={openMonth}
						legend
						series={[
							{ key: 'recurring', label: config.recurring.label, color: config.recurring.color },
							{ key: 'oneOff', label: config.oneOff.label, color: config.oneOff.color }
						]}
						props={{
							bars: { radius: 2, strokeWidth: 0 },
							xAxis: { tickLength: TICK_LENGTH, format: bandTickFormat(months) },
							yAxis: {
								tickLength: TICK_LENGTH,
								tickLabelProps: Y_TICK_LABEL,
								format: (v: number) => compact.format(v)
							}
						}}
					>
						{#snippet tooltip()}
							<Chart.Tooltip
								labelFormatter={(key: string) => monthLabel({ key, partialKey })}
								formatter={row}
							/>
						{/snippet}
					</BarChart>
				</Chart.Container>
			</LazyChart>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Top backers</Card.Title>
			<Card.Description>
				{#if topShare}
					The biggest backer gave {percent.format(topShare)} of contributions in the shown months.
				{:else}
					Contributions in the shown months, by backer.
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<ol class="flex flex-col gap-3 text-sm">
				{#each backers as backer (backer.slug)}
					<li class="flex flex-col gap-1">
						<div class="flex items-baseline justify-between gap-3">
							{#if backer.slug}
								<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
								<a
									href={transactionsUrl({ slug, account: backer.slug, kinds: CONTRIBUTION_KINDS })}
									target="_blank"
									rel="noreferrer"
									class="flex min-w-0 items-center gap-1.5 font-medium hover:underline"
								>
									<span class="truncate">{backer.name}</span>
									{#if backer.channel}
										<Badge variant="secondary" title="Passes on money from many people"
											>Platform</Badge
										>
									{/if}
									<ExternalLink size={12} class="shrink-0 text-muted-foreground" />
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
									class="flex min-w-0 items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground hover:underline"
								>
									{backer.name}
									<ExternalLink size={12} class="shrink-0" />
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{/if}
							<span class="flex shrink-0 items-baseline gap-2">
								{#if range !== 'all' && backer.lifetime && backer.lifetime - backer.amount >= 1}
									<span class="text-xs text-muted-foreground">
										<span class="tabular-nums">{money.format(backer.lifetime)}</span> all time
									</span>
								{/if}
								<span class="tabular-nums">{money.format(backer.amount)}</span>
							</span>
						</div>
						{#if backer.tiers?.length}
							<!-- The others, split by how much each gave, biggest givers first. -->
							<div class="flex h-1.5 gap-px overflow-hidden rounded-full bg-muted">
								{#each backer.tiers as tier, index (tier.min)}
									<div
										class="h-full {TIER_SHADES[index]}"
										style:width="{(tier.amount / biggest) * 100}%"
									></div>
								{/each}
							</div>
							<ul class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
								{#each backer.tiers as tier, index (tier.min)}
									<li class="flex items-center gap-1.5">
										<span class="size-2 rounded-[2px] {TIER_SHADES[index]}" aria-hidden="true"
										></span>
										{tier.count}
										{tier.max === null
											? `gave ${money.format(tier.min)}+`
											: tier.min === 0
												? `gave under ${money.format(tier.max)}`
												: `gave ${money.format(tier.min)}–${money.format(tier.max - 1)}`}:
										<span class="tabular-nums">{money.format(tier.amount)}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<div class="h-1.5 rounded-full bg-muted">
								<div
									class="h-full rounded-full bg-chart-income"
									style:width="{(backer.amount / biggest) * 100}%"
								></div>
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
								<span>
									{monthYear.format(new Date(backer.history.first))} – {monthYear.format(
										new Date(backer.history.last)
									)},
								</span>
								<span>
									{backer.history.contributions}
									{backer.history.contributions === 1 ? 'contribution' : 'contributions'}
								</span>
								<!--
									A platform passes on many people's money in batches that Open Collective records as
									one-off, whatever each person chose, so it gets no frequency.
								-->
								{#if backer.channel}
									<!-- Nothing: see above. -->
								{:else if status === 'Stopped'}
									<Badge variant="outline">Stopped</Badge>
									{#if per}
										<span>was {money.format(backer.history.lastAmount)}/{per}</span>
									{/if}
								{:else if per}
									<Badge variant="secondary">{money.format(backer.history.lastAmount)}/{per}</Badge>
								{:else}
									<Badge variant="secondary">{status}</Badge>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ol>
		</Card.Content>
	</Card.Root>

	<!-- What share each backer, platform and everyone else gives. -->
	<BackerWaffle {backers} {money} />
</div>
