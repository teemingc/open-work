<script lang="ts">
	import { TooltipLink } from '#lib/tooltip-link.svelte.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { cubicInOut } from 'svelte/easing';
	import { prefersReducedMotion, Tween } from 'svelte/motion';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { chartPadding, TICK_LENGTH, X_TICK_OCCLUSION, Y_TICK_LABEL } from '#lib/chart-padding.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { ChartConfig } from '#lib/components/ui/chart/chart-utils.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { scaleBand, scaleTime } from 'd3-scale';
	import type { TextProps } from 'layerchart';
	import {
		ArrowRight,
		CalendarClock,
		ExternalLink,
		TrendingDown,
		TrendingUp
	} from '@lucide/svelte';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import {
		bandTickLabel,
		bandTicks,
		compactFormat,
		monthLabel,
		moneyFormat,
		periodPhrase,
		runwayLength
	} from './chart-format';
	import ExpenseCategories from './ExpenseCategories.svelte';
	import * as details from './stat-details';
	import {
		change,
		forecast,
		forecastDates,
		monthEnd,
		monthsBetween,
		paidTo,
		previousAverages,
		accountsByMonth,
		byQuarter,
		quarterStart,
		transactionsUrl,
		withRecurringIncome
	} from './financials';
	import CollectiveSearch from '#lib/components/CollectiveSearch.svelte';
	import IncomeSources from './IncomeSources.svelte';
	import MoneyRow from './MoneyRow.svelte';
	import { rememberCollective } from '#lib/recent-collectives.js';
	import { rememberDashboardSearch, type Search } from '#lib/dashboard-search.svelte.js';
	import {
		getIncomeSources,
		type CollectiveStats,
		type IncomeSources as Income
	} from './stats.remote';
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

	/** Keeps a chart setting in the address, so it survives a reload and can be shared. */
	function setParam({ name, value, fallback }: { name: string; value: string; fallback: string }) {
		const params = new SvelteURLSearchParams(page.url.search);
		if (value === fallback) params.delete(name);
		else params.set(name, value);
		const search: Search = params.size ? `?${params}` : '';
		rememberDashboardSearch(search);
		// Not shallow, which leaves `page.url` behind. The stats are not fetched again, and the page
		// keeps its scroll and focus. The dashboard is also the home page, which has no handle.
		goto(
			page.params.handle
				? resolve(`/collective/[handle]${search}`, { handle: page.params.handle })
				: resolve(`/${search}`),
			{ replace: true, reset: false }
		);
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
	/** This month so far, which a collective too new to forecast has alone. */
	const thisMonth = $derived(data.months.find((m) => m.partial));
	const balance = $derived(data.months.at(-1)?.balance ?? 0);

	// Approved expenses will be paid soon, so they are taken out before forecasting.
	const committed = $derived(
		data.unpaid.filter((e) => e.approved).reduce((sum, e) => sum + e.amount, 0)
	);
	const awaitingApproval = $derived(
		data.unpaid.filter((e) => !e.approved).reduce((sum, e) => sum + e.amount, 0)
	);
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
	/**
	 * The change a month the chart draws, eased from one average to the next, so the forecast and
	 * everything drawn from it turn together rather than the line alone. Where the forecast sets the
	 * top of the axis, before or after, it changes at once: its line then ends in the top corner
	 * however steep, so easing would only slide the scale and the history under it.
	 */
	const easedNet = Tween.of(() => result.avgNet, {
		duration: (from, to) =>
			prefersReducedMotion.current ||
			[from, to].some(
				(net) => Math.max(...forecastWith(net).points.map((p) => p.balance)) > recordedTop
			)
				? 0
				: 300,
		easing: cubicInOut
	});
	/** `result` as the chart draws it, which differs only while a new average eases in. */
	const drawn = $derived(
		easedNet.current === result.avgNet ? result : forecastWith(easedNet.current)
	);
	const shown = $derived(data.months.slice(-Math.min(RANGES[range] ?? 24, data.months.length)));
	const shownKeys = $derived(shown.map((m) => m.key));
	/** The highest balance on record the chart shows: the months shown, and the year before them. */
	const recordedTop = $derived(
		Math.max(0, ...data.months.slice(-(shown.length + 12)).map((m) => Math.round(m.balance)))
	);
	/** Everything that came in and went out in the months shown, this month included. */
	const shownIncome = $derived(shown.reduce((sum, m) => sum + m.income, 0));
	const shownExpenses = $derived(shown.reduce((sum, m) => sum + m.expenses, 0));

	const money = $derived(moneyFormat(data.currency));
	const compact = $derived(compactFormat(data.currency));
	const percent = new Intl.NumberFormat('en-US', { style: 'percent' });
	const signed = (value: number) => (value > 0 ? '+' : '') + money.format(value);

	const monthYear = new Intl.DateTimeFormat('en', {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const longMonthYear = new Intl.DateTimeFormat('en', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const dayMonthYear = new Intl.DateTimeFormat('en', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const partialKey = $derived(data.months.find((m) => m.partial)?.key);
	const labelMonth = (key: string) => monthLabel({ key, partialKey });

	const history = $derived(
		shown.map((m) => ({ date: m.partial ? now : monthEnd(m.key), balance: Math.round(m.balance) }))
	);
	const projection = $derived(
		drawn.points.map((p) => ({ date: p.date, balance: Math.round(p.balance) }))
	);
	/** Each month's balance, recorded or forecast, by its "YYYY-MM" key. Recorded wins where both exist. */
	const balanceByMonth = $derived(
		new Map([
			...projection.map((p) => [p.date.toISOString().slice(0, 7), p.balance] as const),
			...data.months.map((m) => [m.key, Math.round(m.balance)] as const)
		])
	);
	/** The balance in the same month a year before `date`, if there is one. */
	const balanceYearBefore = (date: Date) => {
		const [year, month] = date.toISOString().slice(0, 7).split('-');
		return balanceByMonth.get(`${Number(year) - 1}-${month}`);
	};
	/**
	 * Balance and forecast against the balance a year before, the baseline that colours the chart
	 * green where the collective has more than it did and red where it has less.
	 */
	const trend = $derived(
		[...history, ...projection].map((p) => ({ ...p, yearBefore: balanceYearBefore(p.date) }))
	);
	/** The axis is sized from the series, which leave out the year before, so a richer year ran off the top. */
	const balanceMax = $derived(
		Math.max(0, ...trend.map((p) => Math.max(p.balance, p.yearBefore ?? 0)))
	);

	const previous = $derived(previousAverages({ months: basisMonths, basis: result.basis }));
	/** How each average moved against the same number of months before it. */
	const trends = $derived({
		income: previous && change(previous.avgIncome, result.avgIncome),
		expenses: previous && change(previous.avgExpenses, result.avgExpenses),
		net: previous && change(previous.avgIncome - previous.avgExpenses, result.avgNet)
	});

	const paidToMe = $derived(paidTo({ payouts: data.payouts, slug: me, months: data.months }));

	const monthly = $derived(
		shown.map((m) => ({
			month: m.key,
			income: Math.round(m.income),
			expenses: Math.round(m.expenses),
			you: Math.round(paidToMe.get(m.key) ?? 0)
		}))
	);

	const totals = $derived.by(() => {
		const complete = shown.filter((m) => !m.partial);
		const income = complete.reduce((sum, m) => sum + m.income, 0);
		const expenses = complete.reduce((sum, m) => sum + m.expenses, 0);
		const mine = complete.reduce((sum, m) => sum + (paidToMe.get(m.key) ?? 0), 0);
		return { months: complete.length, income, expenses, mine, net: income - expenses };
	});

	/** The payee chart's width, for sizing its dots. */
	let payeeWidth = $state(0);
	/**
	 * On phones, full names and totals left the dots so little room that they all looked the same
	 * size, so names are cut shorter and totals are rounded, like "$54K".
	 */
	const payeeNarrow = $derived(payeeWidth > 0 && payeeWidth < 400);
	/** How wide a payee's name may be beside the "Who was paid" chart. */
	const payeeLabelWidth = $derived(payeeNarrow ? 72 : 110);
	/** Room for a payee's total, like "$12,300", on the other side. */
	const payeeTotalWidth = $derived(payeeNarrow ? 40 : 60);
	const payeeTotalFormat = $derived(payeeNarrow ? compact : money);
	/** The width the payee chart's dots are drawn across, between the names and the totals. */
	const payeePlot = $derived(
		payeeWidth - (payeeLabelWidth + TICK_LENGTH + 6) - (payeeTotalWidth + TICK_LENGTH)
	);
	/** Narrower than this a month, as on phones, dots barely differ in size, so quarters are shown. */
	const MIN_MONTH_WIDTH = 12;
	const payeeQuarterly = $derived(
		payeeWidth > 0 && payeePlot / Math.max(1, shownKeys.length) < MIN_MONTH_WIDTH
	);
	/** The columns of the payee chart: the months shown, or the first month of each quarter. */
	const payeeKeys = $derived(
		payeeQuarterly ? [...new Set(shownKeys.map(quarterStart))] : shownKeys
	);
	/** The months shown that a column covers: one, or up to three for a quarter. */
	const payeeMonths = (key: string) =>
		payeeQuarterly ? shownKeys.filter((month) => quarterStart(month) === key) : [key];
	/**
	 * The biggest dot: under half a column's width, so dots in neighbouring columns never overlap and
	 * each is its own target, but no bigger than 11px however wide the chart.
	 */
	const payeeMaxRadius = $derived(
		Math.max(1.5, Math.min(11, (payeePlot / Math.max(1, payeeKeys.length)) * 0.45))
	);
	/** The axis labels' size, for measuring them. */
	const LABEL_STYLE = { fontSize: '12px' } as CSSStyleDeclaration;
	const payees = $derived(accountsByMonth({ rows: data.payouts, months: shownKeys, limit: 7 }));
	const payeeName = $derived(
		new Map(payees.accounts.map((account) => [account.slug, account.name]))
	);
	/** What each payee was paid over the months shown, for the column beside the chart. */
	const payeeTotals = $derived(
		payees.cells.reduce(
			(totals, cell) => totals.set(cell.slug, (totals.get(cell.slug) ?? 0) + cell.amount),
			new Map<string, number>()
		)
	);
	const payeeSeries = $derived(
		(['you', 'others'] as const).map((key) => ({
			key,
			label: payeeConfig[key].label,
			color: payeeConfig[key].color,
			data: (payeeQuarterly ? byQuarter(payees.cells) : payees.cells).filter(
				(cell) => (cell.slug === me) === (key === 'you')
			)
		}))
	);

	const runwayMonths = $derived(result.zeroDate ? monthsBetween(now, result.zeroDate) : null);

	/** When the money runs out within the years forecast, as the projection then ends there. */
	const runsOutDate = $derived(
		result.zeroDate && result.points.at(-1)?.date.getTime() === result.zeroDate.getTime()
			? result.zeroDate
			: null
	);
	/** Where the drawn forecast reaches nothing, which moves with it while a new average eases in. */
	const runsOutX = $derived(
		drawn.zeroDate && drawn.points.at(-1)?.date.getTime() === drawn.zeroDate.getTime()
			? drawn.zeroDate
			: null
	);
	/** How wide "Forecast" is drawn, measured once the web font is in, so its arrow sits just after. */
	let forecastWidth = $state(50);

	function measureForecast(text: SVGTextElement) {
		document.fonts.ready.then(() => (forecastWidth = text.getComputedTextLength()));
	}

	const balanceConfig = {
		balance: { label: 'Balance', color: 'var(--color-chart-balance)' },
		forecast: { label: 'Forecast', color: 'var(--color-chart-balance)' }
	} satisfies ChartConfig;

	const flowConfig = $derived({
		income: { label: 'Contributions', color: 'var(--color-chart-income)' },
		// When "Paid to you" sits on top of it, what shows of expenses is what went to others.
		expenses: {
			label: 'Expenses',
			color: me ? 'var(--color-chart-expenses-muted)' : 'var(--color-chart-expenses)'
		},
		you: { label: 'Paid to you', color: 'var(--color-chart-expenses)' }
	} satisfies ChartConfig);

	const flowPadding = chartPadding({ legend: true });
	/** The income chart's width, for sizing its bars. */
	let flowWidth = $state(0);
	/**
	 * Expenses sit inside the income bar, a fifth of a month's width in from each side. Worked out
	 * from the width rather than the chart's own scale, which depends on these series.
	 */
	const flowInset = $derived(
		scaleBand()
			.domain(shownKeys)
			.range([0, Math.max(0, flowWidth - flowPadding.left - flowPadding.right)])
			.padding(0.2)
			.bandwidth() / 5
	);

	/**
	 * Overlapped rather than stacked, so each month's income and expenses start from zero and compare
	 * by height. Paid to you, a part of expenses, overlaps them in turn, so it reads as their base.
	 */
	const flowSeries = $derived(
		(me ? (['income', 'expenses', 'you'] as const) : (['income', 'expenses'] as const)).map(
			(key) => ({
				key,
				label: flowConfig[key].label,
				color: flowConfig[key].color,
				props: key === 'income' ? undefined : { insets: { x: flowInset } }
			})
		)
	);

	// Matches the bars: others are muted only when they sit beside what was paid to you.
	const payeeConfig = $derived({
		you: { label: 'You', color: 'var(--color-chart-expenses)' },
		others: {
			label: 'Paid',
			color: me ? 'var(--color-chart-expenses-muted)' : 'var(--color-chart-expenses)'
		}
	} satisfies ChartConfig);

	/** Changes smaller than this are noise, so their badges stay uncoloured. */
	const STEADY = 0.05;

	/**
	 * A relative change as a trend badge, or nothing without an earlier window to compare. Coloured
	 * by whether the change is good for the collective, so rising expenses read as bad news.
	 */
	function trendBadge(
		change: number | undefined,
		goodWhen: 'up' | 'down',
		detail: string
	): Stat['badge'] {
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
						: 'border-destructive/30 text-destructive hover:bg-destructive/10',
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
		if (incomeQuery?.error && !income) return 'Could not load contributions';
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
				? 'Recurring backers alone cover the expenses.'
				: 'With no recent expenses, every contribution adds to the balance.';
		}
		const basis = income ? 'current recurring backers' : `the last ${result.basis} months`;
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
							tone: 'border-destructive/30 text-destructive hover:bg-destructive/10',
							detail: runwayDetail,
							aside: details.runwayAside(income?.oneOffs.count)
						}
		},
		{
			// A minus sign when the balance shrinks; growing is the plain case, so it has no plus.
			label: 'Monthly change',
			value: money.format(result.avgNet),
			tone: result.avgNet < 0 ? 'text-destructive' : 'text-status-paid',
			// With nothing spent, a share of expenses says nothing, so it says that instead.
			note: result.avgExpenses
				? `${income ? 'Average recurring contributions cover' : 'Average contributions cover'} ${percent.format(result.avgIncome / result.avgExpenses)} of expenses`
				: `No expenses over the last ${result.basis} months`,
			badge: trendBadge(trends.net, 'up', netDetail)
		},
		{
			label: income ? 'Recurring contributions' : 'Contributions',
			value: money.format(result.avgIncome),
			note: `Average over the last ${result.basis} months`,
			badge: trendBadge(
				trends.income,
				'up',
				averageDetail({
					what: income ? 'recurring contributions' : 'contributions',
					now: result.avgIncome,
					before: previous?.avgIncome
				})
			)
		},
		{
			label: 'One-off contributions',
			value: income ? money.format(income.oneOffs.total) : '–',
			note: oneOffNote,
			badge: income
				? trendBadge(change(income.oneOffsBefore.total, income.oneOffs.total), 'up', oneOffDetail)
				: undefined
		},
		{
			label: 'Average expenses',
			value: money.format(result.avgExpenses),
			note: awaitingApproval
				? `${money.format(awaitingApproval)} more awaits approval`
				: `Average over the last ${result.basis} months`,
			badge: trendBadge(
				trends.expenses,
				'down',
				averageDetail({
					what: 'expenses',
					now: result.avgExpenses,
					before: previous?.avgExpenses
				})
			)
		}
	]);

	const monthLink = new TooltipLink(({ month }: { month: string }) =>
		transactionsUrl({ slug: data.slug, month })
	);

	/** A point on the balance line links to that month's transactions; the forecast has none yet. */
	const balanceLink = new TooltipLink(({ date }: { date: Date }) =>
		date > now
			? undefined
			: transactionsUrl({ slug: data.slug, month: date.toISOString().slice(0, 7) })
	);

	/** The "others" row has no slug, so it links to every expense. */
	const payeeLink = new TooltipLink((cell: { slug: string; month: string }) => {
		const months = payeeMonths(cell.month);
		return transactionsUrl({
			slug: data.slug,
			between: { from: months[0], to: months.at(-1)! },
			account: cell.slug || undefined,
			kinds: ['EXPENSE']
		});
	});

	const shortMonth = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
	/** A payee chart column in words: "Oct 2026", or "Jul–Sep 2026" for a quarter. */
	function payeeColumnLabel(key: string): string {
		const months = payeeMonths(key);
		const last = labelMonth(months.at(-1)!);
		return months.length > 1 ? `${shortMonth.format(monthEnd(months[0]))}–${last}` : last;
	}
	/** A quarter on the axis, like "Q3 26". */
	const quarterTick = (key: string) => `Q${(Number(key.slice(5, 7)) + 2) / 3} ${key.slice(2, 4)}`;
	const payeeTicks = $derived(bandTicks(payeeKeys));

	const ticks = $derived(bandTicks(shownKeys));
	import LazyChart from '#lib/components/LazyChart.svelte';
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

{#snippet forecastLabel({ props }: { props: TextProps })}
	<g transform="translate({props.x} {props.y})" class="pointer-events-none">
		<text class="fill-muted-foreground text-xs font-medium" {@attach measureForecast}>Forecast</text
		>
		<ArrowRight x={forecastWidth + 3} y={-10} size={12} class="text-muted-foreground" />
	</g>
{/snippet}

<!-- On two lines, which keeps it inside the forecast range on a phone. -->
{#snippet runsOutLabel({ props }: { props: TextProps })}
	{@const date = runsOutDate ?? runsOutX}
	{#if date}
		<text
			transform="translate({props.x} {props.y})"
			text-anchor="end"
			class="pointer-events-none fill-destructive text-xs font-medium"
		>
			<tspan x="0" dy="0.9em">Runs out</tspan>
			<tspan x="0" dy="1.25em">{monthYear.format(date)}</tspan>
		</text>
	{/if}
{/snippet}

{#snippet moneyRow({
	value,
	name,
	item
}: {
	value: unknown;
	name: string;
	item: { color?: string };
})}
	{#if typeof value === 'number'}
		<MoneyRow {value} {name} color={item.color} {money} />
	{/if}
{/snippet}

<div class="flex animate-in flex-col gap-8 duration-300 fade-in">
	<div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
		<!-- The logo and name open the collective on Open Collective; the icon says it leaves the app. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
		<a
			href={`https://opencollective.com/${data.slug}`}
			target="_blank"
			rel="noreferrer"
			class="group flex min-w-0 items-center gap-4 rounded-xl"
		>
			{#if data.imageUrl}
				<!--
					Centred on the line, level with the middle of the capitals. Centred on the lowercase letters
					instead, it sat below a name that starts with a capital. A new image for each collective,
					so the last one's logo does not show while this one's loads.
				-->
				{#key data.imageUrl}
					<img
						src={data.imageUrl}
						alt=""
						class="size-16 shrink-0 rounded-xl border bg-card object-contain"
					/>
				{/key}
			{/if}
			<!--
				A long name wraps rather than being cut off. The icon stays with the last word, so it is
				never left alone on a line. Sized and spaced in ems to keep its look as the heading scales,
				and lowered a little, since its drawing leaves a margin inside its box.
			-->
			<div class="flex min-w-0 flex-col gap-1">
				<h1
					class="leading-tight text-balance decoration-1 underline-offset-6 group-hover:underline"
				>
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
		<!--
			On phones the search comes first, as a tool for the whole page, so the collective's name leads
			straight into what is shown about it. Beside the name on wider screens.
		-->
		<div class="order-first sm:order-none">
			<CollectiveSearch name="Find another collective" slug={data.slug} />
		</div>
	</div>

	{#if data.months.length === 0}
		<Alert.Root>
			<Alert.Title>No transactions yet</Alert.Title>
			<Alert.Description>This collective has no contributions or expenses yet.</Alert.Description>
		</Alert.Root>
	{:else}
		{#if tooNew}
			<Alert.Root>
				<CalendarClock />
				<Alert.Title>Too new to forecast</Alert.Title>
				<Alert.Description>
					<p>
						Open Collective has no complete month for this collective yet. The averages and forecast
						appear once {longMonthYear.format(now)} is over.
					</p>
				</Alert.Description>
			</Alert.Root>
		{:else}
			<Alert.Root
				variant={result.zeroDate ? 'destructive' : 'default'}
				class={result.avgNet >= 0
					? 'border-status-paid/30 bg-status-paid/5 text-status-paid *:data-[slot=alert-description]:text-status-paid/80'
					: undefined}
			>
				{#if result.avgNet < 0}
					<TrendingDown />
				{:else}
					<TrendingUp />
				{/if}
				<Alert.Title>
					{#if result.zeroDate}
						Balance may run out before {longMonthYear.format(result.zeroDate)}
					{:else if result.avgNet < 0}
						Shrinking, but no end in sight
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
		<StatStrip stats={tooNew ? stats.slice(0, 1) : stats} />

		{#if !tooNew}
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
					<span id="basis-label" class="text-muted-foreground">Average of last</span>
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

			<Card.Root>
				<Card.Header>
					<Card.Title>Balance and forecast</Card.Title>
					<Card.Description>
						Green when the balance is higher than a year earlier, red when lower.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<LazyChart class="h-80">
						{#snippet children({ Area, AreaChart, Chart, ClipPath })}
							<Chart.Container
								config={balanceConfig}
								class="aspect-auto h-80 w-full cursor-pointer"
							>
								<AreaChart
									padding={chartPadding()}
									onTooltipClick={balanceLink.click}
									x="date"
									y="balance"
									xScale={scaleTime()}
									xDomain={[history[0]?.date ?? now, forecastSpan.at(-1) ?? now]}
									yDomain={[0, balanceMax]}
									yNice
									seriesLayout="overlap"
									highlight={{
										lines: true,
										// Hovering a dot highlights its series and fades the other one, so moving along
										// the line where balance meets forecast made the areas flicker.
										points: { class: 'pointer-events-none' }
									}}
									series={[
										{
											key: 'balance',
											label: balanceConfig.balance.label,
											color: balanceConfig.balance.color,
											data: history
										},
										{
											key: 'forecast',
											label: balanceConfig.forecast.label,
											color: balanceConfig.forecast.color,
											data: projection
										}
									]}
									annotations={[
										{
											type: 'range',
											x: [now, forecastSpan.at(-1) ?? now],
											// Above the plot, like a column heading, so it never meets "Runs out" inside it.
											label: forecastLabel,
											labelPlacement: 'top-left',
											labelYOffset: -6,
											pattern: {
												size: 8,
												lines: {
													rotate: -45,
													color: 'var(--color-muted-foreground)',
													opacity: 0.3
												}
											}
										},
										{
											type: 'line',
											x: now,
											props: {
												line: { class: 'stroke-muted-foreground/60!', dashArray: [2, 3] }
											}
										},
										...(runsOutX
											? [
													{
														type: 'line' as const,
														x: runsOutX,
														label: runsOutLabel,
														labelPlacement: 'top-left' as const,
														labelXOffset: 6,
														labelYOffset: 8,
														props: {
															line: { class: 'stroke-destructive!', dashArray: [2, 3] }
														}
													},
													{
														type: 'point' as const,
														x: runsOutX,
														y: 0,
														r: 4,
														props: { circle: { class: 'fill-destructive stroke-card' } }
													}
												]
											: [])
									]}
									props={{
										xAxis: {
											tickLength: TICK_LENGTH,
											tickOcclusion: X_TICK_OCCLUSION,
											format: (d: Date) => monthYear.format(d),
											ticks: 6
										},
										yAxis: {
											tickLength: TICK_LENGTH,
											tickLabelProps: Y_TICK_LABEL,
											format: (v: number) => compact.format(v)
										},
										tooltip: { context: { locked: balanceLink.locked } }
									}}
								>
									{#snippet marks()}
										<!-- Between the balance and the year before: red where the year before is above the
							balance, green where it is below, split by clipping to either side of the balance. -->
										<ClipPath>
											{#snippet clip()}
												<Area data={trend} y0="balance" y1={() => balanceMax * 2 + 1} />
											{/snippet}
											<Area
												data={trend}
												y0="yearBefore"
												y1="balance"
												defined={(d: { yearBefore?: number }) => d.yearBefore !== undefined}
												fill="color-mix(in oklab, var(--color-destructive) 22%, transparent)"
											/>
										</ClipPath>
										<ClipPath>
											{#snippet clip()}
												<Area data={trend} y0={() => 0} y1="balance" />
											{/snippet}
											<Area
												data={trend}
												y0="yearBefore"
												y1="balance"
												defined={(d: { yearBefore?: number }) => d.yearBefore !== undefined}
												fill="color-mix(in oklab, var(--color-status-paid) 22%, transparent)"
											/>
										</ClipPath>
										<Area
											data={trend}
											y0="yearBefore"
											y1="yearBefore"
											defined={(d: { yearBefore?: number }) => d.yearBefore !== undefined}
											fill="none"
											line={{ class: 'stroke-muted-foreground', 'stroke-dasharray': '2 3' }}
										/>
										<Area seriesKey="balance" fill="none" line={{ strokeWidth: 2 }} />
										<!-- Solid like the balance: the hatched range already says it is a forecast. -->
										<Area seriesKey="forecast" fill="none" line={{ strokeWidth: 2 }} />
									{/snippet}
									{#snippet tooltip({ context })}
										{@const point = context.tooltip.data as { date: Date } | null}
										{@const yearBefore = point ? balanceYearBefore(point.date) : undefined}
										<Chart.Tooltip
											labelFormatter={(d: Date) => dayMonthYear.format(d)}
											href={balanceLink.href}
										>
											{#snippet formatter({ value, name, item, index, payload })}
												{@render moneyRow({ value, name, item })}
												<!-- Once, after the last series, where balance and forecast meet. -->
												{#if yearBefore !== undefined && index === payload.length - 1}
													<MoneyRow
														value={yearBefore}
														name="A year earlier"
														color="var(--color-muted-foreground)"
														{money}
													/>
												{/if}
											{/snippet}
										</Chart.Tooltip>
									{/snippet}
								</AreaChart>
							</Chart.Container>
						{/snippet}
					</LazyChart>
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>Expenses and contributions</Card.Title>
				<Card.Description>
					{#if tooNew && thisMonth}
						Contributions of {money.format(thisMonth.income)} and expenses of {money.format(
							thisMonth.expenses
						)} so far this month.
					{:else}
						Contributions of {money.format(totals.income)} and expenses of {money.format(
							totals.expenses
						)} over {totals.months} months{#if me}. {money.format(totals.mine)}
							({percent.format(totals.expenses ? totals.mine / totals.expenses : 0)}) of expenses
							went to you{/if}.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<LazyChart class="mb-3 h-64">
					{#snippet children({ BarChart, Chart, Legend, legendMotion })}
						<div bind:clientWidth={flowWidth}>
							<Chart.Container config={flowConfig} class="aspect-auto h-64 w-full cursor-pointer">
								<BarChart
									padding={flowPadding}
									data={monthly}
									x="month"
									xScale={scaleBand().padding(0.2)}
									seriesLayout="overlap"
									onTooltipClick={monthLink.click}
									series={flowSeries}
									props={{
										bars: { radius: 2, strokeWidth: 0, motion: legendMotion },
										xAxis: {
											tickLength: TICK_LENGTH,
											tickOcclusion: X_TICK_OCCLUSION,
											ticks,
											format: bandTickLabel
										},
										yAxis: {
											tickLength: TICK_LENGTH,
											tickLabelProps: Y_TICK_LABEL,
											format: (v: number) => compact.format(v)
										},
										tooltip: { context: { locked: monthLink.locked } }
									}}
								>
									{#snippet tooltip()}
										<Chart.Tooltip
											labelFormatter={labelMonth}
											formatter={moneyRow}
											href={monthLink.href}
										/>
									{/snippet}
									{#snippet legend({ context })}
										<Legend {context} placement="bottom" />
									{/snippet}
								</BarChart>
							</Chart.Container>
						</div>
					{/snippet}
				</LazyChart>
			</Card.Content>
		</Card.Root>

		<!--
			The charts above as figures, for screen readers and keyboards: each month opens its transactions.
			On phones the gain or loss, which is income less expenses, makes way for the rest, and the
			month and the contributions heading shorten, so the table fits without scrolling sideways. On
			wide screens the table stops short of the card's edge, so a month stays near its figures.
		-->
		<details class="rounded-xl border bg-card text-sm">
			<summary class="cursor-pointer px-4 py-3 font-medium">Monthly figures</summary>
			<div class="overflow-x-auto border-t">
				<table class="ledger">
					<caption class="sr-only">Contributions, expenses and balance by month</caption>
					<thead class="text-xs">
						<tr>
							<th class="py-2 pr-1.5 pl-3 sm:px-4">Month</th>
							<th class="px-1.5 py-2 text-right sm:px-4">
								<span class="sm:hidden">Income</span>
								<span class="hidden sm:inline">Contributions</span>
							</th>
							<th class="px-1.5 py-2 text-right sm:px-4">Expenses</th>
							<th class="hidden px-4 py-2 text-right sm:table-cell">Gained or lost</th>
							<th class="py-2 pr-3 pl-1.5 text-right sm:px-4">Balance</th>
						</tr>
					</thead>
					<tbody>
						{#each shown as month (month.key)}
							<tr>
								<th scope="row" class="py-2 pr-1.5 pl-3 font-normal whitespace-nowrap sm:px-4">
									<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
									<a
										href={transactionsUrl({ slug: data.slug, month: month.key })}
										target="_blank"
										rel="noreferrer"
										class="hover:underline"
									>
										<span class="sm:hidden">
											{bandTickLabel(month.key)}
											{#if month.key === partialKey}
												<span class="block text-xs text-muted-foreground">so far</span>
											{/if}
										</span>
										<span class="hidden sm:inline">{labelMonth(month.key)}</span>
										<span class="sr-only">(opens in a new tab)</span>
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								</th>
								<td class="px-1.5 py-2 text-right sm:px-4">{money.format(month.income)}</td>
								<td class="px-1.5 py-2 text-right sm:px-4">{money.format(month.expenses)}</td>
								<td class="hidden px-4 py-2 text-right sm:table-cell"
									>{signed(Math.round(month.net))}</td
								>
								<td class="py-2 pr-3 pl-1.5 text-right sm:px-4">{money.format(month.balance)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</details>

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
					<Card.Root>
						<Card.Header>
							<Card.Title>Who was paid</Card.Title>
							<Card.Description>
								Expenses paid out each {payeeQuarterly ? 'quarter' : 'month'}. The bigger the dot,
								the more was paid. The total amount paid out {periodPhrase(shownKeys)} is on the right.
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<div bind:clientWidth={payeeWidth}>
								<LazyChart class="h-72">
									{#snippet children({ Axis, Chart, Circle, ScatterChart })}
										<Chart.Container
											config={payeeConfig}
											class="aspect-auto h-72 w-full cursor-pointer"
										>
											<ScatterChart
												series={payeeSeries}
												onTooltipClick={payeeLink.click}
												x="month"
												xScale={scaleBand()}
												xDomain={payeeKeys}
												y="slug"
												yScale={scaleBand()}
												yDomain={payees.accounts.map((account) => account.slug)}
												r="amount"
												rRange={[Math.min(2, payeeMaxRadius), payeeMaxRadius]}
												padding={chartPadding({
													left: payeeLabelWidth + TICK_LENGTH,
													right: payeeTotalWidth + TICK_LENGTH
												})}
												props={{
													points: { strokeWidth: 0, fillOpacity: 0.85 },
													grid: { x: false, y: true, bandAlign: 'between' },
													xAxis: {
														tickLength: TICK_LENGTH,
														tickOcclusion: X_TICK_OCCLUSION,
														ticks: payeeTicks,
														format: payeeQuarterly ? quarterTick : bandTickLabel
													},
													yAxis: {
														tickLength: TICK_LENGTH,
														// Rows, not values: each label sits beside its row of dots. Cut to the room the
														// padding leaves, measured, since names of the same length differ in width.
														// Measured at the labels' own size; LayerChart would use the page's 16px.
														tickLabelProps: {
															verticalAnchor: 'middle',
															truncate: { maxWidth: payeeLabelWidth, style: LABEL_STYLE }
														},
														format: (slug: string) => payeeName.get(slug) ?? ''
													},
													tooltip: { context: { mode: 'band', locked: payeeLink.locked } }
												}}
											>
												<!--
										Rings the hovered dot. Replaces the built-in highlight, which drew its point at the
										start of the row, where it looked like another payment.
									-->
												<!-- Each payee's total at the end of their row, like a ledger's totals column. -->
												{#snippet aboveMarks()}
													<Axis
														placement="right"
														tickLength={TICK_LENGTH}
														rule={false}
														grid={false}
														format={(slug: string) =>
															payeeTotalFormat.format(payeeTotals.get(slug) ?? 0)}
														tickLabelProps={{
															verticalAnchor: 'middle',
															// Right-aligned in their column, so the figures line up by digit.
															textAnchor: 'end',
															dx: payeeTotalWidth,
															class: 'tabular-nums'
														}}
													/>
												{/snippet}
												{#snippet highlight({ context })}
													{@const cell = context.tooltip.data}
													{#if cell}
														<Circle
															cx={context.xGet(cell) + (context.xScale.bandwidth?.() ?? 0) / 2}
															cy={context.yGet(cell) + (context.yScale.bandwidth?.() ?? 0) / 2}
															r={context.rGet(cell) + 3}
															class="pointer-events-none fill-none stroke-primary"
															strokeWidth={1.5}
														/>
													{/if}
												{/snippet}
												{#snippet tooltip({ context })}
													{@const cell = context.tooltip.data as {
														name: string;
														month: string;
														amount: number;
													} | null}
													<Chart.Tooltip
														hideIndicator
														labelFormatter={() => (cell ? payeeColumnLabel(cell.month) : '')}
														href={payeeLink.href}
													>
														{#snippet formatter()}
															{#if cell}
																<MoneyRow value={cell.amount} name={cell.name} {money} />
															{/if}
														{/snippet}
													</Chart.Tooltip>
												{/snippet}
											</ScatterChart>
										</Chart.Container>
									{/snippet}
								</LazyChart>
							</div>
						</Card.Content>
					</Card.Root>
				{/if}
			</div>
		{/if}

		<ExpenseCategories
			slug={data.slug}
			currency={data.currency}
			months={shownKeys}
			{partialKey}
			payouts={data.payouts}
			spent={shownExpenses}
		/>

		{#if income}
			<IncomeSources
				{income}
				received={shownIncome}
				slug={data.slug}
				currency={data.currency}
				months={shownKeys}
				{partialKey}
				{range}
				{now}
			/>
		{:else if incomeQuery?.error}
			<Alert.Root variant="destructive">
				<Alert.Title>Could not load contributions</Alert.Title>
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
