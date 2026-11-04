<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { formatHours, parseIsoDate } from '#lib/format.js';
	import { summarizeMonth, type WorkLogData } from '#lib/worklog.js';
	import { NotebookPen } from '@lucide/svelte';

	let { data, year, today }: { data: WorkLogData; year: number; today: string } = $props();

	const longMonth = new Intl.DateTimeFormat('en', { month: 'long' });

	/** Every month of the year, as the year's summary leaves out months before you first logged. */
	const months = $derived(
		Array.from({ length: 12 }, (_, i) =>
			summarizeMonth({ data, month: `${year}-${String(i + 1).padStart(2, '0')}`, today })
		)
	);
	const expected = $derived(months.reduce((sum, month) => sum + month.expected, 0));
	const workingDays = $derived(months.reduce((sum, month) => sum + month.workingDays, 0));
	const thisMonth = $derived(today.slice(0, 7));
	const hasClients = $derived(data.clients.some((client) => !client.archived));
</script>

<!--
	An empty year reads as a blank ledger spread: the year's target and what to do on the left, and on
	the right the months already ruled with the hours each one expects.
-->
<Card.Root class="@container/card gap-0 overflow-hidden py-0">
	<div class="grid @3xl/card:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
		<Empty.Root
			class="rounded-none border-b-[3px] border-double border-rule p-6 @3xl/card:items-start @3xl/card:border-r-[3px] @3xl/card:border-b-0 @3xl/card:p-10 @3xl/card:text-left"
		>
			<Empty.Header class="@3xl/card:items-start">
				<Empty.Media variant="icon" class="size-12 bg-accent text-accent-foreground">
					<NotebookPen class="size-6" aria-hidden="true" />
				</Empty.Media>
				<h2 class="font-display text-3xl font-medium text-(--heading) tabular-nums">
					{formatHours(expected)} hours to log
				</h2>
				<Empty.Description class="text-base">
					Over {workingDays} working days, at {formatHours(data.hoursPerDay)} hours a day.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content class="@3xl/card:items-start">
				<div class="grid w-full gap-2 @md/card:flex @md/card:w-auto">
					{#if hasClients}
						<Button href={resolve('/worklog')}>Log time</Button>
					{:else}
						<Button href={resolve('/settings/clients')}>Add a client</Button>
					{/if}
					<Button href={resolve('/settings/hours')} variant="outline">Change hours</Button>
				</div>
			</Empty.Content>
		</Empty.Root>

		<div class="px-2 py-4 @3xl/card:px-6 @3xl/card:py-8">
			<table class="ledger text-sm">
				<caption class="sr-only">Hours expected each month of {year}</caption>
				<thead class="text-xs">
					<tr>
						<th class="px-3 py-2 font-medium">Month</th>
						<th class="px-3 py-2 text-right font-medium">Hours logged</th>
						<th class="px-3 py-2 text-right font-medium">Hours expected</th>
					</tr>
				</thead>
				<tbody class="text-muted-foreground tabular-nums">
					{#each months as month (month.month)}
						{const current = $derived(month.month === thisMonth)}
						<tr class={[current && 'font-medium text-foreground']}>
							<td class="px-3 py-1.5">
								<a href="{resolve('/worklog')}?month={month.month}" class="hover:underline">
									{longMonth.format(parseIsoDate(`${month.month}-01`))}
								</a>
								{#if current}<span class="sr-only">(this month)</span>{/if}
							</td>
							<td class="px-3 py-1.5 text-right">—</td>
							<td class="px-3 py-1.5 text-right">{formatHours(month.expected)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</Card.Root>
