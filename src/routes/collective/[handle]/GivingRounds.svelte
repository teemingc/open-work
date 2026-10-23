<script lang="ts">
	import { resolve } from '$app/paths';
	import { TICK_LENGTH, X_TICK_OCCLUSION } from '#lib/chart-padding.js';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { scaleSqrt, scaleTime } from 'd3-scale';
	import { moneyFormat } from './chart-format';
	import { monthEnd, swarm, type Transfer } from './financials';

	let {
		transfers,
		months,
		now,
		currency,
		focus = $bindable()
	}: {
		/** What was given in the months shown, a dot for each collective on each day. */
		transfers: Transfer[];
		months: string[];
		now: Date;
		currency: string;
		/** The recipient to pick out, as "out:" and its slug, shared with the charts beside it. */
		focus: string | null;
	} = $props();

	const money = $derived(moneyFormat(currency));
	const dayMonth = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC'
	});
	const monthYear = new Intl.DateTimeFormat('en', {
		month: 'short',
		year: '2-digit',
		timeZone: 'UTC'
	});
	const fullDate = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});

	const PADDING = { top: 4, bottom: 24, left: 12, right: 12 };
	/** The biggest dot, so a big grant stands out without hiding the small ones around it. */
	const MAX_R = 14;

	let width = $state(0);
	const plotWidth = $derived(Math.max(0, width - PADDING.left - PADDING.right));

	/** From the start of the first month shown to now, or the end of the last month. */
	const domain = $derived<[Date, Date]>([
		new Date(`${months[0]}-01T00:00:00Z`),
		new Date(Math.min(now.getTime(), monthEnd(months.at(-1) ?? months[0]).getTime()))
	]);
	/** Under three months, ticks name days; over it, months. */
	const short = $derived(domain[1].getTime() - domain[0].getTime() < 92 * 24 * 60 * 60 * 1000);
	const x = $derived(scaleTime().domain(domain).range([0, plotWidth]));
	const r = $derived(
		scaleSqrt()
			.domain([0, Math.max(1, ...transfers.map((t) => t.amount))])
			.range([0, MAX_R])
	);

	const dots = $derived.by(() => {
		const placed = transfers.map((t) => ({
			...t,
			date: new Date(`${t.day}T12:00:00Z`),
			r: Math.max(3, r(t.amount))
		}));
		const offsets = swarm(placed.map((d) => ({ x: x(d.date), r: d.r })));
		return placed.map((d, i) => ({ ...d, offset: offsets[i] }));
	});
	/** As tall as the swarm, so a busy day is never cut off. */
	const height = $derived(
		Math.max(120, 2 * Math.max(0, ...dots.map((d) => Math.abs(d.offset) + d.r)) + 8) +
			PADDING.top +
			PADDING.bottom
	);

	/** A collective's page here, which keeps the chart settings you chose. */
	const page = (slug: string) =>
		resolve(`/collective/[handle]${dashboardSearch()}`, { handle: slug });
</script>

<div bind:clientWidth={width} style:height="{height}px" data-slot="chart">
	<LazyChart class="size-full">
		{#snippet children({ Axis, ChartRoot, Svg, Tooltip })}
			<ChartRoot data={dots} x="date" xScale={scaleTime()} xDomain={domain} padding={PADDING}>
				{#snippet children({ context })}
					{@const middle = (height - PADDING.top - PADDING.bottom) / 2}
					<Svg>
						<Axis
							placement="bottom"
							rule
							grid
							tickLength={TICK_LENGTH}
							tickOcclusion={X_TICK_OCCLUSION}
							ticks={short ? 6 : 8}
							format={(d: Date) => (short ? dayMonth : monthYear).format(d)}
						/>
						{#each dots as dot (`${dot.day} ${dot.slug}`)}
							{@const picked = focus === `out:${dot.slug}`}
							{@const events = {
								onpointerenter: () => (focus = `out:${dot.slug}`),
								onpointermove: (e: PointerEvent) => context.tooltip.show(e, dot),
								onpointerleave: () => {
									focus = null;
									context.tooltip.hide();
								}
							}}
							{@const circle = {
								cx: context.xScale(dot.date),
								cy: middle + dot.offset,
								r: dot.r,
								class: [
									'fill-chart-3 stroke-card transition-opacity duration-200',
									focus && !picked ? 'opacity-25' : 'opacity-85',
									picked && 'stroke-foreground'
								]
							}}
							{#if dot.slug}
								<a
									href={page(dot.slug)}
									aria-label="{dot.name}, {money.format(dot.amount)} on {fullDate.format(dot.date)}"
									{...events}
								>
									<circle {...circle} stroke-width={picked ? 2 : 1} />
								</a>
							{:else}
								<circle {...circle} stroke-width={1} {...events} />
							{/if}
						{/each}
					</Svg>
					<Tooltip.Root variant="none" {context}>
						{#snippet children({ data }: { data: (typeof dots)[number] })}
							<div
								class="grid min-w-36 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
							>
								<div class="font-medium">{data.name}</div>
								<div class="flex justify-between gap-4">
									<span class="text-muted-foreground">{fullDate.format(data.date)}</span>
									<span class="font-mono font-medium tabular-nums">{money.format(data.amount)}</span
									>
								</div>
							</div>
						{/snippet}
					</Tooltip.Root>
				{/snippet}
			</ChartRoot>
		{/snippet}
	</LazyChart>
</div>
