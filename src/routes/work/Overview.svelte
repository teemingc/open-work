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
		monthProjection,
		summarizeMonth,
		summarizeYear,
		yearTakeHome
	} from '#lib/worklog.js';
	import { keepReloadScroll } from '#lib/reload-scroll.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { onMount } from 'svelte';
	import MonthPicker from '#lib/components/MonthPicker.svelte';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import MonthCharts from './MonthCharts.svelte';
	import MonthStats from './MonthStats.svelte';
	import TakeHome from './TakeHome.svelte';
	import YearEmpty from './YearEmpty.svelte';
	import YearHours from './YearHours.svelte';
	import YearMonths from './YearMonths.svelte';
	import YearTakeHome from './YearTakeHome.svelte';

	let { store }: { store: WorkLogStore } = $props();
	const navId = $props.id();

	// The skeleton shown while the log is read is shorter than the page.
	onMount(() => {
		const scroll = keepReloadScroll();
		scroll.restore();
		return scroll.stop;
	});

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
	/** Whether the month has a take-home card to sit beside its pace. */
	const hasTakeHome = $derived(
		monthProjection({ data: store.data, summary: monthSummary }) !== undefined
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
				label: year === thisYear ? 'Pace' : 'Balance',
				value: `${summary.pace > 0 ? '+' : ''}${formatHours(summary.pace)} h`,
				tone: summary.pace >= 0 ? 'text-status-paid' : 'text-destructive',
				note: `${formatHours(summary.logged)} h logged of ${formatHours(summary.expectedSoFar)} h expected`,
				badge: {
					text:
						year === thisYear
							? summary.pace >= 0
								? 'Ahead'
								: 'Behind'
							: summary.pace >= 0
								? 'Over'
								: 'Under',
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

{#snippet yearNav()}
	<!-- Only when there is another year to go to. -->
	{#if previousYear !== undefined || nextYear !== undefined}
		<nav
			aria-labelledby={navId}
			class="ml-auto flex shrink-0 items-center rounded-md border bg-card"
		>
			<h3 id={navId} class="sr-only">Year</h3>
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
				<Button variant="ghost" size="sm" class="rounded-none border-x" disabled>This year</Button>
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
{/snippet}

<div class="flex flex-col gap-4 md:gap-6">
	<!--
		The month control sits at the right edge of the title's row and fills a row of its own where
		the two do not fit, as on the work log, and is the only place the month is named. The year's
		own controls go with the year's section below.
	-->
	<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
		<h1 class="grow-9999">Overview</h1>
		<div class="flex grow">
			<MonthPicker path="/work" {month} current={thisMonth} label={monthLabel} />
		</div>
	</div>

	<!--
		The month leads, as it is the one still to act on, and the year follows as the longer view. A
		month asked for keeps its section even in a year with nothing logged.
	-->
	{#if summary.logged > 0 || requestedMonth}
		<section aria-labelledby="{navId}-month" class="flex flex-col gap-4 pb-2 md:gap-6 md:pb-4">
			<h2 id="{navId}-month" class="sr-only">{monthName}</h2>
			<MonthStats summary={monthSummary} data={store.data} current={month === thisMonth} />
			<!--
				Pace and take-home share a row, so their cards end level. The hours each day take the full
				width, which their thirty bars need, with each client's share under the chart.
			-->
			<div
				class={['grid grid-cols-1 gap-4 md:gap-6', hasTakeHome && '@4xl/main:grid-cols-[3fr_2fr]']}
			>
				<MonthCharts chart="pace" summary={monthSummary} clients={store.data.clients} {today} />
				<TakeHome data={store.data} summary={monthSummary} />
			</div>
			<MonthCharts chart="daily" summary={monthSummary} clients={store.data.clients} {today} />
		</section>
	{/if}

	{#if summary.logged > 0}
		<!--
			A ledger's double rule closes the month before the year opens, with room either side, so the
			two sets of figures do not read as one.
		-->
		<section
			aria-labelledby="{navId}-year"
			class="flex flex-col gap-4 border-t-[3px] border-double border-(--rule) pt-6 md:gap-6 md:pt-10"
		>
			<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
				<h2 id="{navId}-year" class="font-display text-2xl font-medium text-(--heading)">
					{year === thisYear ? `${year} so far` : year}
				</h2>
				{@render yearNav()}
			</div>
			<StatStrip {stats} />
			<!--
				Like the month: hours and take-home share a row, and each month's figures take the full width
				below. Two columns only when there are earnings, as take-home shows nothing without them.
			-->
			<div
				class={[
					'grid grid-cols-1 gap-4 md:gap-6',
					summary.earnings && '@4xl/main:grid-cols-[3fr_2fr]'
				]}
			>
				<YearHours {summary} {today} />
				<YearTakeHome data={store.data} {summary} />
			</div>
			<YearMonths data={store.data} {summary} {today} />
		</section>
	{:else}
		<div class="flex flex-col gap-4 md:gap-6">
			{#if previousYear !== undefined || nextYear !== undefined}
				<div class="flex">{@render yearNav()}</div>
			{/if}
			<YearEmpty data={store.data} {year} {today} />
		</div>
	{/if}
</div>
