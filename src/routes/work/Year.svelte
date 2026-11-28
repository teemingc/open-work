<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { formatHours, formatMoney, toIsoDate } from '#lib/format.js';
	import { completeDeductions, daysOffBudget, summarizeYear, yearTakeHome } from '#lib/worklog.js';
	import { keepReloadScroll } from '#lib/reload-scroll.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { onMount } from 'svelte';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
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
	const year = $derived.by(() => {
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

	/**
	 * The year's pace with the hours short that the days off allowance covers taken as days off, so
	 * it is behind only once the allowance runs out.
	 */
	const pace = $derived(
		summary.pace < 0 ? Math.min(0, summary.pace + (daysOff?.coveredHours ?? 0)) : summary.pace
	);
	/** Whole units, as a headline figure shares a phone's width with another. */
	function wholeMoney(amount: number, currency: string): string {
		return new Intl.NumberFormat('en', {
			style: 'currency',
			currency,
			maximumFractionDigits: 0
		}).format(amount);
	}

	/**
	 * Pace and days off lead, side by side: the days off taken are why a year short of its hours
	 * can still be on pace.
	 */
	const stats = $derived.by(() => {
		const hours = `${formatHours(Math.abs(pace))} h`;
		const stats: Stat[] = [
			{
				label: year === thisYear ? 'Pace' : 'Balance',
				value:
					pace > 0
						? `${hours} ${year === thisYear ? 'ahead' : 'over'}`
						: pace < 0
							? `${hours} ${year === thisYear ? 'behind' : 'under'}`
							: year === thisYear
								? 'On pace'
								: 'On target',
				tone: pace >= 0 ? 'text-status-paid' : 'text-destructive',
				note: `${formatHours(summary.logged)} of ${formatHours(summary.expectedSoFar)} h expected`
			}
		];
		if (daysOff) {
			const taken = Math.max(0, daysOff.short);
			stats.push({
				label: 'Days off',
				value: `${formatHours(daysOff.left)} left`,
				tone: daysOff.left < 0 ? 'text-destructive' : undefined,
				note:
					`${formatHours(taken)} taken of ${formatHours(daysOff.total)}` +
					(daysOff.holidays > 0
						? `, ${daysOff.holidaysLeft} of ${daysOff.holidays} public ${daysOff.holidays === 1 ? 'holiday' : 'holidays'} left`
						: '')
			});
		}
		if (year === thisYear) {
			stats.push({
				label: 'Needed a day',
				value: summary.remaining > 0 ? `${formatHours(summary.neededPerDay)} h` : 'Done',
				note:
					summary.remaining === 0
						? 'Year target reached'
						: `${formatHours(summary.remaining)} h over ${summary.workingDaysLeft} working ${summary.workingDaysLeft === 1 ? 'day' : 'days'}`
			});
		}
		if (summary.earnings && projected) {
			stats.push({
				label: year === thisYear ? 'Take-home, projected' : 'Take-home',
				value: wholeMoney(projected.net, summary.earnings.currency),
				note: `Of ${formatMoney(summary.earnings.projected, summary.earnings.currency)} gross`
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
	<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
		<h1>{year === thisYear ? `${year} so far` : year}</h1>
		{@render yearNav()}
	</div>

	{#if summary.logged > 0}
		<StatStrip {stats} compact />
		<!--
			Hours and take-home share a row, and each month's figures take the full width below. Two
			columns only when there are earnings, as take-home shows nothing without them.
		-->
		<div
			class={[
				'grid grid-cols-1 gap-4 md:gap-6',
				summary.earnings && '@4xl/main:grid-cols-[3fr_2fr]'
			]}
		>
			<YearHours {summary} clients={store.data.clients} />
			<YearTakeHome data={store.data} {summary} />
		</div>
		<YearMonths data={store.data} {summary} {today} />
	{:else}
		<YearEmpty data={store.data} {year} {today} />
	{/if}
</div>
