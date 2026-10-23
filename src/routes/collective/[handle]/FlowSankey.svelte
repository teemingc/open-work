<script lang="ts">
	import { resolve } from '$app/paths';
	import { collectiveLogo } from '#lib/collective-suggestions.js';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { compactFormat, moneyFormat } from './chart-format';
	import type { FlowLink, FlowNode } from './financials';

	/** A node as the Sankey layout places it. */
	type Node = FlowNode & { x0?: number; x1?: number; y0?: number; y1?: number; value?: number };
	/** A flow as the Sankey layout places it, between its two nodes. */
	type Link = { source: Node; target: Node; value: number; width?: number; index?: number };

	let {
		graph,
		currency,
		onshowothers,
		focus = $bindable()
	}: {
		graph: { nodes: FlowNode[]; links: FlowLink[] };
		currency: string;
		/** Asks for the recipients past the named few to be drawn one by one. */
		onshowothers: () => void;
		/** The node to pick out, as its id, like "out:vite", shared with the charts beside it. */
		focus: string | null;
	} = $props();

	const uid = $props.id();
	const money = $derived(moneyFormat(currency));
	const compact = $derived(compactFormat(currency));
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });

	const COLORS: Record<FlowNode['kind'], string> = {
		backer: 'var(--color-chart-income)',
		collective: 'var(--color-chart-balance)',
		recipient: 'var(--color-chart-3)',
		expenses: 'var(--color-chart-expenses)',
		kept: 'var(--color-chart-4)',
		other: 'var(--color-chart-other)'
	};

	const ids = $derived(new Set(graph.nodes.map((node) => node.id)));
	/**
	 * The node `focus` lands on: itself, or the "others" a recipient left out of the chart is part of.
	 * Picking the collective in the middle lights every flow.
	 */
	const lit = $derived(
		focus === null || focus === 'collective'
			? null
			: ids.has(focus)
				? focus
				: focus.startsWith('out:') && ids.has('out:others')
					? 'out:others'
					: null
	);
	/** Whether a flow stands out: every one when nothing is picked, else those touching the pick. */
	const isLit = (link: Link) => lit === null || link.source.id === lit || link.target.id === lit;

	/** Tall enough for the busier side's labels to sit one under another. */
	const height = $derived(
		Math.max(
			280,
			30 *
				Math.max(
					graph.nodes.filter((n) => n.side === 'source').length,
					graph.nodes.filter((n) => n.side === 'target').length
				)
		)
	);

	let width = $state(0);
	const LABEL_STYLE = { fontSize: '12px' } as CSSStyleDeclaration;
	const LOGO = 16;
	/** A drop's radius, and how fast drops run along a flow, in pixels a second. */
	const DROP = 2;
	const SPEED = 90;
	/**
	 * Starts a drop `start` of the way along its flow: on to the end, back to the start at once, and
	 * on to where it began. Attributes of `<animateMotion>` that MotionPath passes on but does not type.
	 */
	const stagger = (start: number) =>
		({
			calcMode: 'linear',
			keyPoints: `${start};1;0;${start}`,
			keyTimes: `0;${1 - start};${1 - start};1`
		}) as Record<string, string>;

	const total = $derived(
		graph.links.filter((l) => l.target === 'collective').reduce((sum, l) => sum + l.value, 0)
	);

	/** Room beside a node for its logo and label: up to the middle, less the node and gaps. */
	const room = $derived(width / 2 - 40);
	/** A name cut to the room there is, about 6.5px a character at the labels' size. */
	/** On phones the labels keep to names alone; amounts are in the tooltips and the list. */
	const narrow = $derived(width > 0 && width < 520);
	const short = (name: string) => {
		const max = Math.max(6, Math.floor((narrow ? room - 8 : room - LOGO - 60) / 6.5));
		return name.length > max ? `${name.slice(0, max - 1)}…` : name;
	};

	/** A collective's page here, which keeps the chart settings you chose. */
	const page = (slug: string) =>
		resolve(`/collective/[handle]${dashboardSearch()}`, { handle: slug });
</script>

<!-- A node's logo and label, beside it towards the middle. -->
{#snippet label(node: Node)}
	{@const side = node.side}
	{@const h = (node.y1 ?? 0) - (node.y0 ?? 0)}
	{@const w = (node.x1 ?? 0) - (node.x0 ?? 0)}
	{@const logo = node.slug && side !== 'collective' && !narrow}
	{@const start = side === 'source' ? w + 6 : -6}
	{@const textX = logo ? start + (side === 'source' ? LOGO + 4 : -(LOGO + 4)) : start}
	{@const anchor = side === 'source' ? 'start' : 'end'}
	{@const twoLines = h >= 26 && !narrow}
	{#if logo}
		<g
			transform="translate({side === 'source' ? start : start - LOGO} {h / 2 - LOGO / 2})"
			clip-path="url(#{uid}-logo)"
			class="pointer-events-none"
		>
			<rect width={LOGO} height={LOGO} class="fill-card" />
			<!-- An account without a logo of its own shows the card behind instead of a broken image. -->
			<image
				href={collectiveLogo(node.slug!)}
				width={LOGO}
				height={LOGO}
				onerror={(e) => e.currentTarget.remove()}
			/>
		</g>
	{/if}
	<!-- Outlined in the card's colour, so a label stays readable over the flows behind it. -->
	<text
		x={textX}
		y={h / 2}
		text-anchor={anchor}
		dominant-baseline="middle"
		class="pointer-events-none fill-foreground stroke-card [stroke-width:3px] text-xs [paint-order:stroke] [stroke-linejoin:round]"
	>
		{#if twoLines}
			<tspan x={textX} dy="-0.6em" class="font-medium">{short(node.name)}</tspan>
			<tspan x={textX} dy="1.25em" class="fill-muted-foreground tabular-nums">
				{money.format(node.value ?? 0)} · {percent.format(total ? (node.value ?? 0) / total : 0)}
			</tspan>
		{:else}
			<tspan class="font-medium">{short(node.name)}</tspan>
			{#if !narrow}
				<tspan class="fill-muted-foreground tabular-nums">{compact.format(node.value ?? 0)}</tspan>
			{/if}
		{/if}
	</text>
{/snippet}

<div bind:clientWidth={width} style:height="{height}px" data-slot="chart">
	<LazyChart class="size-full">
		{#snippet children({ ChartRoot, Group, Link, MotionPath, Rect, Sankey, Svg, Text, Tooltip })}
			<ChartRoot data={graph} flatData={[]} padding={{ top: 22, bottom: 2 }}>
				{#snippet children({ context })}
					<Svg>
						<defs>
							<clipPath id="{uid}-logo">
								<rect width={LOGO} height={LOGO} rx="3" />
							</clipPath>
						</defs>
						<Sankey
							nodeId={(d: FlowNode) => d.id}
							nodeAlign="justify"
							nodeWidth={10}
							nodePadding={16}
							// In the order given, biggest first, rather than moved about to shorten the flows.
							nodeSort={() => 0}
						>
							{#snippet children({ links, nodes })}
								<defs>
									<!-- Each flow shades from where the money came from to where it went. -->
									{#each links as link (`${link.source.id} ${link.target.id}`)}
										<linearGradient
											id="{uid}-{link.index}"
											gradientUnits="userSpaceOnUse"
											x1={link.source.x1}
											x2={link.target.x0}
										>
											<stop offset="0%" stop-color={COLORS[link.source.kind as FlowNode['kind']]} />
											<stop
												offset="100%"
												stop-color={COLORS[link.target.kind as FlowNode['kind']]}
											/>
										</linearGradient>
									{/each}
								</defs>
								{#each links as link (`${link.source.id} ${link.target.id}`)}
									<Link
										sankey
										id="{uid}-path-{link.index}"
										data={link}
										fill="none"
										stroke="url(#{uid}-{link.index})"
										strokeOpacity={isLit(link as Link) ? 0.45 : 0.08}
										strokeWidth={Math.max(1, link.width ?? 0)}
										motion="tween"
										class="transition-[stroke-opacity] duration-200"
										onpointerenter={() => {
											const outer = link.source.side === 'source' ? link.source : link.target;
											focus = outer.id;
										}}
										onpointermove={(e: PointerEvent) => context.tooltip.show(e, { link })}
										onpointerleave={() => {
											focus = null;
											context.tooltip.hide();
										}}
									/>
								{/each}
								{#if !prefersReducedMotion.current}
									<!--
										Drops running along each flow, more on a wider one, so the money is seen moving
										downstream. Spread across the flow's width and along it, each starting part way.
									-->
									{#each links as link (`${link.source.id} ${link.target.id}`)}
										{#if isLit(link as Link)}
											{@const w = Math.max(1, link.width ?? 0)}
											{@const count = Math.min(5, Math.max(1, Math.round(w / 10)))}
											{@const seconds = Math.max(
												1.5,
												((link.target.x0 ?? 0) - (link.source.x1 ?? 0)) / SPEED
											)}
											{#each { length: count }, i (i)}
												{@const start = (i + 0.5) / count}
												{@const across =
													count === 1
														? 0
														: (w / 2 - DROP) * ((((i * 7) % count) / (count - 1)) * 2 - 1)}
												<MotionPath
													pathId="{uid}-path-{link.index}"
													objectId="{uid}-drop-{link.index}-{i}"
													duration="{seconds}s"
													repeatCount="indefinite"
													{...stagger(start)}
												>
													{#snippet children({ objectId })}
														<circle
															id={objectId}
															cy={across}
															r={Math.min(DROP, w / 2)}
															class="pointer-events-none fill-card"
															opacity="0.75"
														/>
													{/snippet}
												</MotionPath>
											{/each}
										{/if}
									{/each}
								{/if}
								{#each nodes as node (node.id)}
									{@const h = Math.max(1, (node.y1 ?? 0) - (node.y0 ?? 0))}
									{@const w = (node.x1 ?? 0) - (node.x0 ?? 0)}
									{@const dim = lit !== null && lit !== node.id && node.side !== 'collective'}
									{@const events = {
										onpointerenter: () => (focus = node.id),
										onpointermove: (e: PointerEvent) => context.tooltip.show(e, { node }),
										onpointerleave: () => {
											focus = null;
											context.tooltip.hide();
										}
									}}
									<Group
										x={node.x0}
										y={node.y0}
										motion="tween"
										class="transition-opacity duration-200 {dim ? 'opacity-40' : ''}"
									>
										{#if node.kind === 'recipient' && node.slug}
											<!-- A collective given to opens its own page here, to follow the money on. -->
											<a
												href={page(node.slug)}
												aria-label="{node.name}, given {money.format(node.value ?? 0)}"
												{...events}
											>
												<Rect width={w} height={h} fill={COLORS.recipient} rx={2} motion="tween" />
												<!-- The label is part of the link too. -->
												<rect x={-room} width={room + w} height={h} fill="transparent" />
											</a>
										{:else if node.id === 'out:others'}
											<!-- The recipients too small to name, which open into one node each. -->
											<g
												role="button"
												tabindex="0"
												aria-label="Show each of the {node.name}"
												class="cursor-pointer"
												onclick={() => onshowothers()}
												onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onshowothers()}
												{...events}
											>
												<Rect width={w} height={h} fill={COLORS.other} rx={2} motion="tween" />
												<rect x={-room} width={room + w} height={h} fill="transparent" />
											</g>
										{:else}
											<Rect
												width={w}
												height={h}
												fill={COLORS[node.kind as FlowNode['kind']]}
												rx={2}
												motion="tween"
												{...events}
											/>
										{/if}
										{#if node.side === 'collective'}
											<Text
												x={w / 2}
												y={-8}
												value={node.name}
												textAnchor="middle"
												verticalAnchor="end"
												truncate={{ maxWidth: width, style: LABEL_STYLE }}
												class="pointer-events-none fill-foreground stroke-card [stroke-width:3px] text-xs font-medium [paint-order:stroke] [stroke-linejoin:round]"
											/>
										{:else}
											{@render label(node as Node)}
										{/if}
									</Group>
								{/each}
							{/snippet}
						</Sankey>
					</Svg>
					<Tooltip.Root variant="none" {context}>
						{#snippet children({ data }: { data: { node?: Node; link?: Link } })}
							<div
								class="grid min-w-36 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
							>
								{#if data.node}
									<div class="font-medium">{data.node.name}</div>
									<div class="flex justify-between gap-4">
										<span class="text-muted-foreground">
											{data.node.side === 'source'
												? 'Came in'
												: data.node.side === 'target'
													? 'Went out'
													: 'Passed through'}
										</span>
										<span class="font-mono font-medium tabular-nums"
											>{money.format(data.node.value ?? 0)}</span
										>
									</div>
									{#if data.node.side !== 'collective'}
										<div class="text-muted-foreground">
											<!-- Both sides add up to what came in, so shares are of that. -->
											{percent.format(total ? (data.node.value ?? 0) / total : 0)} of the {money.format(
												total
											)} that came in
										</div>
									{/if}
									{#if data.node.kind === 'recipient' && data.node.slug}
										<div class="border-t border-border/50 pt-1.5 text-muted-foreground">
											Click to see where its money goes
										</div>
									{:else if data.node.id === 'out:others'}
										<div class="border-t border-border/50 pt-1.5 text-muted-foreground">
											Click to show each one
										</div>
									{/if}
								{:else if data.link}
									<div class="font-medium">{data.link.source.name} → {data.link.target.name}</div>
									<div class="flex justify-between gap-4">
										<span class="text-muted-foreground">Amount</span>
										<span class="font-mono font-medium tabular-nums"
											>{money.format(data.link.value)}</span
										>
									</div>
								{/if}
							</div>
						{/snippet}
					</Tooltip.Root>
				{/snippet}
			</ChartRoot>
		{/snippet}
	</LazyChart>
</div>
