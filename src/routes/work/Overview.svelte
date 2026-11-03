<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { formatHours, formatMoney, toIsoDate } from '#lib/format.js';
	import { completeDeductions, daysOffBudget, summarizeYear, yearTakeHome } from '#lib/worklog.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import YearHours from './YearHours.svelte';
	import YearTakeHome from './YearTakeHome.svelte';

	let { store }: { store: WorkLogStore } = $props();
	const navId = $props.id();

	const today = toIsoDate(new Date());
	const thisYear = Number(today.slice(0, 4));
	const year = $derived.by(() => {
		const requested = page.url.searchParams.get('year');
		return requested && /^\d{4}$/.test(requested) ? Number(requested) : thisYear;
	});

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

<div class="space-y-6">
	<!-- The year controls sit at the right edge, like the work log's month controls. -->
	<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
		<h1>{year}</h1>
		<nav aria-labelledby={navId} class="flex shrink-0 items-center rounded-md border bg-card">
			<h2 id={navId} class="sr-only">Year</h2>
			<Button
				variant="ghost"
				size="icon"
				class="rounded-r-none"
				href="{resolve('/work')}?year={year - 1}"
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
				href="{resolve('/work')}?year={year + 1}"
			>
				<ChevronRight /><span class="sr-only">Next year</span>
			</Button>
		</nav>
	</div>

	{#if summary.logged > 0}
		<StatStrip {stats} />
		<div class="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
			<YearHours data={store.data} {summary} {today} />
			<YearTakeHome data={store.data} {summary} />
		</div>
	{:else}
		<p class="text-muted-foreground">
			Nothing logged in {year}.
			<a href={resolve('/worklog')} class="underline hover:text-foreground">Open the work log</a>
		</p>
	{/if}
</div>
