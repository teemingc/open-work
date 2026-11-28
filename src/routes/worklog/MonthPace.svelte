<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { formatHours, formatMoney } from '#lib/format.js';
	import {
		daysOffBudget,
		homeAmount,
		monthPace,
		monthProjection,
		type MonthSummary,
		type WorkLogData
	} from '#lib/worklog.js';

	let {
		summary,
		data,
		today,
		current
	}: {
		summary: MonthSummary;
		data: WorkLogData;
		today: string;
		/** Whether the month is under way, so today and "a day" mean something. */
		current: boolean;
	} = $props();

	/** Hours short that days off cover are days off taken, so the pace is behind only past them. */
	const { pace, daysOff, neededPerDay } = $derived(monthPace({ data, summary, today }));
	const budget = $derived(daysOffBudget({ data, year: Number(summary.month.slice(0, 4)), today }));
	const day = $derived(summary.days.find((other) => other.date === today));

	/** The bar runs to the month's expected hours, or past them once more is logged. */
	const scale = $derived(Math.max(summary.expected, summary.logged, 1));

	const status = $derived.by(() => {
		// Nothing logged yet is not falling behind: no red until there is work to compare.
		if (summary.logged === 0) return { text: 'Nothing logged yet', tone: 'text-muted-foreground' };
		const hours = `${formatHours(Math.abs(pace))} h`;
		if (pace > 0)
			return { text: `${hours} ${current ? 'ahead' : 'over'}`, tone: 'text-status-paid' };
		if (pace < 0)
			return { text: `${hours} ${current ? 'behind' : 'under'}`, tone: 'text-destructive' };
		return { text: current ? 'On pace' : 'On target', tone: 'text-status-paid' };
	});

	const earned = $derived(homeAmount({ data, amounts: summary.amounts }));
	const earnedText = $derived(
		earned
			? formatMoney(earned.amount, earned.currency)
			: Object.entries(summary.amounts)
					.map(([currency, amount]) => formatMoney(amount, currency))
					.join(' + ')
	);
	const projection = $derived(current ? monthProjection({ data, summary, today }) : undefined);

	/**
	 * What a freelancer paces a month by, each a figure and what it is measured against: today's
	 * hours, the hours a day that finish the month, the days off taken beside those left, and pay.
	 */
	const figures = $derived(
		[
			current &&
				day && {
					label: 'Today',
					value: `${formatHours(day.logged)} h`,
					note: day.expected > 0 ? `of ${formatHours(day.expected)} h` : 'a day off'
				},
			current &&
				(summary.remaining === 0
					? { label: 'To finish', value: 'Done', note: 'month target reached' }
					: summary.workingDaysLeft > 0
						? {
								label: 'To finish',
								value: `${formatHours(neededPerDay)} h a day`,
								note: `over ${summary.workingDaysLeft} ${summary.workingDaysLeft === 1 ? 'day' : 'days'}`
							}
						: {
								label: 'To finish',
								value: `${formatHours(summary.remaining)} h`,
								note: 'no working days left'
							}),
			budget && {
				label: 'Days off',
				value: `${formatHours(daysOff)} taken`,
				note: `${formatHours(budget.left)} left this year`
			},
			earnedText && {
				label: 'Earned',
				value: earnedText,
				note:
					projection && projection.average > projection.earned
						? `${formatMoney(projection.average, projection.currency)} projected`
						: ''
			}
		].filter((figure) => !!figure)
	);
</script>

<!--
	The month at a glance, short enough to stay above the form on a folded phone: the hours logged
	along a bar with a mark where today expects them, then the few figures to pace the month by.
	Beside each other where the card is wide enough.
-->
<Card.Root class="@container/card gap-0 py-0">
	<div
		class="grid gap-x-8 gap-y-3 px-4 py-3 @3xl/card:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @3xl/card:items-center"
	>
		<div class="flex flex-col gap-2">
			<div class="flex flex-wrap items-baseline justify-between gap-x-3">
				<p class="text-sm text-muted-foreground">
					<span class="font-display text-2xl font-medium text-foreground tabular-nums">
						{formatHours(summary.logged)}
					</span>
					of {formatHours(summary.expected)} h
				</p>
				<p class={['text-sm font-medium tabular-nums', status.tone]}>{status.text}</p>
			</div>
			<div class="relative py-1">
				<Progress
					value={Math.min(summary.logged, scale)}
					max={scale}
					aria-label="Hours logged this month"
					class="h-2"
				/>
				{#if current && summary.expectedSoFar > 0}
					<span
						class="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
						style="left: {(summary.expectedSoFar / scale) * 100}%"
					>
						<span class="sr-only">{formatHours(summary.expectedSoFar)} h expected by today</span>
					</span>
				{/if}
			</div>
		</div>
		<dl
			class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums @md/card:grid-cols-(--columns)"
			style="--columns: repeat({figures.length}, minmax(0, 1fr))"
		>
			{#each figures as figure (figure.label)}
				<div class="min-w-0">
					<dt class="text-xs text-muted-foreground">{figure.label}</dt>
					<dd class="font-medium">{figure.value}</dd>
					{#if figure.note}<dd class="text-xs text-muted-foreground">{figure.note}</dd>{/if}
				</div>
			{/each}
		</dl>
	</div>
</Card.Root>
