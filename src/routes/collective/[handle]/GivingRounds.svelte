<script lang="ts">
	import { resolve } from '$app/paths';
	import { TICK_LENGTH, X_TICK_OCCLUSION } from '#lib/chart-padding.js';
	import { collectiveLogo } from '#lib/collective-suggestions.js';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { scaleSqrt, scaleTime } from 'd3-scale';
	import { moneyFormat } from './chart-format';
	import { monthEnd, type Transfer } from './financials';

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

	const uid = $props.id();
	const PADDING = { top: 8, bottom: 24, left: 12, right: 12 };
	/** The biggest dot, so a big grant stands out without hiding the small ones around it. */
	const MAX_R = 18;
	/** The smallest, still big enough to point at. */
	const MIN_R = 4;
	/** From this size a dot shows the collective's logo; smaller, a logo is too small to tell. */
	const LOGO_R = 8;
	const GAP = 1;

	/** From the start of the first month shown to now, or the end of the last month. */
	const domain = $derived<[Date, Date]>([
		new Date(`${months[0]}-01T00:00:00Z`),
		new Date(Math.min(now.getTime(), monthEnd(months.at(-1) ?? months[0]).getTime()))
	]);
	/** Under three months, ticks name days; over it, months. */
	const short = $derived(domain[1].getTime() - domain[0].getTime() < 92 * 24 * 60 * 60 * 1000);
	const r = $derived(
		scaleSqrt()
			.domain([0, Math.max(1, ...transfers.map((t) => t.amount))])
			.range([0, MAX_R])
	);

	/** Biggest first, so the big gifts sit at the bottom of each pile and the small ones on top. */
	const dots = $derived(
		transfers
			.map((t) => ({ ...t, date: new Date(`${t.day}T12:00:00Z`), r: Math.max(MIN_R, r(t.amount)) }))
			.sort((a, b) => b.amount - a.amount)
	);
	/** The week a date is in, counted from the first week of 1970. */
	const week = (date: Date) => Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
	/**
	 * Tall enough for the highest pile: at most every gift of one week stacked on each other, as gifts
	 * days apart pile together, while gifts further apart sit beside them.
	 */
	const height = $derived(
		Math.max(
			120,
			Math.max(
				0,
				...dots
					.reduce(
						(weeks, d) => weeks.set(week(d.date), (weeks.get(week(d.date)) ?? 0) + 2 * d.r + GAP),
						new Map<number, number>()
					)
					.values()
			) + 8
		) +
			PADDING.top +
			PADDING.bottom
	);

	/** A collective's page here, which keeps the chart settings you chose. */
	const page = (slug: string) =>
		resolve(`/collective/[handle]${dashboardSearch()}`, { handle: slug });
</script>

<div style:height="{height}px" data-slot="chart">
	<LazyChart class="size-full">
		{#snippet children({ Axis, ChartRoot, Dodge, Svg, Tooltip })}
			<ChartRoot data={dots} x="date" xScale={scaleTime()} xDomain={domain} padding={PADDING}>
				{#snippet children({ context })}
					<Svg>
						<defs>
							<!-- One circle for every logo, sized to each by its own box. -->
							<clipPath id="{uid}-round" clipPathUnits="objectBoundingBox">
								<circle cx="0.5" cy="0.5" r="0.5" />
							</clipPath>
						</defs>
						<Axis
							placement="bottom"
							rule
							grid
							tickLength={TICK_LENGTH}
							tickOcclusion={X_TICK_OCCLUSION}
							ticks={short ? 6 : 8}
							format={(d: Date) => (short ? dayMonth : monthYear).format(d)}
						/>
						<!-- Gifts pile up from the axis, like drops collecting, each day's beside the day before. -->
						<Dodge
							data={dots}
							axis="y"
							anchor="bottom"
							r={(d: (typeof dots)[number]) => d.r}
							padding={GAP}
						>
							{#snippet children({ items })}
								{#each items as { data: dot, x, y, r } (`${dot.day} ${dot.slug}`)}
									{@const picked = focus === `out:${dot.slug}`}
									{@const events = {
										onpointerenter: () => (focus = `out:${dot.slug}`),
										onpointermove: (e: PointerEvent) => context.tooltip.show(e, dot),
										onpointerleave: () => {
											focus = null;
											context.tooltip.hide();
										}
									}}
									{@const mark = [
										'transition-opacity duration-200',
										focus && !picked ? 'opacity-25' : 'opacity-100'
									]}
									<!-- A gift opens the collective's own page here; one Open Collective no longer shows has none. -->
									<a
										href={dot.slug ? page(dot.slug) : undefined}
										aria-label="{dot.name}, {money.format(dot.amount)} on {fullDate.format(
											dot.date
										)}"
										class={mark}
										{...events}
									>
										<circle cx={x} cy={y} {r} class="fill-chart-3" />
										{#if dot.slug && r >= LOGO_R}
											<!-- Hidden if the collective has no logo, leaving the dot. -->
											<image
												href={collectiveLogo(dot.slug)}
												x={x - r}
												y={y - r}
												width={2 * r}
												height={2 * r}
												clip-path="url(#{uid}-round)"
												preserveAspectRatio="xMidYMid slice"
												onerror={(e) => e.currentTarget.remove()}
											/>
										{/if}
										<circle
											cx={x}
											cy={y}
											{r}
											fill="none"
											class={picked ? 'stroke-foreground' : 'stroke-card'}
											stroke-width={picked ? 2 : 1}
										/>
									</a>
								{/each}
							{/snippet}
						</Dodge>
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
