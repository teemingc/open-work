<script lang="ts">
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import { formatHours, formatMoney } from '#lib/format.js';
	import { converted, monthPace, type MonthSummary, type WorkLogData } from '#lib/worklog.js';

	let {
		summary,
		data,
		today,
		current
	}: {
		summary: MonthSummary;
		data: WorkLogData;
		today: string;
		/** Whether the month is under way, so pace and "per day" mean something. */
		current: boolean;
	} = $props();

	/** Pace only means something once the month has some logged time to compare. */
	const started = $derived(summary.logged > 0);
	const inExchange = $derived(converted({ data, amounts: summary.amounts }));
	const total = $derived(
		Object.entries(summary.amounts)
			.map(([currency, amount]) => formatMoney(amount, currency))
			.join(' + ') || formatMoney(0, data.clients[0]?.currency ?? 'USD')
	);
	const percent = $derived(
		summary.expected > 0 ? Math.round((summary.logged / summary.expected) * 100) : 0
	);

	/** Hours short that days off cover are days off taken, so the pace is behind only past them. */
	const { pace, daysOff } = $derived(monthPace({ data, summary, today }));
	/** Days off stand in for a pace they cover in full. */
	const off = $derived(pace === 0 && daysOff > 0);

	const stats = $derived<Stat[]>([
		{
			label: 'Logged',
			value: `${formatHours(summary.logged)} h`,
			note: `Of ${formatHours(summary.expected)} h expected this month`,
			ring: {
				value: summary.expected > 0 ? summary.logged / summary.expected : 0,
				label: `${percent}%`
			}
		},
		started
			? {
					label: current ? 'Pace' : 'Balance',
					value: off
						? `${formatHours(daysOff)} ${daysOff === 1 ? 'day' : 'days'} off`
						: `${pace > 0 ? '+' : ''}${formatHours(pace)} h`,
					tone: off ? undefined : pace >= 0 ? 'text-status-paid' : 'text-destructive',
					note: `${formatHours(summary.expectedSoFar)} h expected ${current ? 'by today' : 'this month'}`,
					badge: {
						text: current
							? pace > 0
								? 'Ahead'
								: pace < 0
									? 'Behind'
									: 'On pace'
							: pace > 0
								? 'Over'
								: pace < 0
									? 'Under'
									: 'On target',
						icon: pace > 0 ? 'up' : pace < 0 ? 'down' : undefined
					}
				}
			: {
					// Nothing logged yet is not falling behind: no red number until there is work to compare.
					label: current ? 'Pace' : 'Balance',
					value: '—',
					tone: 'text-muted-foreground',
					note: 'Nothing logged yet this month'
				},
		{
			label: 'Still to log',
			value: `${formatHours(summary.remaining)} h`,
			note:
				summary.remaining === 0
					? 'Month target reached'
					: summary.workingDaysLeft > 0
						? `${summary.workingDaysLeft} working ${summary.workingDaysLeft === 1 ? 'day' : 'days'} left, counting today`
						: 'No working days left',
			badge:
				summary.remaining > 0 && summary.workingDaysLeft > 0
					? { text: `${formatHours(summary.neededPerDay)} h a day` }
					: undefined
		},
		{
			label: 'Earned',
			value: total,
			note:
				inExchange !== undefined && data.exchange
					? `${formatMoney(inExchange, data.exchange.to)} at ${data.exchange.rate} ${data.exchange.to} to the ${data.exchange.from}`
					: `Across ${summary.clients.length} ${summary.clients.length === 1 ? 'client' : 'clients'}`
		}
	]);
</script>

<StatStrip {stats} />
