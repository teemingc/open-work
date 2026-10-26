<script lang="ts">
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { TooltipLink } from '#lib/tooltip-link.svelte.js';
	import { ExternalLink } from '@lucide/svelte';
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
		/** Only those whose contributions are known, in the order to show them. */
		recipients: (Recipient & { contributions: number; share: number })[];
		/** The fund has stopped giving, so each share is what it would be if it still gave. */
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

	/** Each row: the name on one line, the bar under it with its percentage at the end. */
	const ROW = 40;
	/** Room left of the name and bar for the logo. */
	const INSET = 24;
	/** Room right of the bar for its percentage, or for what the fund would add once it has stopped. */
	const label = $derived(stopped ? 64 : 44);
	/** The gap between what a project receives now and the fund's part after it. */
	const GAP = 2;
	/** The hatching of the fund's part once it has stopped, as the timeline hatches what has not happened. */
	const hatch = $props.id();
	/** What the fund gave a project in its last year of giving, set against what it receives now. */
	const ofReceived = (row: Row) => percent(row.recent / (row.contributions - row.recent));
	/** What the fund would add to all of the rest together. */
	const added = (row: Rest) => row.rest.reduce((sum, other) => sum + other.recent, 0);

	/** Rounded down near the top, so 99.6% is not shown as all of it. */
	const percent = (share: number) =>
		share < 0.005 ? '<1%' : share < 1 ? `${Math.min(99, Math.round(share * 100))}%` : '100%';
	/** From the least to the most any of the rest got, like "<1–8%". */
	const range = ({ low, share }: Rest) =>
		percent(low) === percent(share)
			? percent(share)
			: `${percent(low).replace('%', '')}–${percent(share)}`;

	/** The project's own page, where its contributions are, or what the fund gave the rest. */
	const link = new TooltipLink(
		(row: Row | Rest) =>
			'rest' in row
				? transactionsUrl({ slug, kinds: ['CONTRIBUTION'] })
				: `https://opencollective.com/${row.slug}`,
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
						{@const width = context.width - INSET - label}
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
							{#if stopped}
								<!--
									The project's whole year if the fund gave again: what it receives now, then the fund's
									part, hatched as what is not there.
								-->
								<rect
									x={INSET}
									y={top + 24}
									width={Math.max(0, width * (1 - row.share) - GAP)}
									height="8"
									rx="4"
									class="fill-chart-income-muted"
								/>
								<rect
									x={INSET + width * (1 - row.share)}
									y={top + 24}
									width={Math.max(4, width * row.share)}
									height="8"
									rx="4"
									fill="url(#{hatch})"
									class="stroke-chart-expenses"
									stroke-width="1"
								/>
							{:else}
								<rect x={INSET} y={top + 24} {width} height="8" rx="4" class="fill-muted" />
							{/if}
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
								{#if !stopped}
									<!-- From the least to the most any of them got from this fund. -->
									<rect
										x={INSET + width * row.low}
										y={top + 24}
										width={Math.max(4, width * (row.share - row.low))}
										height="8"
										rx="4"
										class="fill-chart-expenses-muted"
									/>
								{/if}
								<text
									x={context.width}
									y={top + 32}
									font-size="13"
									text-anchor="end"
									class="fill-foreground font-medium tabular-nums"
									>{stopped ? `+${money.format(added(row))}` : range(row)}</text
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
								{#if !stopped}
									<rect
										x={INSET}
										y={top + 24}
										width={Math.max(4, width * row.share)}
										height="8"
										rx="4"
										class="fill-chart-expenses"
									/>
								{/if}
								<text
									x={context.width}
									y={top + 32}
									font-size="13"
									text-anchor="end"
									class="fill-foreground font-medium tabular-nums"
									>{stopped ? `+${money.format(row.recent)}` : percent(row.share)}</text
								>
							{/if}
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
													<span class="font-medium tabular-nums">{percent(other.share)}</span>
												</li>
											{/each}
										</ul>
										{#if named.length < row.rest.length}
											<p class="text-muted-foreground">and {row.rest.length - named.length} more</p>
										{/if}
									{:else}
										<div class="font-medium">{row.name}</div>
										<p class="text-muted-foreground">
											{#if stopped}
												{money.format(row.recent)} a year would add {ofReceived(row)} to the {money.format(
													row.contributions - row.recent
												)}
												{row.name} received last year.
											{:else if row.recent >= row.contributions}
												All {money.format(row.contributions)}
												{row.name} received in the past year came from this fund.
											{:else}
												{money.format(row.recent)} of the {money.format(row.contributions)}
												{row.name} received in the past year came from this fund.
											{/if}
										</p>
									{/if}
									{#if href}
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
			{#if stopped}
				{row.name}: {money.format(row.recent)} a year would add {ofReceived(row)} to the {money.format(
					row.contributions - row.recent
				)} it received last year
			{:else}
				{row.name}: {percent(row.share)} of its contributions in the past year, {money.format(
					row.recent
				)} of {money.format(row.contributions)}
			{/if}
		</li>
	{/each}
</ul>
