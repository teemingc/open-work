<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import WorkItem from '#lib/components/WorkItem.svelte';
	import { formatDMY, formatHours } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { activeClients, monthOf, totalHours, type WorkLogEntry } from '#lib/worklog.js';
	import { Clock } from '@lucide/svelte';
	import type { Draft } from './draft.svelte';

	let { draft, store, organization }: { draft: Draft; store: WorkLogStore; organization?: string } =
		$props();

	const client = $derived(draft.client);
	const clients = $derived(activeClients(store.data.clients));
	const days = $derived.by(() => {
		const groups: { date: string; entries: WorkLogEntry[] }[] = [];
		for (const entry of draft.entries) {
			const last = groups.at(-1);
			if (last?.date === entry.date) last.entries.push(entry);
			else groups.push({ date: entry.date, entries: [entry] });
		}
		return groups;
	});
	const logHref = $derived(`${resolve('/worklog')}?month=${monthOf(draft.startDate)}`);
</script>

<section class="space-y-4 p-5 sm:p-6" aria-labelledby="log-heading">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<h2 id="log-heading" class="text-lg">Work log</h2>
		<Button variant="outline" size="sm" href={logHref}><Clock /> Edit in the work log</Button>
	</div>

	{#if clients.length > 1}
		<div class="max-w-60 space-y-1.5">
			<Label for="invoice-client">Client</Label>
			<Select.Root
				type="single"
				value={draft.clientId ?? ''}
				onValueChange={(id) => draft.chooseClient(id)}
			>
				<Select.Trigger id="invoice-client" class="w-full">
					{client?.name ?? 'Choose one'}
				</Select.Trigger>
				<Select.Content>
					{#each clients as option (option.id)}
						<Select.Item value={option.id}>{option.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	{/if}

	{#if clients.length === 0}
		<p class="text-sm text-muted-foreground">
			Add the client you invoice in
			<a href={resolve('/worklog/setup')} class="font-medium text-foreground underline"
				>Clients and days off</a
			>, then log your time.
		</p>
	{:else if days.length === 0}
		<p class="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
			Nothing logged for this client between {formatDMY(draft.startDate)} and
			{formatDMY(draft.endDate)}.
		</p>
	{:else}
		<ol class="ledger-rows max-h-96 overflow-y-auto rounded-lg border bg-card">
			{#each days as day (day.date)}
				<li class="p-3">
					<div class="mb-1 flex items-baseline justify-between text-sm">
						<h3 class="font-medium tabular-nums">{formatDMY(day.date)}</h3>
						<span class="text-muted-foreground tabular-nums">
							{formatHours(totalHours(day.entries))} h
						</span>
					</div>
					<ul class="space-y-0.5 text-sm">
						{#each day.entries.flatMap((entry) => entry.items) as item (item)}
							<li class="flex min-w-0"><WorkItem ref={item} {organization} /></li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
	{/if}
</section>
