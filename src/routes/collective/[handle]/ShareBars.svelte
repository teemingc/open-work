<script lang="ts">
	import { resolve } from '$app/paths';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { TooltipLink } from '#lib/tooltip-link.svelte.js';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import { ArrowRight, ExternalLink } from '@lucide/svelte';
	import { moneyFormat } from './chart-format';
	import { transactionsUrl } from './financials';
	import type { Recipient } from './grants';
	import type { LinkedProject } from './linked-project.svelte';
	import LogoMark from './LogoMark.svelte';

	let {
		recipients,
		stopped,
		linked,
		slug,
		currency
	}: {
		/** Only those whose spending is known, in the order to show them. */
		recipients: (Recipient & { spending: number; share: number })[];
		/** The fund has stopped giving, so each share is what it would cover if it still gave. */
		stopped: boolean;
		/** The project picked here or in the pack, highlighted in both. */
		linked: LinkedProject;
		/** The fund's own slug, for a link to what it gave the rest. */
		slug: string;
		currency: string;
	} = $props();

	type Row = (typeof recipients)[number];
	/** The smallest, gathered into one row whose logos spread out when it is hovered or tapped. */
	type Rest = { slug: '+rest'; share: number; low: number; rest: Row[] };

	/** Past this many rows, the smallest share the last one, so the list stays a quick read. */
	const LIMIT = 10;
	/**
	 * How many of the rest their tooltip names, the most from this fund first, so it stays small
	 * enough to see the chart past. One more would only swap a name for "and 1 more".
	 */
	const REST_NAMED = 6;
	const rows = $derived.by((): (Row | Rest)[] => {
		if (recipients.length <= LIMIT) return recipients;
		const rest = recipients.slice(LIMIT - 1);
		const shares = rest.map((r) => r.share);
		return [
			...recipients.slice(0, LIMIT - 1),
			{ slug: '+rest', share: Math.max(...shares), low: Math.min(...shares), rest }
		];
	});

	const money = $derived(moneyFormat(currency));

	/** Room right of the months for how long they last, more for the rest's "up to 10 months". */
	const label = $derived(rows.some((row) => 'rest' in row) ? 108 : 88);

	/** Each row: the name on one line, the months under it with how long they last at the end. */
	const ROW = 40;
	/** Room left of the name and months for the logo. */
	const INSET = 24;
	/** A year of a project's average spending, one cell a month. */
	const MONTHS = 12;
	/** The gap between one month's cell and the next. */
	const GAP = 2;
	/** The hatching of the fund's part once it has stopped, as the timeline hatches what has not happened. */
	const hatch = $props.id();

	/** The months of a project's average spending a share of its year pays for. */
	const months = (share: number) => share * MONTHS;
	/** How much of the month at `index` that many months fill, from 0 to 1. */
	const part = (count: number, index: number) => Math.min(1, Math.max(0, count - index));

	/**
	 * How long a gift keeps a project going at its average spending: weeks under a month, then whole
	 * months rounded down, so 11.9 is not shown as the whole year.
	 */
	function fundedLength(share: number) {
		const count = months(share);
		if (count >= MONTHS) return 'all year';
		if (count >= 1) {
			const whole = Math.floor(count);
			return `${whole} month${whole === 1 ? '' : 's'}`;
		}
		const weeks = Math.round((count * 52) / MONTHS);
		return weeks < 1 ? 'under a week' : `${weeks} week${weeks === 1 ? '' : 's'}`;
	}

	/** The project's own dashboard here, or what the fund gave the rest on Open Collective. */
	const link = new TooltipLink(
		(row: Row | Rest) =>
			'rest' in row
				? transactionsUrl({ slug, kinds: ['CONTRIBUTION'] })
				: resolve(`/collective/[handle]${dashboardSearch()}`, { handle: row.slug }),
		(row) => linked.pin('bars', row && !('rest' in row) ? row.slug : undefined)
	);

	/** The row under the pointer, told to the pack. The bars fill the box, one row each. */
	function hover(event: PointerEvent) {
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const row = rows[Math.floor((event.clientY - box.top) / ROW)];
		linked.hover('bars', row && !('rest' in row) ? row.slug : undefined);
	}
</script>

<div
	style:height="{rows.length * ROW}px"
	onpointermove={hover}
	onpointerleave={() => linked.hover('bars')}
	role="presentation"
>
	<LazyChart class="size-full">
		{#snippet children({ BarChart, Chart, TooltipRoot })}
			<Chart.Container config={{}} class="aspect-auto size-full cursor-pointer">
				<BarChart
					data={rows}
					x="share"
					y="slug"
					orientation="horizontal"
					xDomain={[0, 1]}
					bandPadding={0}
					axis={false}
					grid={false}
					rule={false}
					highlight={false}
					padding={{ top: 0, right: 0, bottom: 0, left: 0 }}
					onTooltipClick={link.click}
					props={{ tooltip: { context: { locked: link.locked } } }}
				>
					{#snippet marks({ context })}
						{@const cell = (context.width - INSET - label - GAP * (MONTHS - 1)) / MONTHS}
						{@const shown = (context.tooltip.data as Row | Rest | null)?.slug}
						{#if stopped}
							<defs>
								<pattern
									id={hatch}
									width="4"
									height="4"
									patternUnits="userSpaceOnUse"
									patternTransform="rotate(45)"
								>
									<rect width="4" height="4" class="fill-chart-expenses-muted" />
									<line y2="4" stroke-width="2" class="stroke-chart-expenses" />
								</pattern>
							</defs>
						{/if}
						{#each rows as row (row.slug)}
							{@const top = context.yScale(row.slug) ?? 0}
							{@const picked =
								'rest' in row
									? row.rest.some((other) => other.slug === linked.slug)
									: row.slug === linked.slug}
							<!-- The project picked here or in the pack. -->
							<rect
								x={-6}
								y={top + 1}
								width={context.width + 12}
								height={ROW - 2}
								rx="6"
								class={[
									'fill-primary/6',
									picked || shown === row.slug ? 'opacity-100' : 'opacity-0'
								]}
							/>
							{@const most = months(row.share)}
							{@const least = 'rest' in row ? months(row.low) : most}
							<!--
								A year of the project's average spending, a cell a month, filled for the months the fund
								pays for. The rest fill to the least any of them got, then paler to the most.
							-->
							{#each { length: MONTHS }, index (index)}
								{@const x = INSET + index * (cell + GAP)}
								<rect {x} y={top + 24} width={cell} height="8" rx="2" class="fill-muted" />
								{#if stopped && (index === 0 || part(most, index) > 0)}
									<!-- Hatched as what is not there, the months it would pay for if it gave again. -->
									<rect
										{x}
										y={top + 24}
										width={index === 0
											? Math.max(3, cell * part(most, index))
											: cell * part(most, index)}
										height="8"
										rx="2"
										fill="url(#{hatch})"
										class="stroke-chart-expenses"
										stroke-width="1"
									/>
								{:else if !stopped}
									<rect
										{x}
										y={top + 24}
										width={cell * part(most, index)}
										height="8"
										rx="2"
										class="fill-chart-expenses-muted"
									/>
									<rect
										{x}
										y={top + 24}
										width={index === 0
											? Math.max(3, cell * part(least, index))
											: cell * part(least, index)}
										height="8"
										rx="2"
										class="fill-chart-expenses"
									/>
								{/if}
							{/each}
							{#if 'rest' in row}
								<!-- One mark in the logo column like every other row; the tooltip shows their logos. -->
								<LogoMark
									x={8}
									y={top + 13}
									r={8}
									name=""
									imageUrl={null}
									recurring={false}
									mark="+"
								/>
								<text x={INSET} y={top + 17} font-size="13" class="fill-foreground"
									>{row.rest.length} other collectives</text
								>
							{:else}
								<LogoMark
									x={8}
									y={top + 13}
									r={8}
									name={row.name}
									imageUrl={row.imageUrl}
									recurring={row.monthly > 0}
								/>
								<text x={INSET} y={top + 17} font-size="13" class="fill-foreground">{row.name}</text
								>
							{/if}
							<text
								x={context.width}
								y={top + 32}
								font-size="13"
								text-anchor="end"
								class="fill-foreground font-medium tabular-nums"
								>{'rest' in row
									? `up to ${fundedLength(row.share)}`
									: fundedLength(row.share)}</text
							>
						{/each}
					{/snippet}
					{#snippet tooltip({ context })}
						{@const row = context.tooltip.data as Row | Rest | null}
						{@const href = row ? link.href(row) : undefined}
						<TooltipRoot variant="none" pointerEvents={link.locked && href !== undefined}>
							{#if row}
								<div
									class="grid max-w-60 min-w-40 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
								>
									{#if 'rest' in row}
										{const named = $derived(
											row.rest.length > REST_NAMED + 1 ? row.rest.slice(0, REST_NAMED) : row.rest
										)}
										<ul class="grid gap-2 py-0.5">
											{#each named as other (other.slug)}
												<li
													class={[
														'flex items-center gap-2 rounded-sm',
														other.slug === linked.slug && 'bg-primary/6'
													]}
												>
													<!-- A ring for a monthly gift, as on the logos in the charts. -->
													<span
														class={[
															'size-4 shrink-0 overflow-hidden rounded-full bg-card',
															other.monthly > 0
																? 'ring-2 ring-chart-expenses ring-offset-1 ring-offset-background'
																: 'ring-1 ring-border'
														]}
													>
														{#if other.imageUrl}
															<img src={other.imageUrl} alt="" class="size-full object-cover" />
														{/if}
													</span>
													<span class="flex-1 text-muted-foreground">{other.name}</span>
													<span class="font-medium tabular-nums">{fundedLength(other.share)}</span>
												</li>
											{/each}
										</ul>
										{#if named.length < row.rest.length}
											<p class="text-muted-foreground">and {row.rest.length - named.length} more</p>
										{/if}
									{:else}
										<div class="font-medium">{row.name}</div>
										<p class="text-muted-foreground">
											{money.format(row.recent)}
											{stopped ? 'a year would pay for' : 'in the past year pays for'}
											{row.share >= 1 ? 'a whole year' : fundedLength(row.share)} of what {row.name}
											spends, about {money.format(row.spending / MONTHS)} a month.
										</p>
									{/if}
									{#if href && 'rest' in row}
										<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
										<a
											{href}
											target="_blank"
											rel="noreferrer"
											class="flex items-center gap-1 border-t border-border/50 pt-1.5 font-medium underline-offset-4 hover:underline"
										>
											View on Open Collective
											<ExternalLink class="size-3 text-muted-foreground" aria-hidden="true" />
										</a>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{:else if href}
										<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved with the URL above -->
										<a
											{href}
											class="flex items-center gap-1 border-t border-border/50 pt-1.5 font-medium underline-offset-4 hover:underline"
										>
											View its dashboard
											<ArrowRight class="size-3 text-muted-foreground" aria-hidden="true" />
										</a>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{/if}
								</div>
							{/if}
						</TooltipRoot>
					{/snippet}
				</BarChart>
			</Chart.Container>
		{/snippet}
	</LazyChart>
</div>

<!-- The figures behind the bars, for screen readers, which the chart says nothing to. -->
<ul class="sr-only">
	{#each recipients as row (row.slug)}
		<li>
			{row.name}: {money.format(row.recent)}
			{stopped ? 'a year would pay for' : 'in the past year pays for'}
			{row.share >= 1 ? 'a whole year' : fundedLength(row.share)} of what it spends, about {money.format(
				row.spending / MONTHS
			)} a month
		</li>
	{/each}
</ul>
