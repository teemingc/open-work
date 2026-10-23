<script lang="ts">
	import { resolve } from '$app/paths';
	import { collectiveLogo } from '#lib/collective-suggestions.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import { ChevronRight } from '@lucide/svelte';
	import { monthLabel, moneyFormat, periodPhrase } from './chart-format';
	import { flowGraph, topAccounts, type Transfer } from './financials';
	import DripFunnel from './DripFunnel.svelte';
	import FlowSankey from './FlowSankey.svelte';
	import GivingTreemap from './GivingTreemap.svelte';
	import GivingRounds from './GivingRounds.svelte';
	import { getDownstream } from './stats.remote';

	let {
		name,
		currency,
		months,
		partialKey,
		now,
		transfers,
		backers,
		received,
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
		now: Date;
		/** Everything the collective passed on to other collectives, in every month. */
		transfers: Transfer[];
		/** Its top backers in these months, or null while the contributions load. */
		backers: { slug: string; name: string; amount: number }[] | null;
		/** What contributions brought in each day, in every month, or null while they load. */
		received: { day: string; amount: number }[] | null;
		/** All that came in over these months. */
		income: number;
		/** All that went out over these months, transfers included. */
		spent: number;
		balance: number;
		/** Whether the collective mostly passes its money on, like a fund that gives grants. */
		fund: boolean;
	} = $props();

	/** Recipients named in the chart until you ask for every one; the rest share one node. */
	const NAMED = 5;
	/** Recipients listed before the rest fold away. */
	const LISTED = 8;

	const money = $derived(moneyFormat(currency));
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });
	const fullDate = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});

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

	/** Each day money went out: how much, and to how many. */
	const days = $derived(
		[
			...shown
				.reduce((days, t) => {
					const day = days.get(t.day) ?? { day: t.day, amount: 0, count: 0 };
					day.amount += t.amount;
					day.count++;
					return days.set(t.day, day);
				}, new Map<string, { day: string; amount: number; count: number }>())
				.values()
		].sort((a, b) => b.amount - a.amount)
	);

	/** Whether every recipient has its own node, rather than the smallest sharing one. */
	let othersOpen = $state(false);
	/** The node picked out across the charts and the list, like "out:vite". */
	let focus = $state<string | null>(null);

	/**
	 * What the biggest recipients received and gave on themselves, to follow the money a step
	 * further. Read without `await`, so the chart draws first and grows a column once it arrives.
	 */
	const followed = $derived(listed.slice(0, 6).map((r) => r.slug));
	const downstreamQuery = $derived(
		followed.length ? getDownstream({ slugs: followed, from: months[0] }) : undefined
	);
	const downstream = $derived.by(() => {
		const keys = new Set(months);
		return (downstreamQuery?.current ?? []).map((d) => ({
			...d,
			transfers: d.transfers.filter((t) => keys.has(t.month))
		}));
	});

	const graph = $derived(
		flowGraph({
			downstream,
			name,
			backers,
			income,
			spent,
			transfers: shown,
			limit: othersOpen ? Infinity : NAMED,
			keptName: fund ? 'Not yet given out' : 'Kept'
		})
	);

	/** Every recipient named, for the treemap, which has room for them all. */
	const everyone = $derived(
		flowGraph({
			downstream,
			name,
			backers,
			income,
			spent,
			transfers: shown,
			limit: Infinity
		})
	);
	/** What the recipients followed further gave on themselves, as the collective's share. */
	const onward = $derived(
		everyone.links
			.filter(
				(l) =>
					l.source.startsWith('out:') &&
					everyone.nodes.some(
						(n) => n.id === l.target && (n.kind === 'recipient' || n.kind === 'other')
					)
			)
			.reduce((sum, l) => sum + l.value, 0)
	);
	/** How far the money dripped down: what came in, what was given on, and what that gave on. */
	const stages = $derived([
		income >= given
			? { label: 'Came in', short: 'In', amount: income }
			: { label: 'Came in or held before', short: 'In', amount: given },
		{ label: 'Given to collectives', short: 'Given', amount: given },
		...(onward >= 1 ? [{ label: 'Given on by them', short: 'Given on', amount: onward }] : [])
	]);

	const receivedShown = $derived.by(() => {
		const keys = new Set(months);
		return received?.filter((d) => keys.has(d.day.slice(0, 7))) ?? null;
	});

	/** The recipients the chart follows further, by name. */
	const passedOn = $derived(
		graph.nodes
			.filter((n) => graph.links.some((l) => l.source === n.id && n.side === 'target'))
			.map((n) => n.name)
	);

	/** A collective's page here, which keeps the chart settings you chose. */
	const page = (slug: string) =>
		resolve(`/collective/[handle]${dashboardSearch()}`, { handle: slug });
</script>

{#snippet row(recipient: { slug: string; name: string; amount: number })}
	{@const last = lastGiven.get(recipient.slug)}
	<!-- Pointing at one picks it out in the charts too. -->
	<li
		onpointerenter={() => (focus = `out:${recipient.slug}`)}
		onpointerleave={() => (focus = null)}
		class={focus === `out:${recipient.slug}` ? 'rounded-md bg-accent' : ''}
	>
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
	<Card.Content class="grid gap-8 *:min-w-0 lg:grid-cols-[3fr_2fr]">
		<div class="lg:col-span-2">
			<DripFunnel {stages} {currency} />
		</div>

		<!-- Where the money came from and where it went, the width of each flow its amount. -->
		<figure class="flex flex-col gap-2">
			<FlowSankey
				{graph}
				{currency}
				onshowothers={() => {
					othersOpen = true;
					// The node pointed at is gone, so it never says the pointer left.
					focus = null;
				}}
				bind:focus
			/>
			<figcaption
				class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
			>
				<span>
					{#if backers}
						Backers on the left, then {name}, then where the money went{#if passedOn.length}, and
							where {passedOn.join(' and ')} passed it on{/if}.
					{:else}
						Loading backers. Where the money went is on the right.
					{/if}
				</span>
				{#if recipients.length > NAMED}
					<label class="flex items-center gap-1.5">
						<input
							type="checkbox"
							bind:checked={othersOpen}
							class="size-3.5 rounded border-input text-primary"
						/>
						Show every collective
					</label>
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

		<!-- Who got what, as blocks sized by amount, with what those followed further did with theirs on top. -->
		<figure class="flex flex-col gap-2 lg:col-span-2">
			<div>
				<h3 class="font-medium">Where it landed</h3>
				<p class="text-sm text-muted-foreground">
					Each block is a collective given to, sized by how much it got.
					{#if onward >= 1}
						On those that passed money on, a raised tier shows where their share of it went.
					{/if}
				</p>
			</div>
			<GivingTreemap graph={everyone} {currency} bind:focus />
		</figure>

		<!-- When the money went out: a dot for each collective on each day, so rounds of grants show as clusters. -->
		<figure class="flex flex-col gap-2 lg:col-span-2">
			<div>
				<h3 class="font-medium">When money came in and went out</h3>
				<p class="text-sm text-muted-foreground">
					Above the line, what contributions brought in each day; below it, each dot is what one
					collective was given on one day. The bigger, the more.
					{#if days[0]}
						Money went out on {days.length}
						{days.length === 1 ? 'day' : 'days'}{#if days.length > 1}, the most on {fullDate.format(
								new Date(`${days[0].day}T12:00:00Z`)
							)}: {money.format(days[0].amount)} to {days[0].count}
							{days[0].count === 1 ? 'collective' : 'collectives'}{/if}.
					{/if}
				</p>
			</div>
			<GivingRounds
				transfers={shown}
				received={receivedShown}
				{months}
				{now}
				{currency}
				bind:focus
			/>
		</figure>
	</Card.Content>
</Card.Root>
