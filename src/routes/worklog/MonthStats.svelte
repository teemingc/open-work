<script lang="ts">
	import ClientName from '#lib/components/ClientName.svelte';
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
	/** Whether any client has a share of the month's hours to show against. */
	const targets = $derived(summary.clients.some((total) => total.target !== undefined));
	const percent = $derived(
		summary.expected > 0 ? Math.round((summary.logged / summary.expected) * 100) : 0
	);

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
	<!--
		On phones each client is a short entry rather than a column of labels and values: what it
		earned beside its name, its hours against the target under them, then the rate.
	-->
	<ul class="divide-y rounded-lg border bg-card text-sm tabular-nums sm:hidden">
		{#each summary.clients as { client, hours, amount, rate, mixedRates, target } (client.id)}
			{const local = $derived(converted({ data, amounts: { [client.currency]: amount } }))}
			<li class="space-y-1.5 px-4 py-3">
				<div class="flex items-baseline justify-between gap-3">
					<span class="min-w-0 font-medium"><ClientName {client} /></span>
					<span class="shrink-0 font-medium">{formatMoney(amount, client.currency)}</span>
				</div>
				{#if target !== undefined}
					<span class="block h-1 overflow-hidden rounded-full bg-border">
						<span
							class={[
								'block h-full rounded-full',
								hours >= target ? 'bg-status-paid' : 'bg-primary/70'
							]}
							style:width="{target > 0 ? Math.min(100, (hours / target) * 100) : 100}%"
						></span>
					</span>
				{/if}
				<div class="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
					<span>
						<span class="text-foreground">{formatHours(hours)}</span>
						{#if target !== undefined}
							of {formatHours(target)} h ·
							{#if hours >= target}
								<span class="text-status-paid">reached</span>
							{:else}
								{formatHours(target - hours)} to log
							{/if}
						{:else}
							h
						{/if}
					</span>
					<span>
						{#if mixedRates}avg{/if}
						{formatMoney(rate, client.currency)}/h
						{#if data.exchange && local !== undefined}
							<span>· {formatMoney(local, data.exchange.to)}</span>
						{/if}
					</span>
				</div>
			</li>
		{/each}
	</ul>
	<div class="rounded-lg border bg-card max-sm:hidden">
		<table class="ledger text-sm">
			<caption class="sr-only">Hours and earnings by client</caption>
			<thead class="text-xs">
				<tr>
					<th class="px-3 py-2 font-medium">Client</th>
					<th class="px-3 py-2 text-right font-medium">
						{targets ? 'Hours of target' : 'Hours'}
					</th>
					{#if targets}
						<th class="px-3 py-2 text-right font-medium whitespace-nowrap">To log</th>
					{/if}
					<th class="px-3 py-2 text-right font-medium">Rate</th>
					<th class="px-3 py-2 text-right font-medium">Earned</th>
					{#if data.exchange}
						<th class="px-3 py-2 text-right font-medium">{data.exchange.to}</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each summary.clients as { client, hours, amount, rate, mixedRates, target } (client.id)}
					{const local = $derived(converted({ data, amounts: { [client.currency]: amount } }))}
					<tr>
						<td class="px-3 py-2"><ClientName {client} /></td>
						<!--
							The hours and the target they count towards share a cell, with a bar under them, so
							progress reads at a glance instead of as two numbers to compare.
						-->
						<td
							data-label={targets ? 'Hours of target' : 'Hours'}
							class="px-3 py-2 text-right whitespace-nowrap"
						>
							{formatHours(hours)}
							{#if target !== undefined}
								<span class="text-muted-foreground">/ {formatHours(target)}</span>
								<span class="mt-1 ml-auto block h-1 w-24 overflow-hidden rounded-full bg-border">
									<span
										class={[
											'block h-full rounded-full',
											hours >= target ? 'bg-status-paid' : 'bg-primary/70'
										]}
										style:width="{target > 0 ? Math.min(100, (hours / target) * 100) : 100}%"
									></span>
								</span>
							{/if}
						</td>
						{#if targets}
							<td data-label="To log" class="px-3 py-2 text-right whitespace-nowrap">
								{#if target === undefined}
									<span class="text-muted-foreground">—</span>
								{:else if hours >= target}
									<span class="text-status-paid">Reached</span>
								{:else}
									{formatHours(target - hours)}
								{/if}
							</td>
						{/if}
						<td data-label="Rate" class="px-3 py-2 text-right">
							{#if mixedRates}<span class="text-muted-foreground">avg</span>{/if}
							{formatMoney(rate, client.currency)}
						</td>
						<td data-label="Earned" class="px-3 py-2 text-right"
							>{formatMoney(amount, client.currency)}</td
						>
						{#if data.exchange}
							<td data-label={data.exchange.to} class="px-3 py-2 text-right">
								{local === undefined ? '—' : formatMoney(local, data.exchange.to)}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
