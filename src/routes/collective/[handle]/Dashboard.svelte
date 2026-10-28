<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import {
		CalendarClock,
		ExternalLink,
		ShieldCheck,
		TrendingDown,
		TrendingUp
	} from '@lucide/svelte';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import { monthLabel, moneyFormat, runwayLength } from '#lib/chart-format.js';
	import ExpenseCategories from './ExpenseCategories.svelte';
	import * as details from './stat-details';
	import {
		accountsByMonth,
		change,
		forecast,
		forecastDates,
		monthsBetween,
		previousAverages,
		unpaidTotals,
		withRecurringIncome
	} from '#lib/financials.js';
	import CollectiveSearch from '#lib/components/CollectiveSearch.svelte';
	import IncomeSources from './IncomeSources.svelte';
	import FundView from './FundView.svelte';
	import BalanceForecast from './BalanceForecast.svelte';
	import MonthlyFlow from './MonthlyFlow.svelte';
	import PayeeChart from './PayeeChart.svelte';
	import { isFund } from '#lib/grants.js';
	import { rememberCollective } from '#lib/recent-collectives.js';
	import { rememberDashboardSearch, type Search } from '#lib/dashboard-search.svelte.js';
	import {
		getIncomeSources,
		type CollectiveStats,
		type IncomeSources as Income
	} from '#lib/collective-stats.remote.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import YourEarnings from './YourEarnings.svelte';

	// The stats arrive as a prop rather than from an `await` in this component. Values derived
	// after a top-level `await` stop caching once it resolves, so charts drawn later, as they
	// scroll into view, would recompute them on every read and lock up the page.
	let {
		data,
		me,
		income: cachedIncome
	}: {
		data: CollectiveStats;
		/** Your Open Collective slug, if connected. */
		me?: string;
		/** The contributions, if the server already had them. */
		income: Income | null;
	} = $props();

	// Fetched only when the server did not have them yet. Read without `await`. A Svelte bug: while
	// any boundary on the page waits on an `await`, values derived in components that mount in the
	// meantime are recomputed on every read, so charts mounted then (as you scroll) lock up the page.
	const incomeQuery = $derived(cachedIncome ? undefined : getIncomeSources(data.slug));
	const income = $derived(cachedIncome ?? incomeQuery?.current);

	// Any visit counts as recent, not only a pick from the search.
	$effect(() => {
		rememberCollective({ slug: data.slug, name: data.name, imageUrl: data.imageUrl });
	});

	const RANGES = { '1y': 12, '2y': 24, all: Infinity } as const;
	type Range = keyof typeof RANGES;

	const BASES = ['3', '6', '12'];
	/** Years ahead to forecast. Averages drift, so far-off years say little. */
	const HORIZONS = ['1', '2', '5'];

	/** A chart setting from the address, or `fallback` when it is missing or unknown. */
	const param = (name: string, allowed: string[], fallback: string) => {
		const value = page.url.searchParams.get(name);
		return value && allowed.includes(value) ? value : fallback;
	};

	/**
	 * The address a setting was last sent to, until it arrives. `page.url` only changes once the
	 * navigation is done, so a second setting picked before then would otherwise drop the first.
	 */
	let pendingSearch: Search | undefined;

	/** Keeps a chart setting in the address, so it survives a reload and can be shared. */
	function setParam({ name, value, fallback }: { name: string; value: string; fallback: string }) {
		const params = new SvelteURLSearchParams(pendingSearch ?? page.url.search);
		if (value === fallback) params.delete(name);
		else params.set(name, value);
		const search: Search = params.size ? `?${params}` : '';
		pendingSearch = search;
		rememberDashboardSearch(search);
		// Not shallow, which leaves `page.url` behind. The stats are not fetched again, and the page
		// keeps its scroll and focus.
		goto(resolve(`/collective/[handle]${search}`, { handle: data.slug }), {
			replace: true,
			reset: false
		}).finally(() => {
			// Only the latest, as an earlier one settles once a later one takes over.
			if (pendingSearch === search) pendingSearch = undefined;
		});
	}

	// Settings that arrived in the address, from a reload or a shared link, are the latest too.
	onMount(() => rememberDashboardSearch(page.url.search));

	/**
	 * The ranges that show something different. Any as long as the history shows the same months as
	 * all time, so a new collective has the rest disabled.
	 */
	const ranges = $derived(
		(Object.keys(RANGES) as Range[]).filter(
			(range) => range === 'all' || RANGES[range] < data.months.length
		)
	);
	const chosenRange = $derived(param('show', Object.keys(RANGES), '2y') as Range);
	/** All time when the range picked is as long as the history, which is what it shows anyway. */
	const range = $derived(ranges.includes(chosenRange) ? chosenRange : 'all');
	const basis = $derived(param('average', BASES, '6'));
	const horizon = $derived(param('forecast', HORIZONS, '2'));

	const now = $derived(new Date(data.fetchedAt));
	/** The name split before its last word, which keeps the link icon beside it. */
	const nameStart = $derived(data.name.slice(0, data.name.lastIndexOf(' ') + 1));
	const nameEnd = $derived(data.name.slice(nameStart.length));
	/** The averages and forecast need at least one month that is over. */
	const tooNew = $derived(data.months.every((m) => m.partial));
	const balance = $derived(data.months.at(-1)?.balance ?? 0);
	/** A collective that passes its money on to others, which a forecast of its spending would misread. */
	const fund = $derived(isFund({ grants: data.grants, months: data.months }));
	/**
	 * A fund with one backer that gave nearly everything, which its own view already names, so a
	 * card with a single bar would only repeat it.
	 */
	const soleBacker = $derived.by(() => {
		if (!fund || !income) return false;
		const total = income.backers.all.reduce((sum, backer) => sum + backer.amount, 0);
		// The biggest single backer, not the others together or a platform passing on many people's gifts.
		const top = income.backers.all.find((backer) => backer.slug && !backer.channel)?.amount ?? 0;
		return total > 0 && top / total >= 0.9;
	});

	const unpaid = $derived(unpaidTotals(data.unpaid));
	const committed = $derived(unpaid.committed);
	const awaitingApproval = $derived(unpaid.awaiting);
	const available = $derived(balance - committed);

	/**
	 * The months the averages and forecast are taken from. Once the contributions are in, income
	 * counts recurring contributions alone: one-off gifts are lumpy, so one big gift would otherwise
	 * lift the averages and stretch the runway as if it came every month.
	 */
	const basisMonths = $derived(
		income
			? withRecurringIncome({ months: data.months, contributions: income.months })
			: data.months
	);

	const horizonMonths = $derived(Number(horizon) * 12);
	/** Every month forecast, even after the money runs out, so the other averages still show. */
	const forecastSpan = $derived(forecastDates({ now, horizon: horizonMonths }));
	const result = $derived(
		forecast({
			months: basisMonths,
			basis: Number(basis) || 6,
			now,
			start: available,
			horizon: horizonMonths
		})
	);
	/** The forecast with `net` a month in place of the average. */
	const forecastWith = (net: number) =>
		forecast({
			months: basisMonths,
			basis: Number(basis) || 6,
			now,
			start: available,
			horizon: horizonMonths,
			net
		});
	const shown = $derived(data.months.slice(-Math.min(RANGES[range] ?? 24, data.months.length)));
	const shownKeys = $derived(shown.map((m) => m.key));
	/** Everything that came in and went out in the months shown, this month included. */
	const shownIncome = $derived(shown.reduce((sum, m) => sum + m.income, 0));
	const allIncome = $derived(data.months.reduce((sum, m) => sum + m.income, 0));
	const shownExpenses = $derived(shown.reduce((sum, m) => sum + m.expenses, 0));

	const money = $derived(moneyFormat(data.currency));
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });

	const longMonthYear = new Intl.DateTimeFormat('en', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const partialKey = $derived(data.months.find((m) => m.partial)?.key);

	const previous = $derived(previousAverages({ months: basisMonths, basis: result.basis }));
	/** How each average moved against the same number of months before it. */
	const trends = $derived({
		income: previous && change(previous.avgIncome, result.avgIncome),
		expenses: previous && change(previous.avgExpenses, result.avgExpenses),
		net: previous && change(previous.avgIncome - previous.avgExpenses, result.avgNet)
	});

	/** The rows come from every month shown, so picking some months never reorders them. */
	const payees = $derived(accountsByMonth({ rows: data.payouts, months: shownKeys, limit: 7 }));

	const runwayMonths = $derived(result.zeroDate ? monthsBetween(now, result.zeroDate) : null);
	/** Under a year of money left is worth a warning; years of it is a balance spent as planned. */
	const runningLow = $derived(runwayMonths !== null && runwayMonths < 12);

	/** Changes smaller than this are noise, so their badges stay uncoloured. */
	const STEADY = 0.05;

	/**
	 * A relative change as a trend badge, or nothing without an earlier window to compare. Coloured
	 * by whether the change is good for the collective, so rising expenses read as bad news. Without
	 * `warn`, bad news stays uncoloured: spending more is no worry while years of money are left.
	 */
	function trendBadge({
		change,
		goodWhen,
		detail,
		warn = true
	}: {
		change: number | undefined;
		goodWhen: 'up' | 'down';
		detail: string;
		warn?: boolean;
	}): Stat['badge'] {
		if (change === undefined) return undefined;
		const good = goodWhen === 'up' ? change > 0 : change < 0;
		return {
			text: `${change > 0 ? '+' : ''}${percent.format(change)}`,
			icon: change >= 0 ? 'up' : 'down',
			tone:
				Math.abs(change) < STEADY
					? undefined
					: good
						? 'border-status-paid/30 text-status-paid hover:bg-status-paid/10'
						: warn
							? 'border-destructive/30 text-destructive hover:bg-destructive/10'
							: undefined,
			detail
		};
	}

	/** The two windows a trend compares, in words: "the last 6 months" and "the 6 months before". */
	const windows = $derived(
		result.basis === 12
			? { recent: 'the last year', earlier: 'the year before' }
			: {
					recent: `the last ${result.basis} months`,
					earlier: `the ${result.basis} months before`
				}
	);

	/** Spells out an average's trend badge in money, beside the percentage on the badge. */
	function averageDetail({
		what,
		now,
		before
	}: {
		what: string;
		now: number;
		before: number | undefined;
	}): string {
		if (before === undefined) return '';
		return details.averageDetail({
			what,
			before: money.format(before),
			change: money.format(Math.abs(now - before)),
			up: now >= before,
			windows
		});
	}

	const netDetail = $derived.by(() => {
		if (!previous || trends.net === undefined) return '';
		const before = previous.avgIncome - previous.avgExpenses;
		const signed = (amount: number) => ({
			amount: money.format(Math.abs(amount)),
			falling: amount < 0
		});
		return details.netDetail({
			now: signed(result.avgNet),
			before: signed(before),
			change: money.format(Math.abs(Math.abs(result.avgNet) - Math.abs(before))),
			swing: money.format(Math.abs(result.avgNet - before)),
			more: Math.abs(result.avgNet) > Math.abs(before),
			windows
		});
	});

	/** Spells out the one-off contributions trend in money, against the year before. */
	const oneOffDetail = $derived.by(() => {
		if (!income) return '';
		const { total } = income.oneOffs;
		const before = income.oneOffsBefore.total;
		return details.oneOffDetail({
			before: money.format(before),
			change: money.format(Math.abs(total - before)),
			up: total >= before
		});
	});

	/** How many one-off gifts came in, against the year before, which says more than the total when one gift is big. */
	const oneOffNote = $derived.by(() => {
		if (incomeQuery?.error && !income) return 'Failed to load contributions';
		if (!income) return 'Loading contributions';
		const { count } = income.oneOffs;
		const before = income.oneOffsBefore.count;
		const made = `${count} in the last 12 months`;
		if (before === count) return `${made}, as many as the year before`;
		return `${made}, ${count > before ? 'up' : 'down'} from ${before}`;
	});

	/** The line under the forecast's title: the months left, and what the forecast counts. */
	const forecastBasis = $derived.by(() => {
		if (income && result.avgNet >= 0) {
			return result.avgExpenses
				? 'Recurring contributors alone cover the expenses.'
				: 'With no recent expenses, every contribution adds to the balance.';
		}
		const basis = income ? 'current recurring contributors' : `the last ${result.basis} months`;
		return result.zeroDate
			? `About ${runwayLength(runwayMonths ?? 0)} left based on ${basis}.`
			: `Based on ${basis}.`;
	});

	/** Spells out the runway badge, so the months left say where they come from. */
	const runwayDetail = $derived.by(() => {
		if (!result.zeroDate) return '';
		return details.runwayDetail({
			drop: money.format(-result.avgNet),
			runsOut: longMonthYear.format(result.zeroDate)
		});
	});

	const stats = $derived<Stat[]>([
		{
			label: 'Available',
			value: money.format(available),
			note: committed
				? `After ${money.format(committed)} of approved, unpaid expenses`
				: 'No approved expenses waiting to be paid',
			badge:
				runwayMonths === null
					? undefined
					: {
							text: `${runwayLength(runwayMonths)} left`,
							icon: 'hourglass',
							tone: runningLow
								? 'border-destructive/30 text-destructive hover:bg-destructive/10'
								: undefined,
							detail: runwayDetail,
							aside: details.runwayAside(income?.oneOffs.count)
						}
		},
		{
			// A minus sign when the balance shrinks; growing is the plain case, so it has no plus.
			label: 'Monthly change',
			value: money.format(result.avgNet),
			// Red only while the money is running low; years of it make a shrinking balance a plan.
			tone: result.avgNet >= 0 ? 'text-status-paid' : runningLow ? 'text-destructive' : undefined,
			// With nothing spent, a share of expenses says nothing, so it says that instead.
			note: result.avgExpenses
				? `${income ? 'Average recurring contributions cover' : 'Average contributions cover'} ${percent.format(result.avgIncome / result.avgExpenses)} of expenses`
				: `No expenses over the last ${result.basis} months`,
			badge: trendBadge({
				change: trends.net,
				goodWhen: 'up',
				detail: netDetail,
				warn: runningLow
			})
		},
		{
			label: income ? 'Recurring contributions' : 'Contributions',
			value: money.format(result.avgIncome),
			note: `Average over the last ${result.basis} months`,
			badge: trendBadge({
				change: trends.income,
				goodWhen: 'up',
				detail: averageDetail({
					what: income ? 'recurring contributions' : 'contributions',
					now: result.avgIncome,
					before: previous?.avgIncome
				})
			})
		},
		{
			label: 'One-off contributions',
			value: income ? money.format(income.oneOffs.total) : '–',
			note: oneOffNote,
			badge: income
				? trendBadge({
						change: change(income.oneOffsBefore.total, income.oneOffs.total),
						goodWhen: 'up',
						detail: oneOffDetail
					})
				: undefined
		},
		{
			label: 'Average expenses',
			value: money.format(result.avgExpenses),
			note: awaitingApproval
				? `${money.format(awaitingApproval)} more awaits approval`
				: `Average over the last ${result.basis} months`,
			badge: trendBadge({
				change: trends.expenses,
				goodWhen: 'down',
				detail: averageDetail({
					what: 'expenses',
					now: result.avgExpenses,
					before: previous?.avgExpenses
				}),
				warn: runningLow
			})
		}
	]);
</script>

<svelte:head>
	<title>{data.name} · Open Work</title>
	<meta property="og:title" content="{data.name} · Open Work" />
	<meta
		name="description"
		content="{data.name} on Open Collective: its balance, runway, contributions, expenses and who funds it."
	/>
	<meta
		property="og:description"
		content="{data.name} on Open Collective: its balance, runway, contributions, expenses and who funds it."
	/>
</svelte:head>

<div class="flex flex-col gap-8">
	<!--
		The search comes first, as a tool for the whole page, so the collective's name has the whole
		line and leads straight into what is shown about it.
	-->
	<CollectiveSearch name="Find another collective" slug={data.slug} />

	<!-- The logo and name open the collective on Open Collective; the icon says it leaves the app. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
	<a
		href={`https://opencollective.com/${data.slug}`}
		target="_blank"
		rel="noreferrer"
		class="group flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 self-start rounded-xl"
	>
		{#if data.imageUrl}
			<!--
				Centred on the line, level with the middle of the capitals. Centred on the lowercase letters
				instead, it sat below a name that starts with a capital.
			-->
			<img
				src={data.imageUrl}
				alt=""
				class="size-16 shrink-0 rounded-xl border bg-card object-contain"
			/>
		{/if}
		<!--
			Beside the logo when the name fits there on one line, and under it when it does not, where a
			long name wraps rather than being cut off. The icon stays with the last word, so it is
			never left alone on a line. Sized and spaced in ems to keep its look as the heading scales,
			and lowered a little, since its drawing leaves a margin inside its box.
		-->
		<div class="flex min-w-0 flex-col gap-1">
			<h1 class="leading-tight text-balance decoration-1 underline-offset-6 group-hover:underline">
				{nameStart}<span class="whitespace-nowrap"
					>{nameEnd}<ExternalLink
						class="ml-[0.3em] inline-block size-[0.6em] align-[-0.05em] text-muted-foreground group-hover:text-foreground"
						aria-hidden="true"
					/></span
				>
			</h1>
			<span class="sr-only">on Open Collective (opens in a new tab)</span>
			{#if data.months[0]}
				<!-- The first month with contributions or expenses, which is where all time starts. -->
				<span class="text-sm text-muted-foreground">
					Since {monthLabel({ key: data.months[0].key })}
				</span>
			{/if}
		</div>
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->

	{#if data.months.length === 0}
		<Alert.Root>
			<Alert.Title>No transactions yet</Alert.Title>
			<Alert.Description>This collective has no contributions or expenses yet.</Alert.Description>
		</Alert.Root>
	{:else}
		{#if fund}
			<FundView {data} {income} {now} />
		{:else if tooNew}
			<Alert.Root>
				<CalendarClock />
				<Alert.Title>Too new to forecast</Alert.Title>
				<Alert.Description>
					<p>There's not enough data from this collective yet.</p>
				</Alert.Description>
			</Alert.Root>
		{:else}
			<Alert.Root
				variant={runningLow ? 'destructive' : 'default'}
				class={result.avgNet >= 0
					? 'border-status-paid/30 bg-status-paid/5 text-status-paid *:data-[slot=alert-description]:text-status-paid/80'
					: undefined}
			>
				<!-- A falling arrow only when it's a warning; a shrinking balance with years left is safe. -->
				{#if runningLow}
					<TrendingDown />
				{:else if result.avgNet < 0}
					<ShieldCheck />
				{:else}
					<TrendingUp />
				{/if}
				<Alert.Title>
					{#if result.zeroDate && runningLow}
						Balance may run out before {longMonthYear.format(result.zeroDate)}
					{:else if result.zeroDate}
						Funded until {longMonthYear.format(result.zeroDate)}
					{:else if result.avgNet < 0}
						Slowly dwindling
					{:else}
						Balance is growing
					{/if}
				</Alert.Title>
				<!-- The figures are in the strip below; this says only what they rest on. -->
				<Alert.Description>
					<p>{forecastBasis}</p>
				</Alert.Description>
			</Alert.Root>
		{/if}

		<!--
			One compact strip, so the balance chart is on screen when the page opens. Averages of no months
			say nothing, so only what is available shows until there are some.
		-->
		{#if !fund}
			<StatStrip stats={tooNew ? stats.slice(0, 1) : stats} />
		{/if}

		{#if !tooNew && !fund}
			<!--
				Each label above its buttons, which leaves the buttons the full width on phones. One row from
				tablets up, and labels beside their buttons on wide screens.
			-->
			<div class="flex flex-col gap-3 text-sm md:flex-row md:gap-x-6 lg:gap-x-8">
				<div class="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-3">
					<span id="range-label" class="text-muted-foreground">Range</span>
					<ToggleGroup.Root
						type="single"
						variant="outline"
						size="sm"
						aria-labelledby="range-label"
						bind:value={
							() => range, (value) => value && setParam({ name: 'show', value, fallback: '2y' })
						}
					>
						<ToggleGroup.Item value="1y" disabled={!ranges.includes('1y')}>1 year</ToggleGroup.Item>
						<ToggleGroup.Item value="2y" disabled={!ranges.includes('2y')}>
							2 years
						</ToggleGroup.Item>
						<ToggleGroup.Item value="all">All time</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
				<div class="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-3">
					<span id="basis-label" class="text-muted-foreground">Average over</span>
					<ToggleGroup.Root
						type="single"
						variant="outline"
						size="sm"
						aria-labelledby="basis-label"
						bind:value={
							() => basis, (value) => value && setParam({ name: 'average', value, fallback: '6' })
						}
					>
						<ToggleGroup.Item value="3">3 months</ToggleGroup.Item>
						<ToggleGroup.Item value="6">6 months</ToggleGroup.Item>
						<ToggleGroup.Item value="12">1 year</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
				<div class="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-3">
					<span id="horizon-label" class="text-muted-foreground">Forecast</span>
					<ToggleGroup.Root
						type="single"
						variant="outline"
						size="sm"
						aria-labelledby="horizon-label"
						bind:value={
							() => horizon,
							(value) => value && setParam({ name: 'forecast', value, fallback: '2' })
						}
					>
						<ToggleGroup.Item value="1">1 year</ToggleGroup.Item>
						<ToggleGroup.Item value="2">2 years</ToggleGroup.Item>
						<ToggleGroup.Item value="5">5 years</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
			</div>

			<BalanceForecast
				slug={data.slug}
				currency={data.currency}
				months={data.months}
				{shown}
				{now}
				{result}
				{forecastWith}
				{forecastSpan}
				{runningLow}
			/>
		{/if}

		<!--
			A fund passes on one or two big gifts, so a month's money in and out, its figures and its
			expense categories only repeat what its own view says, or are empty.
		-->
		{#if !fund}
			<MonthlyFlow
				slug={data.slug}
				currency={data.currency}
				months={data.months}
				{shown}
				{now}
				{me}
				payouts={data.payouts}
			/>
		{/if}

		<!-- Left out when it has neither card, so it adds no gap of its own. -->
		{#if me || payees.cells.length > 0}
			<div class="grid gap-4 {me ? 'lg:grid-cols-2' : ''}">
				{#if me}
					<YourEarnings
						slug={data.slug}
						currency={data.currency}
						months={shownKeys}
						{partialKey}
						{now}
						{me}
						payouts={data.payouts}
						unpaid={data.unpaid}
					/>
				{/if}
				{#if payees.cells.length > 0}
					<PayeeChart
						slug={data.slug}
						currency={data.currency}
						months={shownKeys}
						{partialKey}
						{range}
						{me}
						payouts={data.payouts}
						{payees}
						payeeImages={data.payeeImages}
					/>
				{/if}
			</div>
		{/if}

		{#if !fund}
			<ExpenseCategories
				slug={data.slug}
				currency={data.currency}
				months={shownKeys}
				{partialKey}
				payouts={data.payouts}
				spent={shownExpenses}
			/>
		{/if}

		{#if fund && allIncome <= 0}
			<!-- A company paying from its own budget has no backers to list, which its banner says. -->
		{:else if soleBacker}
			<!-- Named in the fund's own view. -->
		{:else if income}
			<!-- A fund's page has no range to pick, so its backers are all time, like its banner. -->
			<IncomeSources
				{income}
				received={fund ? allIncome : shownIncome}
				slug={data.slug}
				currency={data.currency}
				months={fund ? data.months.map((m) => m.key) : shownKeys}
				{partialKey}
				range={fund ? 'all' : range}
				{now}
				backersOnly={fund}
			/>
		{:else if incomeQuery?.error}
			<Alert.Root variant="destructive">
				<Alert.Title>Failed to load contributions</Alert.Title>
				<Alert.Description>
					<RetryableError error={incomeQuery.error} onretry={() => incomeQuery?.refresh()} />
				</Alert.Description>
			</Alert.Root>
		{:else}
			<div class="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading contributions">
				{#each [0, 1] as card (card)}
					<Card.Root>
						<Card.Header>
							<Skeleton class="h-5 w-56" />
							<Skeleton class="h-4 w-72 max-w-full" />
						</Card.Header>
						<Card.Content>
							<Skeleton class="h-64 w-full" />
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	{/if}
</div>
