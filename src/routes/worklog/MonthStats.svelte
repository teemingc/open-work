<script lang="ts">
	import StatStrip, { type Stat } from '#lib/components/StatStrip.svelte';
	import { formatHours, formatMoney } from '#lib/format.js';
	import { converted, type MonthSummary, type WorkLogData } from '#lib/worklog.js';

	let {
		summary,
		data,
		current
	}: {
		summary: MonthSummary;
		data: WorkLogData;
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

	const stats = $derived<Stat[]>([
		{
			label: 'Logged',
			value: `${formatHours(summary.logged)} h`,
			note: `Of ${formatHours(summary.expected)} h expected this month`,
			badge: { text: `${percent}%` }
		},
		started
			? {
					label: current ? 'Pace' : 'Against expected',
					value: `${summary.pace > 0 ? '+' : ''}${formatHours(summary.pace)} h`,
					tone: summary.pace >= 0 ? 'text-status-paid' : 'text-destructive',
					note: `${formatHours(summary.expectedSoFar)} h expected ${current ? 'by today' : 'this month'}`,
					badge: {
						text: summary.pace >= 0 ? 'Ahead' : 'Behind',
						icon: summary.pace >= 0 ? 'up' : 'down'
					}
				}
			: {
					// Nothing logged yet is not falling behind: no red number until there is work to compare.
					label: current ? 'Pace' : 'Against expected',
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

{#if summary.clients.length > 0}
	<div class="mt-4 overflow-x-auto rounded-lg border">
		<table class="w-full text-sm">
			<caption class="sr-only">Hours and earnings by client</caption>
			<thead class="bg-muted/50 text-left text-xs text-muted-foreground">
				<tr>
					<th class="px-3 py-2 font-medium">Client</th>
					<th class="px-3 py-2 text-right font-medium">Hours</th>
					<th class="px-3 py-2 text-right font-medium">Rate</th>
					<th class="px-3 py-2 text-right font-medium">Earned</th>
					{#if data.exchange}
						<th class="px-3 py-2 text-right font-medium">{data.exchange.to}</th>
					{/if}
				</tr>
			</thead>
			<tbody class="divide-y tabular-nums">
				{#each summary.clients as { client, hours, amount, rate, mixedRates } (client.id)}
					{@const local = converted({ data, amounts: { [client.currency]: amount } })}
					<tr>
						<td class="px-3 py-2">{client.name}</td>
						<td class="px-3 py-2 text-right">{formatHours(hours)}</td>
						<td class="px-3 py-2 text-right">
							{#if mixedRates}<span class="text-muted-foreground">avg</span>{/if}
							{formatMoney(rate, client.currency)}
						</td>
						<td class="px-3 py-2 text-right">{formatMoney(amount, client.currency)}</td>
						{#if data.exchange}
							<td class="px-3 py-2 text-right">
								{local === undefined ? '—' : formatMoney(local, data.exchange.to)}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
