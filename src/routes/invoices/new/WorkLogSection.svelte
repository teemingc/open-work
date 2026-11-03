<script lang="ts">
	import ClientName from '#lib/components/ClientName.svelte';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import EntryForm from '#lib/components/EntryForm.svelte';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import EntryRow from '#lib/components/EntryRow.svelte';
	import { formatDMY, formatHours, parseIsoDate } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import {
		activeClients,
		clientChoices,
		inDayOrder,
		monthOf,
		taskNames,
		totalHours,
		type WorkLogEntry
	} from '#lib/worklog.js';
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
		for (const group of groups) group.entries = inDayOrder(group.entries);
		return groups;
	});
	/** The entry open in the edit dialog, and the one waiting for you to confirm its deletion. */
	let editing = $state<WorkLogEntry | undefined>();
	let removing = $state<WorkLogEntry | undefined>();

	const dayFormat = new Intl.DateTimeFormat('en', {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
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
					{#if client}<ClientName {client} />{:else}Choose one{/if}
				</Select.Trigger>
				<Select.Content>
					{#each clients as option (option.id)}
						<Select.Item value={option.id} label={option.name}
							><ClientName client={option} /></Select.Item
						>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	{/if}

	{#if clients.length === 0}
		<p class="text-sm text-muted-foreground">
			Add the client you invoice in
			<a href={resolve('/settings/clients')} class="font-medium text-foreground underline"
				>Clients settings</a
			>, then log your time.
		</p>
	{:else if days.length === 0}
		<p class="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
			Nothing logged for this client between {formatDMY(draft.startDate)} and
			{formatDMY(draft.endDate)}.
		</p>
	{:else}
		<!-- Each block of time on its own, so one can be put right without leaving the invoice. -->
		<ol class="relative max-h-96 overflow-y-auto rounded-lg border bg-card">
			{#each days as day (day.date)}
				<li class="border-b last:border-b-0">
					<!-- The day's total lines up with each entry's hours, as their sum. -->
					<div
						class="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b bg-muted py-1.5 pr-14 pl-4 text-sm"
					>
						<h3 class="font-medium tabular-nums">{dayFormat.format(parseIsoDate(day.date))}</h3>
						<span class="font-semibold tabular-nums">{formatHours(totalHours(day.entries))} h</span>
					</div>
					<ul class="divide-y divide-border/60">
						{#each day.entries as entry (entry.id)}
							<EntryRow
								{entry}
								{organization}
								onedit={() => (editing = entry)}
								onremove={() => (removing = entry)}
							/>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<Dialog.Root bind:open={() => editing !== undefined, (open) => !open && (editing = undefined)}>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Edit entry</Dialog.Title>
		</Dialog.Header>
		{#if editing}
			{const entry = $derived(editing)}
			<EntryForm
				clients={clientChoices({ clients: store.data.clients, clientId: entry.clientId })}
				{organization}
				{entry}
				tasks={taskNames(store.data.entries)}
				date={entry.date}
				onsave={(changes) => {
					store.updateEntry({ ...changes, id: entry.id });
					editing = undefined;
				}}
				oncancel={() => (editing = undefined)}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={() => removing !== undefined, (open) => !open && (removing = undefined)}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete this entry?</Dialog.Title>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (removing = undefined)}>Keep it</Button>
			<Button
				variant="destructive"
				onclick={() => {
					if (removing) store.removeEntry(removing.id);
					removing = undefined;
				}}
			>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
