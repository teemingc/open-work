<script lang="ts">
	import { resolve } from '$app/paths';
	import { collectiveLogo } from '#lib/collective-suggestions.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import LazyChart from '#lib/components/LazyChart.svelte';
	import { ChevronRight } from '@lucide/svelte';
	import { compactFormat, monthLabel, moneyFormat, periodPhrase } from './chart-format';
	import { flowGraph, topAccounts, type AccountMonth, type FlowNode } from './financials';

	let {
		name,
		currency,
		months,
		partialKey,
		transfers,
		backers,
		income,
		spent,
		balance,
		fund
	}: {
		/** The collective's name. */
		name: string;
		currency: string;
		months: string[];
		partialKey?: string;
		/** Everything the collective passed on to other collectives, in every month. */
		transfers: AccountMonth[];
		/** Its top backers in these months, or null while the contributions load. */
		backers: { slug: string; name: string; amount: number }[] | null;
		/** All that came in over these months. */
		income: number;
		/** All that went out over these months, transfers included. */
		spent: number;
		balance: number;
		/** Whether the collective mostly passes its money on, like a fund that gives grants. */
		fund: boolean;
	} = $props();

	/** Recipients named in the chart; the rest share one node, so its labels keep their room. */
	const NAMED = 5;
	/** Recipients listed before the rest fold away. */
	const LISTED = 8;

	const money = $derived(moneyFormat(currency));
	const compact = $derived(compactFormat(currency));
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });

	const shown = $derived.by(() => {
		const keys = new Set(months);
		return transfers.filter((t) => keys.has(t.month));
	});
	const recipients = $derived(topAccounts({ rows: shown, limit: Infinity }));
	const given = $derived(recipients.reduce((sum, r) => sum + r.amount, 0));
	/** An account Open Collective no longer shows has no page to link to. */
	const listed = $derived(recipients.filter((r) => r.slug));
	/** A recipient's share of all that was given; a sliver reads "under 1%" rather than "0%". */
	const share = (amount: number) =>
		given && amount / given < 0.01 ? 'Under 1%' : percent.format(given ? amount / given : 0);
	/** The latest month each recipient was given money in. */
	const lastGiven = $derived(
		shown.reduce(
			(last, t) => (t.month > (last.get(t.slug) ?? '') ? last.set(t.slug, t.month) : last),
			new Map<string, string>()
		)
	);

	const graph = $derived(
		flowGraph({
			name,
			backers,
			income,
			spent,
			transfers: shown,
			limit: NAMED,
			keptName: fund ? 'Not yet given out' : 'Kept'
		})
	);
	/** Tall enough for the busier side's labels to sit one under another. */
	const height = $derived(
		Math.max(
			280,
			28 *
				Math.max(
					graph.nodes.filter((n) => n.side === 'source').length,
					graph.nodes.filter((n) => n.side === 'target').length
				)
		)
	);

	const COLORS: Record<FlowNode['kind'], string> = {
		backer: 'var(--color-chart-income)',
		collective: 'var(--color-chart-balance)',
		recipient: 'var(--color-chart-3)',
		expenses: 'var(--color-chart-expenses)',
		kept: 'var(--color-chart-4)',
		other: 'var(--color-chart-other)'
	};

	/** The node under the pointer, whose flows stand out while the rest fade. */
	let active = $state<string | null>(null);

	/** The chart's width, for how much room each side's labels have. */
	let width = $state(0);
	const LABEL_STYLE = { fontSize: '12px' } as CSSStyleDeclaration;

	/** A collective's page here, which keeps the chart settings you chose. */
	const page = (slug: string) =>
		resolve(`/collective/[handle]${dashboardSearch()}`, { handle: slug });
</script>

{#snippet row(recipient: { slug: string; name: string; amount: number })}
	{@const last = lastGiven.get(recipient.slug)}
	<li>
		<a
			href={page(recipient.slug)}
			class="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
		>
			<img
				src={collectiveLogo(recipient.slug)}
				alt=""
				class="size-7 shrink-0 rounded-md border bg-card object-contain"
				loading="lazy"
			/>
			<span class="min-w-0 flex-1">
				<span class="flex items-baseline justify-between gap-2">
					<span class="truncate font-medium">{recipient.name}</span>
					<span class="shrink-0 tabular-nums">{money.format(recipient.amount)}</span>
				</span>
				<!-- The share of all that was given, as a bar under the name. -->
				<span class="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
					<span
						class="block h-full rounded-full bg-chart-3"
						style:width="{given ? (recipient.amount / given) * 100 : 0}%"
					></span>
				</span>
				<span class="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
					<span>{share(recipient.amount)} of all given</span>
					{#if last}
						<span>Last in {monthLabel({ key: last, partialKey })}</span>
					{/if}
				</span>
			</span>
			<ChevronRight
				class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
				aria-hidden="true"
			/>
		</a>
	</li>
{/snippet}

<Card.Root class="animate-in duration-300 fade-in">
	<Card.Header>
		<Card.Title>Given to other collectives</Card.Title>
		<Card.Description>
			{money.format(given)} given to {recipients.length}
			{recipients.length === 1 ? 'collective' : 'collectives'}
			{periodPhrase(months)}{#if spent >= 1}, {percent.format(given / spent)} of all it spent{/if}.
			{#if fund && balance >= 1}
				The {money.format(balance)} it holds is waiting to be given out, so no runway is forecast.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-6 *:min-w-0 lg:grid-cols-[3fr_2fr]">
		<!-- Where the money came from and where it went, the width of each flow its amount. -->
		<figure>
			<div bind:clientWidth={width} style:height="{height}px">
				<LazyChart class="size-full">
					{#snippet children({ ChartRoot, Group, Link, Sankey, Svg, Text })}
						<ChartRoot data={graph} flatData={[]} padding={{ top: 20, bottom: 2 }}>
							<Svg>
								<Sankey
									nodeId={(d: FlowNode) => d.id}
									nodeAlign="justify"
									nodeWidth={8}
									nodePadding={8}
									// In the order given, biggest first, rather than moved about to shorten the flows.
									nodeSort={() => 0}
								>
									{#snippet children({ links, nodes })}
										{#each links as link (`${link.source.id} ${link.target.id}`)}
											{@const outer = link.source.side === 'source' ? link.source : link.target}
											{@const lit =
												active === null || active === outer.id || active === 'collective'}
											<Link
												sankey
												data={link}
												fill="none"
												stroke={COLORS[outer.kind as FlowNode['kind']]}
												strokeOpacity={lit ? 0.4 : 0.1}
												strokeWidth={Math.max(1, link.width ?? 0)}
												class="transition-[stroke-opacity]"
												onpointerenter={() => (active = outer.id)}
												onpointerleave={() => (active = null)}
											>
												<title
													>{link.source.name} → {link.target.name}: {money.format(
														link.value
													)}</title
												>
											</Link>
										{/each}
										{#each nodes as node (node.id)}
											{@const kind = node.kind as FlowNode['kind']}
											{@const side = node.side as FlowNode['side']}
											{@const room = side === 'collective' ? width : width / 2 - 24}
											<Group
												x={node.x0}
												y={node.y0}
												onpointerenter={() => (active = node.id)}
												onpointerleave={() => (active = null)}
											>
												<rect
													width={(node.x1 ?? 0) - (node.x0 ?? 0)}
													height={Math.max(1, (node.y1 ?? 0) - (node.y0 ?? 0))}
													fill={COLORS[kind]}
													rx="2"
												/>
												<!--
													Beside the node, towards the middle, outlined in the card's colour so a label
													stays readable over the flows behind it. The collective's sits above its node.
												-->
												<Text
													x={side === 'source' ? 14 : side === 'target' ? -6 : 4}
													y={side === 'collective' ? -8 : ((node.y1 ?? 0) - (node.y0 ?? 0)) / 2}
													value={side === 'collective'
														? node.name
														: `${node.name} ${compact.format(node.value ?? 0)}`}
													textAnchor={side === 'target'
														? 'end'
														: side === 'collective'
															? 'middle'
															: 'start'}
													verticalAnchor={side === 'collective' ? 'end' : 'middle'}
													truncate={{ maxWidth: room, style: LABEL_STYLE }}
													class="pointer-events-none fill-foreground stroke-card [stroke-width:3px] text-xs [paint-order:stroke] [stroke-linejoin:round] {side ===
													'collective'
														? 'font-medium'
														: ''}"
												/>
												<title>{node.name}: {money.format(node.value ?? 0)}</title>
											</Group>
										{/each}
									{/snippet}
								</Sankey>
							</Svg>
						</ChartRoot>
					{/snippet}
				</LazyChart>
			</div>
			<figcaption class="mt-2 text-xs text-muted-foreground">
				{#if backers}
					Backers on the left, then {name}, then where the money went.
				{:else}
					Loading backers. Where the money went is on the right.
				{/if}
			</figcaption>
		</figure>

		<!-- Each collective given to, linking to its own page here, to follow the money further. -->
		<div class="flex flex-col gap-1 text-sm">
			<ol class="flex flex-col gap-1" aria-label="Collectives given to most">
				{#each listed.slice(0, LISTED) as recipient (recipient.slug)}
					{@render row(recipient)}
				{/each}
			</ol>
			{#if listed.length > LISTED}
				<details>
					<summary class="cursor-pointer px-2 py-1.5 text-muted-foreground hover:text-foreground">
						{listed.length - LISTED} more
					</summary>
					<ol
						class="flex flex-col gap-1"
						start={LISTED + 1}
						aria-label="Other collectives given to"
					>
						{#each listed.slice(LISTED) as recipient (recipient.slug)}
							{@render row(recipient)}
						{/each}
					</ol>
				</details>
			{/if}
		</div>
	</Card.Content>
</Card.Root>
