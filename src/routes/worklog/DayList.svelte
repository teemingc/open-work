<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import EntryRow from '#lib/components/EntryRow.svelte';
	import { formatHours, formatMoney, parseIsoDate } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { clientChoices, inDayOrder, taskNames, type MonthSummary } from '#lib/worklog.js';
	import { clientColor } from '#lib/client-colors.js';
	import EntryForm from '#lib/components/EntryForm.svelte';

	let {
		store,
		summary,
		organization,
		justAdded = $bindable()
	}: {
		store: WorkLogStore;
		summary: MonthSummary;
		organization?: string;
		/** The entry just saved, tinted once and then cleared, so it does not tint again later. */
		justAdded?: string;
	} = $props();

	let editing = $state<string | undefined>();
	/** The entry waiting for you to confirm its deletion. */
	let removing = $state<string | undefined>();

	const dayFormat = new Intl.DateTimeFormat('en', {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});

	const clientIndex = $derived(new Map(store.data.clients.map((client, i) => [client.id, i])));

	/** Days with something to show, newest first so today's work is at the top. */
	const days = $derived(
		summary.days
			.map((day) => ({
				...day,
				entries: inDayOrder(store.data.entries.filter((entry) => entry.date === day.date))
			}))
			.filter((day) => day.entries.length > 0 || day.kind === 'holiday')
			.reverse()
	);
</script>

<Card.Root class="gap-0 overflow-hidden py-0">
	<h2 class="sr-only">Days logged</h2>
	{#if days.length === 0}
		<p class="p-6 text-center text-sm text-muted-foreground">Nothing logged this month yet.</p>
	{:else}
		<ol>
			{#each days as day (day.date)}
				<li class="border-b last:border-b-0">
					<!-- The day's total lines up with each entry's hours, as their sum. -->
					<div
						class="flex items-baseline justify-between gap-3 border-b bg-muted/50 py-1.5 pr-14 pl-4 text-sm"
					>
						<h3 class="min-w-0">
							<span class="font-medium tabular-nums"
								>{dayFormat.format(parseIsoDate(day.date))}</span
							>
							{#if day.kind === 'holiday'}
								<span class="ml-1.5 text-muted-foreground">
									Holiday{day.name ? `: ${day.name}` : ''}
								</span>
							{/if}
						</h3>
						<span class="whitespace-nowrap tabular-nums">
							<span class="font-semibold">{formatHours(day.logged)}</span>{#if day.expected}<span
									class="text-muted-foreground">{` / ${formatHours(day.expected)}`}</span
								>{/if}
							h
						</span>
					</div>

					{#if day.entries.length > 0}
						<ul class="divide-y divide-border/60">
							{#each day.entries as entry (entry.id)}
								{const client = $derived(store.client(entry.clientId))}
								{#if editing === entry.id}
									<li class="bg-muted/30 p-4">
										<EntryForm
											clients={clientChoices({
												clients: store.data.clients,
												clientId: entry.clientId
											})}
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
									</li>
								{:else}
									<EntryRow
										{entry}
										{organization}
										client={{
											name: client?.name ?? 'Unknown client',
											color: clientColor(client, clientIndex.get(entry.clientId) ?? 0),
											logo: client?.logo
										}}
										rate={entry.rate !== undefined && client
											? formatMoney(entry.rate, client.currency)
											: undefined}
										class={entry.id === justAdded ? 'just-added' : undefined}
										onanimationend={() => (justAdded = undefined)}
										onedit={() => (editing = entry.id)}
										onremove={() => (removing = entry.id)}
									/>
								{/if}
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</Card.Root>

<!-- Asks in the page rather than with confirm(), which some browsers suppress. -->
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
					if (removing) store.removeEntry(removing);
					removing = undefined;
				}}
			>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* Fades from a tint to nothing, so the entry you just saved is easy to find. */
	:global(.just-added) {
		animation: just-added 1200ms cubic-bezier(0.23, 1, 0.32, 1);
	}

	@keyframes just-added {
		from {
			background-color: color-mix(in oklch, var(--primary) 12%, transparent);
		}
	}
</style>
