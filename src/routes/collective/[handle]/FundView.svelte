<script lang="ts">
	import * as Alert from '#lib/components/ui/alert/index.js';
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { HandCoins } from '@lucide/svelte';
	import { moneyFormat, runwayLength } from './chart-format';
	import { monthsBetween } from './financials';
	import {
		givingAhead,
		givingHistory,
		givingYear,
		reducedContributions,
		toRecipients,
		toRounds
	} from './grants';
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
	const year = $derived(givingYear({ grants: data.grants, now }));
	const recipients = $derived(
		toRecipients({
			grants: data.grants,
			commitments: data.commitments,
			currency: data.currency,
			year
		})
	);
	const received = $derived(data.months.reduce((sum, month) => sum + month.income, 0));
	/**
	 * It gives from its own pocket rather than passing on what it receives, as a company paying by
	 * card does, so it has nothing received to show nor a balance left to pass on. Known by having
	 * given more than it received, as a few stray donations to such a company are not what it gives.
	 */
	const granted = $derived(data.grants.reduce((sum, grant) => sum + grant.amount, 0));
	const ownMoney = $derived(received < granted);
	const monthly = $derived(data.commitments.reduce((sum, c) => sum + c.monthly, 0));
	const lastGrant = $derived(data.grants.at(-1)?.date);
	/** Full months since it last gave. */
	const sinceLast = $derived(lastGrant ? monthsBetween(new Date(lastGrant), now) : 0);
	/** It has not given for a while, which the totals alone would hide. */
	const quiet = $derived(sinceLast >= 2);
	/** It still contributes, but far less than the year before, which the totals alone would also hide. */
	const reduced = $derived(quiet ? undefined : reducedContributions({ grants: data.grants, now }));

	/** The backer that gave most, named when it gave most of the money. */
	const mainSource = $derived.by(() => {
		const backers = income?.backers.all ?? [];
		const total = backers.reduce((sum, backer) => sum + backer.amount, 0);
		const [top] = backers;
		return top && top.amount >= total / 2 ? top : undefined;
	});

	/** What it contributed in its giving year, and to how many projects. */
	const yearGrants = $derived(
		data.grants.filter((grant) => grant.date >= year.from && grant.date <= year.to)
	);
	const yearTotal = $derived(yearGrants.reduce((sum, grant) => sum + grant.amount, 0));
	const yearProjects = $derived(new Set(yearGrants.map((grant) => grant.slug)).size);
	/** The project it contributed most to, all told. */
	const top = $derived(recipients.at(0));

	/** Each figure in the colour of its line in the chart of giving over time, so the strip is its key. */
	const stats = $derived<Stat[]>([
		...(ownMoney
			? []
			: [
					{
						label: 'Received',
						tone: 'text-chart-income',
						value: money.format(received),
						note: mainSource
							? `Most of it from ${mainSource.name}`
							: 'From everyone who contributes'
					}
				]),
		{
			label: 'Contributed',
			tone: 'text-chart-expenses',
			value: money.format(granted),
			note: `To ${recipients.length} project${recipients.length === 1 ? '' : 's'}`
		},
		// With nothing received nor left over, what it did with its own money fills the strip instead.
		...(ownMoney && yearTotal > 0
			? [
					{
						label: year.stopped ? 'In its last year' : 'In the past year',
						tone: 'text-chart-expenses',
						value: money.format(yearTotal),
						note: year.stopped
							? `Up to ${dayMonthYear.format(new Date(year.to))}`
							: `To ${yearProjects} project${yearProjects === 1 ? '' : 's'}`
					}
				]
			: []),
		...(ownMoney && top && recipients.length > 1
			? [
					{
						label: 'Largest total',
						tone: 'text-chart-expenses',
						value: money.format(top.total),
						note: `Contributed to ${top.name}`
					}
				]
			: []),
		...(ownMoney
			? []
			: [
					{
						label: 'Balance',
						tone: 'text-chart-balance',
						value: money.format(balance),
						note: 'Available for gifting'
					}
				]),
		...(monthly > 0
			? [
					{
						label: 'Monthly contributions',
						tone: 'text-chart-expenses',
						value: money.format(monthly),
						note: `To ${data.commitments.length} project${data.commitments.length === 1 ? '' : 's'}, every month`
					}
				]
			: [])
	]);

	/** Those it gave to in its giving year whose spending is known, the most of it covered first. */
	const shares = $derived(
		recipients
			.filter((r): r is typeof r & { spending: number; share: number } => r.share !== null)
			.sort((a, b) => b.share - a.share || b.total - a.total)
	);

	/** What it would add to them all in a year, once it has stopped, if it gave as it last did. */
	const wouldAdd = $derived(shares.reduce((sum, r) => sum + r.recent, 0));

	/** How far ahead the monthly gifts are drawn, however long the money would pay for them. */
	const AHEAD_LIMIT = 60;
	const history = $derived(givingHistory({ grants: data.grants, months: data.months, now }));
	const ahead = $derived(
		quiet || ownMoney
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

<!-- Yellow once it has paused or cut back its contributions, green while it keeps them up. -->
<Alert.Root
	variant={quiet || reduced ? 'warning' : 'default'}
	class={quiet || reduced
		? undefined
		: 'border-status-paid/30 bg-status-paid/5 text-status-paid *:data-[slot=alert-description]:text-status-paid/80'}
>
	<HandCoins />
	<Alert.Title>
		{#if !ownMoney}
			Contributes to other projects
		{:else if quiet}
			Paused contributions
		{:else if reduced}
			Reduced contributions
		{:else}
			Contributes to other projects
		{/if}
	</Alert.Title>
	<Alert.Description>
		<p>
			{#if ownMoney && quiet && lastGrant}
				Its last contribution on Open Collective was {runwayLength(sinceLast)} ago, on {dayMonthYear.format(
					new Date(lastGrant)
				)}.
			{:else}
				{#if ownMoney}
					It pays them from its own budget rather than passing on donations, so there is nothing
					received or held here, only what it has contributed.
				{:else}
					Almost everything it receives goes on to other projects on Open Collective.
				{/if}
				{#if quiet && lastGrant}
					Its last contribution was {runwayLength(sinceLast)} ago, on {dayMonthYear.format(
						new Date(lastGrant)
					)}.
				{:else if reduced}
					It contributed {money.format(reduced.recent)} in the past 12 months, after {money.format(
						reduced.previous
					)} in the 12 months before. Contributing at that level again would add {money.format(
						reduced.previous - reduced.recent
					)} a year to the projects it funds.
				{/if}
			{/if}
		</p>
	</Alert.Description>
</Alert.Root>

<StatStrip {stats} />

<div class="grid gap-4 lg:grid-cols-2">
	<Card.Root>
		<Card.Header>
			<Card.Title>Collectives it funds</Card.Title>
			<Card.Description
				>Each project it contributes to, sized by the contribution amount.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<LogoPack {recipients} {linked} slug={data.slug} currency={data.currency} />
		</Card.Content>
	</Card.Root>

	{#if shares.length}
		<Card.Root>
			<Card.Header>
				{#if year.stopped}
					<Card.Title>Contribution impact</Card.Title>
					<Card.Description>
						How long {money.format(wouldAdd)} a year, contributed as it did in the year to {dayMonthYear.format(
							new Date(year.to)
						)}, would keep each project going at what it spends a month.
					</Card.Description>
				{:else}
					<Card.Title>Contribution impact</Card.Title>
					<Card.Description>
						How long a year of this fund's contributions keeps each project going at what it spends
						a month.
					</Card.Description>
				{/if}
			</Card.Header>
			<Card.Content>
				<ShareBars
					recipients={shares}
					stopped={year.stopped}
					{linked}
					slug={data.slug}
					currency={data.currency}
				/>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<Card.Root>
	<Card.Header>
		<Card.Title>Contributions over time</Card.Title>
		<Card.Description>
			{#if ahead.length}
				What it has contributed so far, and how long it can keep up its monthly contributions.
			{:else if ownMoney}
				What it has contributed so far.
			{:else}
				What it has received and contributed so far.
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
