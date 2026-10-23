<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { hierarchy, type HierarchyRectangularNode } from 'd3-hierarchy';
	import { cubicInOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { moneyFormat } from './chart-format';
	import type { FlowLink, FlowNode } from './financials';

	let {
		graph,
		currency,
		focus = $bindable()
	}: {
		/** Every recipient named, with those followed further, from `flowGraph`. */
		graph: { nodes: FlowNode[]; links: FlowLink[] };
		currency: string;
		/** The node to pick out, shared with the charts beside it. */
		focus: string | null;
	} = $props();

	/** One block of the treemap: a collective given to, or a part of what it did with the money. */
	type Block = { id: string; name: string; slug?: string; value?: number; children?: Block[] };
	type Placed = HierarchyRectangularNode<Block>;

	const money = $derived(moneyFormat(currency));

	const byId = $derived(new Map(graph.nodes.map((node) => [node.id, node])));
	/** What the collective gave, and under each recipient followed further, what it did with it. */
	const root = $derived.by(() => {
		const block = (id: string, value: number): Block => {
			const node = byId.get(id)!;
			const below = graph.links.filter((l) => l.source === id);
			return {
				id,
				name: node.name,
				slug: node.slug,
				...(below.length ? { children: below.map((l) => block(l.target, l.value)) } : { value })
			};
		};
		const given = graph.links.filter(
			(l) =>
				l.source === 'collective' && ['recipient', 'other'].includes(byId.get(l.target)?.kind ?? '')
		);
		return hierarchy<Block>({
			id: 'collective',
			name: '',
			children: given.map((l) => block(l.target, l.value))
		})
			.sum((d) => d.value ?? 0)
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
	});

	/** Each recipient its own hue, shared by what it passed on, which sits a tier higher and darker. */
	const hues = $derived(
		new Map(root.children?.map((child, i, all) => [child.data.id, (i * 360) / all.length + 150]))
	);
	const hue = (node: Placed) =>
		hues.get(node.depth === 1 ? node.data.id : (node.parent?.data.id ?? '')) ?? 150;
	const fill = (node: Placed) => {
		const kind = byId.get(node.data.id)?.kind;
		if (kind === 'kept') return 'var(--color-chart-4)';
		if (kind === 'expenses') return 'var(--color-chart-expenses)';
		return `hsl(${hue(node)} ${node.depth === 1 ? 45 : 55}% ${node.depth === 1 ? 62 : 45}%)`;
	};

	let view = $state<'isometric' | 'flat'>('isometric');
	let width = $state(0);
	/** Shorter on phones, where the blocks seen at an angle would leave the rest empty. */
	const height = $derived(width > 0 && width < 520 ? 280 : 420);

	/** A label lying along a block's longer side, as large as fits, or nothing on a sliver. */
	function label(node: Placed) {
		const width = node.x1 - node.x0;
		const height = node.y1 - node.y0;
		const vertical = height > width * 1.3;
		const along = vertical ? height : width;
		const across = vertical ? width : height;
		// About 0.6em a character.
		const size = Math.min(
			(along * 0.85) / (0.6 * Math.max(3, node.data.name.length)),
			across * 0.6,
			22
		);
		return size >= 7 ? { vertical, size } : null;
	}

	/** `rotate` turned half round if, seen from where the view is, it would read right to left. */
	function readable(rotate: number, m: { a: number; c: number } | null | undefined) {
		if (!m) return rotate;
		const across = rotate === 90 ? m.c : m.a;
		return across < 0 ? rotate + 180 : rotate;
	}

	/** A collective's page here, which keeps the chart settings you chose. */
	const page = (slug: string) =>
		resolve(`/collective/[handle]${dashboardSearch()}`, { handle: slug });
</script>

<div class="flex flex-col gap-2">
	<ToggleGroup.Root
		type="single"
		variant="outline"
		size="sm"
		class="self-end"
		aria-label="View"
		bind:value={() => view, (value) => value && (view = value as typeof view)}
	>
		<ToggleGroup.Item value="isometric">3D</ToggleGroup.Item>
		<ToggleGroup.Item value="flat">Flat</ToggleGroup.Item>
	</ToggleGroup.Root>
	<div bind:clientWidth={width} style:height="{height}px" data-slot="chart">
		<LazyChart class="size-full">
			{#snippet children({ ChartRoot, isometric, Rect, Svg, Text, Tooltip, Treemap })}
				<!-- One thin tier for each level: recipients, then what they did with the money. -->
				<ChartRoot
					zDomain={[0, root.height + 1]}
					zRange={({ height }: { height: number }) => [0, ((root.height + 1) * height) / 14]}
					view={isometric({
						rotate: view === 'flat' ? 0 : -45,
						tilt: view === 'flat' ? 0 : 58,
						motion: prefersReducedMotion.current
							? undefined
							: { type: 'tween', duration: 800, easing: cubicInOut }
					})}
					padding={view === 'flat' ? 4 : 32}
				>
					{#snippet children({ context })}
						<Svg>
							<Treemap hierarchy={root} paddingOuter={3} paddingInner={2} paddingTop={0}>
								{#snippet children({ nodes })}
									<!-- In drawing order, back to front; unkeyed, so each row takes its new node as the view turns. -->
									<!-- eslint-disable-next-line svelte/require-each-key -- see above -->
									{#each nodes as node}
										{@const placed = node as Placed}
										{#if placed.depth > 0}
											{@const top = context.zScale(placed.depth + 1)}
											{@const picked = focus === placed.data.id}
											<Rect
												x={placed.x0}
												y={placed.y0}
												width={placed.x1 - placed.x0}
												height={placed.y1 - placed.y0}
												z={[context.zScale(placed.depth), top]}
												fill={fill(placed)}
												fillOpacity={focus && !picked && placed.depth === 1 ? 0.45 : 1}
												class="transition-[fill-opacity] duration-200 {picked
													? 'stroke-foreground'
													: 'stroke-black/25'} {placed.data.slug ? 'cursor-pointer' : ''}"
												strokeWidth={picked ? 1.5 : 0.5}
												onpointerenter={() => (focus = placed.data.id)}
												onpointermove={(e: PointerEvent) => context.tooltip.show(e, placed)}
												onpointerleave={() => {
													focus = null;
													context.tooltip.hide();
												}}
												onclick={() => placed.data.slug && goto(page(placed.data.slug))}
											/>
											{#if !placed.children}
												{@const text = label(placed)}
												{#if text}
													<!-- Lying on the block's top, so nearer blocks drawn later cover it. -->
													<Text
														x={(placed.x0 + placed.x1) / 2}
														y={(placed.y0 + placed.y1) / 2}
														z={top}
														value={placed.data.name}
														rotate={readable(text.vertical ? 90 : 0, context.isometricMatrix)}
														fontSize={text.size}
														textAnchor="middle"
														verticalAnchor="middle"
														class="pointer-events-none fill-black/70 font-semibold"
													/>
												{/if}
											{/if}
										{/if}
									{/each}
								{/snippet}
							</Treemap>
						</Svg>
						<Tooltip.Root variant="none" {context}>
							{#snippet children({ data }: { data: Placed })}
								<div
									class="grid min-w-36 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
								>
									<div class="font-medium">
										{data
											.ancestors()
											.reverse()
											.slice(1)
											.map((n) => n.data.name)
											.join(' → ')}
									</div>
									<div class="flex justify-between gap-4">
										<span class="text-muted-foreground">
											{data.depth === 1 ? 'Given' : 'Its share'}
										</span>
										<span class="font-mono font-medium tabular-nums">
											{money.format(data.value ?? 0)}
										</span>
									</div>
								</div>
							{/snippet}
						</Tooltip.Root>
					{/snippet}
				</ChartRoot>
			{/snippet}
		</LazyChart>
	</div>
</div>
