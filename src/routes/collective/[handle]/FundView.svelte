<script lang="ts">
	import * as Alert from '#lib/components/ui/alert/index.js';
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { HandCoins } from '@lucide/svelte';
	import { moneyFormat, runwayLength } from './chart-format';
	import { monthsBetween } from './financials';
	import { givingAhead, givingHistory, toRecipients, toRounds } from './grants';
	import GivingTimeline from './GivingTimeline.svelte';
	import { LinkedProject } from './linked-project.svelte';
	import LogoPack from './LogoPack.svelte';
	import ShareBars from './ShareBars.svelte';
	import type { CollectiveStats, IncomeSources } from './stats.remote';

	let {
		data,
		income,
		now
	}: {
		data: CollectiveStats;
		/** The contributions, once loaded, which name the backers the money comes from. */
		income: IncomeSources | undefined;
		now: Date;
	} = $props();

	const money = $derived(moneyFormat(data.currency));
	/** The project picked in the pack or the bars, so the other shows it too. */
	const linked = new LinkedProject();

	const dayMonthYear = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const balance = $derived(data.months.at(-1)?.balance ?? 0);
	const recipients = $derived(
		toRecipients({
			grants: data.grants,
			commitments: data.commitments,
			currency: data.currency,
			now
		})
	);
	const received = $derived(data.months.reduce((sum, month) => sum + month.income, 0));
	const granted = $derived(data.grants.reduce((sum, grant) => sum + grant.amount, 0));
	const monthly = $derived(data.commitments.reduce((sum, c) => sum + c.monthly, 0));
	const lastGrant = $derived(data.grants.at(-1)?.date);
	/** Full months since it last gave. */
	const sinceLast = $derived(lastGrant ? monthsBetween(new Date(lastGrant), now) : 0);
	/** It has not given for a while, which the totals alone would hide. */
	const quiet = $derived(sinceLast >= 2);

	/** The backer that gave most, named when it gave most of the money. */
	const mainSource = $derived.by(() => {
		const backers = income?.backers.all ?? [];
		const total = backers.reduce((sum, backer) => sum + backer.amount, 0);
		const [top] = backers;
		return top && top.amount >= total / 2 ? top : undefined;
	});

	/** Each figure in the colour of its line in the chart of giving over time, so the strip is its key. */
	const stats = $derived<Stat[]>([
		{
			label: 'Received',
			tone: 'text-chart-income',
			value: money.format(received),
			note: mainSource ? `Most of it from ${mainSource.name}` : 'From everyone who backs it'
		},
		{
			label: 'Given away',
			tone: 'text-chart-expenses',
			value: money.format(granted),
			note: `To ${recipients.length} project${recipients.length === 1 ? '' : 's'}`
		},
		{
			label: 'Balance',
			tone: 'text-chart-balance',
			value: money.format(balance),
			note: 'Yet to be passed on'
		},
		...(monthly > 0
			? [
					{
						label: 'Monthly gifts',
						tone: 'text-chart-expenses',
						value: money.format(monthly),
						note: `To ${data.commitments.length} project${data.commitments.length === 1 ? '' : 's'}, every month`
					}
				]
			: [])
	]);

	/** Those it gave to in the past year whose contributions are known, the most from this fund first. */
	const shares = $derived(
		recipients
			.filter((r): r is typeof r & { contributions: number; share: number } => r.share !== null)
			.sort((a, b) => b.share - a.share || b.total - a.total)
	);

	/** How far ahead the monthly gifts are drawn, however long the money would pay for them. */
	const AHEAD_LIMIT = 60;
	const history = $derived(givingHistory({ grants: data.grants, months: data.months, now }));
	const ahead = $derived(
		quiet
			? []
			: givingAhead({
					given: granted,
					received: granted + balance,
					monthly,
					now,
					limit: AHEAD_LIMIT
				})
	);
	const capped = $derived(ahead.length > AHEAD_LIMIT && monthly * (AHEAD_LIMIT + 1) <= balance);
</script>

<Alert.Root
	class="border-status-paid/30 bg-status-paid/5 text-status-paid *:data-[slot=alert-description]:text-status-paid/80"
>
	<HandCoins />
	<Alert.Title>Passes its funds on to other projects</Alert.Title>
	<Alert.Description>
		<p>
			It passes what it receives on to other projects on Open Collective{#if quiet && lastGrant},
				and last gave {runwayLength(sinceLast)} ago, on {dayMonthYear.format(
					new Date(lastGrant)
				)}{/if}.
		</p>
	</Alert.Description>
</Alert.Root>

<StatStrip {stats} />

<!--
	Each card as tall as its own chart, so opening the rest of the bars leaves no empty card beside
	them, and the pack stays in view below the sticky header while the list scrolls past.
-->
<div class="grid gap-4 lg:grid-cols-2 lg:items-start">
	<Card.Root class="lg:sticky lg:top-20">
		<Card.Header>
			<Card.Title>Who it funds</Card.Title>
			<Card.Description>Each project it funds, sized by the amount funded.</Card.Description>
		</Card.Header>
		<Card.Content>
			<LogoPack {recipients} {linked} slug={data.slug} currency={data.currency} />
		</Card.Content>
	</Card.Root>

	{#if shares.length}
		<Card.Root>
			<Card.Header>
				<Card.Title>How much it matters to them</Card.Title>
				<Card.Description>
					How much of each project's contributions in the past year came from this fund.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ShareBars recipients={shares} {linked} slug={data.slug} currency={data.currency} />
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<Card.Root>
	<Card.Header>
		<Card.Title>Giving over time</Card.Title>
		<Card.Description>
			{#if ahead.length}
				What it has given so far, and the monthly gifts it already has the money for.
			{:else}
				What it has received and given away so far.
			{/if}
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<GivingTimeline
			points={history}
			{ahead}
			{capped}
			rounds={toRounds(data.grants)}
			monthly={recipients.filter((r) => r.monthly > 0)}
			quietSince={quiet && lastGrant ? new Date(lastGrant) : undefined}
			slug={data.slug}
			currency={data.currency}
			{now}
		/>
	</Card.Content>
</Card.Root>
