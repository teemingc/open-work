<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { formatHours, formatMoney, toIsoDate } from '#lib/format.js';
	import {
		completeDeductions,
		daysOffBudget,
		monthOf,
		summarizeMonth,
		summarizeYear,
		yearTakeHome
	} from '#lib/worklog.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import MonthPicker from '#lib/components/MonthPicker.svelte';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import ClientBars from './ClientBars.svelte';
	import MonthCharts from './MonthCharts.svelte';
	import MonthStats from './MonthStats.svelte';
	import TakeHome from './TakeHome.svelte';
	import YearEmpty from './YearEmpty.svelte';
	import YearHours from './YearHours.svelte';
	import YearTakeHome from './YearTakeHome.svelte';

	let { store }: { store: WorkLogStore } = $props();
	const navId = $props.id();

	const today = toIsoDate(new Date());
	const thisYear = Number(today.slice(0, 4));
	/** A month asked for in the address, which also sets the year. */
	const requestedMonth = $derived.by(() => {
		const requested = page.url.searchParams.get('month');
		return requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : undefined;
	});
	const year = $derived.by(() => {
		if (requestedMonth) return Number(requestedMonth.slice(0, 4));
		const requested = page.url.searchParams.get('year');
		return requested && /^\d{4}$/.test(requested) ? Number(requested) : thisYear;
	});

	/**
	 * The years worth stepping to: those with time logged, and this one. The arrows skip empty
	 * years rather than lead to a page with nothing on it.
	 */
	const years = $derived(
		[
			...new Set([thisYear, ...store.data.entries.map((entry) => Number(entry.date.slice(0, 4)))])
		].sort((a, b) => a - b)
	);
	const previousYear = $derived(years.findLast((other) => other < year));
	const nextYear = $derived(years.find((other) => other > year));

	const thisMonth = monthOf(today);
	/**
	 * The month on screen: the one asked for, else this one in this year. A past year opens on its
	 * last month with time logged, as that is where the year ended.
	 */
	const month = $derived.by(() => {
		if (requestedMonth) return requestedMonth;
		if (year === thisYear) return thisMonth;
		const logged = store.data.entries
			.map((entry) => monthOf(entry.date))
			.filter((other) => other.startsWith(`${year}-`));
		return logged.length > 0 ? logged.reduce((a, b) => (a > b ? a : b)) : `${year}-12`;
	});
	const monthDate = $derived(new Date(`${month}-01T00:00:00`));
	const monthName = $derived(new Intl.DateTimeFormat('en', { month: 'long' }).format(monthDate));
	const monthLabel = $derived(
		new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(monthDate)
	);
	const monthSummary = $derived(summarizeMonth({ data: store.data, month, today }));
	/** Whether the money column has anything in it: take-home needs earnings, clients need two. */
	const hasMonthMoney = $derived(
		Object.keys(monthSummary.amounts).length > 0 || monthSummary.clients.length > 1
	);

	const summary = $derived(summarizeYear({ data: store.data, year, today }));
	const daysOff = $derived(daysOffBudget({ data: store.data, year, today }));
	const projected = $derived(
		summary.earnings &&
			yearTakeHome({
				gross: summary.earnings.projected,
				months: summary.earnings.months,
				deductions: completeDeductions(store.data.deductions)
			})
	);

	const stats = $derived.by(() => {
		const stats: Stat[] = [
			{
				label: year === thisYear ? 'Pace' : 'Against expected',
				value: `${summary.pace > 0 ? '+' : ''}${formatHours(summary.pace)} h`,
				tone: summary.pace >= 0 ? 'text-status-paid' : 'text-destructive',
				note: `${formatHours(summary.logged)} h logged of ${formatHours(summary.expectedSoFar)} h expected`,
				badge: {
					text: summary.pace >= 0 ? 'Ahead' : 'Behind',
					icon: summary.pace >= 0 ? 'up' : 'down'
				}
			}
		];
		if (year === thisYear) {
			stats.push({
				label: 'Needed a day',
				value: summary.remaining > 0 ? `${formatHours(summary.neededPerDay)} h` : '—',
				note:
					summary.remaining === 0
						? 'Year target reached'
						: `${formatHours(summary.remaining)} h over ${summary.workingDaysLeft} working ${summary.workingDaysLeft === 1 ? 'day' : 'days'}`
			});
		}
		if (summary.earnings && projected) {
			stats.push({
				label: year === thisYear ? 'Take-home, projected' : 'Take-home',
				value: formatMoney(projected.net, summary.earnings.currency),
				note: `Of ${formatMoney(summary.earnings.projected, summary.earnings.currency)} gross`
			});
		}
		if (daysOff) {
			stats.push({
				label: 'Days off left',
				value: formatHours(daysOff.left),
				tone: daysOff.left < 0 ? 'text-destructive' : undefined,
				note: `Of ${formatHours(daysOff.allowance)} for the year`
			});
		}
		return stats;
	});
</script>

<div class="flex flex-col gap-4 md:gap-6">
	<!-- The year controls sit at the right edge, like the work log's month controls. -->
	<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
		<h1>{year}</h1>
		<!-- Only when there is another year to go to. -->
		{#if previousYear !== undefined || nextYear !== undefined}
			<nav aria-labelledby={navId} class="flex shrink-0 items-center rounded-md border bg-card">
				<h2 id={navId} class="sr-only">Year</h2>
				<Button
					variant="ghost"
					size="icon"
					class="rounded-r-none"
					href={previousYear === undefined ? undefined : `${resolve('/work')}?year=${previousYear}`}
					disabled={previousYear === undefined}
				>
					<ChevronLeft /><span class="sr-only">Previous year</span>
				</Button>
				{#if year === thisYear}
					<Button variant="ghost" size="sm" class="rounded-none border-x" disabled>This year</Button
					>
				{:else}
					<Button variant="ghost" size="sm" class="rounded-none border-x" href={resolve('/work')}>
						This year
					</Button>
				{/if}
				<Button
					variant="ghost"
					size="icon"
					class="rounded-l-none"
					href={nextYear === undefined ? undefined : `${resolve('/work')}?year=${nextYear}`}
					disabled={nextYear === undefined}
				>
					<ChevronRight /><span class="sr-only">Next year</span>
				</Button>
			</nav>
		{/if}
	</div>

	<!--
		The month leads, as it is the one still to act on, and the year follows as the longer view. A
		month asked for keeps its section even in a year with nothing logged, so its picker stays in reach.
	-->
	{#if summary.logged > 0 || requestedMonth}
		<section aria-labelledby="{navId}-month" class="flex flex-col gap-4 md:gap-6">
			<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
				<h2 id="{navId}-month" class="font-display text-xl font-medium">{monthName}</h2>
				<div class="ml-auto">
					<MonthPicker path="/work" {month} current={thisMonth} label={monthLabel} />
				</div>
			</div>
			<MonthStats summary={monthSummary} data={store.data} current={month === thisMonth} />
			<!-- Charts take the wider column, like the year's hours below, with the money beside them. -->
			<div
				class={[
					'grid grid-cols-1 items-start gap-4 md:gap-6',
					hasMonthMoney && '@5xl/main:grid-cols-[3fr_2fr]'
				]}
			>
				<div class="flex flex-col gap-4 md:gap-6">
					<MonthCharts chart="pace" summary={monthSummary} clients={store.data.clients} {today} />
					<MonthCharts chart="daily" summary={monthSummary} clients={store.data.clients} {today} />
				</div>
				<div class="flex flex-col gap-4 md:gap-6">
					<ClientBars summary={monthSummary} clients={store.data.clients} />
					<TakeHome data={store.data} summary={monthSummary} />
				</div>
			</div>
		</section>
	{/if}

	{#if summary.logged > 0}
		<section aria-labelledby="{navId}-year" class="flex flex-col gap-4 md:gap-6">
			<h2 id="{navId}-year" class="font-display text-xl font-medium">
				{year === thisYear ? 'The year so far' : 'The year'}
			</h2>
			<StatStrip {stats} />
			<!-- Two columns only when there are earnings, as take-home shows nothing without them. -->
			<div
				class={[
					'grid grid-cols-1 items-start gap-4 md:gap-6',
					summary.earnings && '@4xl/main:grid-cols-[3fr_2fr]'
				]}
			>
				<YearHours data={store.data} {summary} {today} />
				<YearTakeHome data={store.data} {summary} />
			</div>
		</section>
	{:else}
		<YearEmpty data={store.data} {year} {today} />
	{/if}
</div>
