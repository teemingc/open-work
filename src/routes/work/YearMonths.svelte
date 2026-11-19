<script lang="ts">
	import { resolve } from '$app/paths';
	import ClientName from '#lib/components/ClientName.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import ClientBars from './ClientBars.svelte';
	import { formatHours, formatMoney, parseIsoDate } from '#lib/format.js';
	import {
		homeAmount,
		type ClientTotal,
		type WorkLogData,
		type YearSummary
	} from '#lib/worklog.js';

	let { data, summary, today }: { data: WorkLogData; summary: YearSummary; today: string } =
		$props();

	const shortMonth = new Intl.DateTimeFormat('en', { month: 'short' });
	const thisMonth = $derived(today.slice(0, 7));

	/** Every month of the year, so the wide table lines up with the chart's Jan to Dec. */
	const year = $derived(
		summary.months.map((month) => ({
			month: month.month,
			name: shortMonth.format(parseIsoDate(`${month.month}-01`)),
			ahead: month.month > thisMonth,
			logged: month.logged,
			difference: month.logged - month.expectedSoFar,
			earned: homeAmount({ data, amounts: month.amounts })
		}))
	);

	/** Each client's hours and earnings over the year, against the year's share of its target. */
	const totals = $derived.by(() => {
		const byClient: Record<string, ClientTotal> = {};
		for (const month of summary.months) {
			for (const total of month.clients) {
				const sum = (byClient[total.client.id] ??= {
					...total,
					hours: 0,
					amount: 0,
					target: undefined
				});
				sum.hours += total.hours;
				sum.amount += total.amount;
				if (total.target !== undefined) sum.target = (sum.target ?? 0) + total.target;
			}
		}
		return data.clients.flatMap((client) => byClient[client.id] ?? []);
	});

	/** A client's hours in a month, as "YYYY-MM". */
	function hoursFor(month: string, clientId: string): number {
		return (
			summary.months
				.find((summary) => summary.month === month)
				?.clients.find((total) => total.client.id === clientId)?.hours ?? 0
		);
	}

	/** Whole units, as twelve figures side by side have no room for cents. */
	function wholeMoney({ amount, currency }: { amount: number; currency: string }): string {
		return new Intl.NumberFormat('en', {
			style: 'currency',
			currency,
			maximumFractionDigits: 0
		}).format(amount);
	}

	/** The months up to this one: those ahead have nothing to show yet. */
	const rows = $derived(
		summary.months
			.filter((month) => month.month <= today.slice(0, 7))
			.map((month) => ({
				month: month.month,
				logged: month.logged,
				difference: month.logged - month.expectedSoFar,
				earned: homeAmount({ data, amounts: month.amounts })
			}))
	);
</script>

<Card.Root class="@container/card">
	<Card.Header>
		<Card.Title>{totals.length > 1 ? 'Clients and months' : 'Months'}</Card.Title>
	</Card.Header>
	<!-- The year's split between clients, then each month's. -->
	{#if totals.length > 1}
		<Card.Content>
			<ClientBars {totals} clients={data.clients} />
		</Card.Content>
	{/if}
	<!--
		A wide card reads the year left to right, a month to a column under the chart's own months, with
		each figure in a row. A narrower one lists the months down the page instead.
	-->
	<Card.Content class="@max-4xl/card:hidden">
		<div class="-mx-3 overflow-x-auto">
			<table class="ledger text-sm tabular-nums">
				<caption class="sr-only">Hours and earnings by month</caption>
				<thead class="text-xs">
					<tr>
						<td class="px-3 py-2"></td>
						{#each year as column (column.month)}
							<th scope="col" class="px-2 py-2 text-right font-medium last:pr-3">
								{#if column.ahead}
									{column.name}
								{:else}
									<a href="{resolve('/worklog')}?month={column.month}" class="hover:underline">
										{column.name}
									</a>
								{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					<tr>
						<th scope="row" class="px-3 py-2 font-normal text-muted-foreground">Logged</th>
						{#each year as column (column.month)}
							<td class="px-2 py-2 text-right last:pr-3">
								{column.ahead ? '' : formatHours(column.logged)}
							</td>
						{/each}
					</tr>
					{#if totals.length > 1}
						{#each totals as { client } (client.id)}
							<tr>
								<th scope="row" class="py-1.5 pr-3 pl-6 font-normal whitespace-nowrap">
									<ClientName {client} />
								</th>
								{#each year as column (column.month)}
									{const hours = $derived(hoursFor(column.month, client.id))}
									<td class="px-2 py-1.5 text-right text-muted-foreground last:pr-3">
										{#if !column.ahead}{hours ? formatHours(hours) : '—'}{/if}
									</td>
								{/each}
							</tr>
						{/each}
					{/if}
					<tr>
						<th scope="row" class="px-3 py-2 font-normal whitespace-nowrap text-muted-foreground">
							Against expected
						</th>
						{#each year as column (column.month)}
							<td
								class={[
									'px-2 py-2 text-right last:pr-3',
									column.difference >= 0 ? 'text-status-paid' : 'text-destructive'
								]}
							>
								{#if !column.ahead}
									{column.difference > 0 ? '+' : ''}{formatHours(column.difference)}
								{/if}
							</td>
						{/each}
					</tr>
					<tr>
						<th scope="row" class="px-3 py-2 font-normal text-muted-foreground">Earned</th>
						{#each year as column (column.month)}
							<td class="px-2 py-2 text-right last:pr-3">
								{#if !column.ahead}{column.earned ? wholeMoney(column.earned) : '—'}{/if}
							</td>
						{/each}
					</tr>
				</tbody>
			</table>
		</div>
	</Card.Content>
	<Card.Content class="@4xl/card:hidden">
		<!-- Stacks where the card is too narrow for its columns, wherever the card sits. -->
		<div class="-mx-3 overflow-x-auto">
			<table class="ledger text-sm @max-md/card:ledger-stacked">
				<caption class="sr-only">Hours and earnings by month</caption>
				<thead class="text-xs">
					<tr>
						<th class="px-3 py-2 font-medium">Month</th>
						<th class="px-3 py-2 text-right font-medium">Logged</th>
						<!-- Each client's hours, where the card has room for them. -->
						{#if totals.length > 1}
							{#each totals as { client } (client.id)}
								<th class="px-3 py-2 text-right font-medium @max-xl/card:hidden">{client.name}</th>
							{/each}
						{/if}
						<th class="px-3 py-2 text-right font-medium">Against expected</th>
						<th class="px-3 py-2 text-right font-medium">Earned</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.month)}
						<tr>
							<td class="px-3 py-2">
								<a href="{resolve('/worklog')}?month={row.month}" class="hover:underline">
									{shortMonth.format(parseIsoDate(`${row.month}-01`))}
								</a>
							</td>
							<td data-label="Logged" class="px-3 py-2 text-right">{formatHours(row.logged)}</td>
							{#if totals.length > 1}
								{#each totals as { client } (client.id)}
									{const hours = $derived(hoursFor(row.month, client.id))}
									<!-- Hidden on a mid-width card, and shown under its name once the table stacks. -->
									<td
										data-label={client.name}
										class="px-3 py-2 text-right text-muted-foreground @max-xl/card:hidden"
									>
										{hours ? formatHours(hours) : '—'}
									</td>
								{/each}
							{/if}
							<td
								data-label="Against expected"
								class={[
									'px-3 py-2 text-right',
									row.difference >= 0 ? 'text-status-paid' : 'text-destructive'
								]}
							>
								{row.difference > 0 ? '+' : ''}{formatHours(row.difference)}
							</td>
							<td data-label="Earned" class="px-3 py-2 text-right">
								{row.earned ? formatMoney(row.earned.amount, row.earned.currency) : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Card.Content>
</Card.Root>
