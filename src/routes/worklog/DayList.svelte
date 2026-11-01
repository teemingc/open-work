<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import WorkItem from '#lib/components/WorkItem.svelte';
	import { formatHours, formatMoney, formatTime, parseIsoDate } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { clientChoices, entryHours, type MonthSummary } from '#lib/worklog.js';
	import { Ellipsis, Pencil, Trash2 } from '@lucide/svelte';
	import { clientColor } from './colors';
	import EntryForm from './EntryForm.svelte';

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
				entries: store.data.entries.filter((entry) => entry.date === day.date)
			}))
			.filter((day) => day.entries.length > 0 || day.kind === 'holiday' || day.kind === 'leave')
			.reverse()
	);
</script>

<Card.Root class="h-full gap-0 py-0">
	{#if days.length === 0}
		<p class="p-6 text-center text-sm text-muted-foreground">Nothing logged this month yet.</p>
	{:else}
		<ol class="divide-y">
			{#each days as day (day.date)}
				<li class="px-4 py-4 sm:px-6">
					<div class="flex items-baseline justify-between gap-3 text-sm">
						<h3 class="font-medium tabular-nums">
							{dayFormat.format(parseIsoDate(day.date))}
							{#if day.name || day.kind === 'holiday' || day.kind === 'leave'}
								<span class="ml-1.5 font-normal text-muted-foreground">
									{day.kind === 'leave' ? 'Leave' : 'Holiday'}{day.name ? `: ${day.name}` : ''}
								</span>
							{/if}
						</h3>
						<!-- The day against what it was meant to hold; each entry gives its own hours. -->
						<span class="text-muted-foreground tabular-nums">
							{formatHours(day.logged)}{#if day.expected}{` of ${formatHours(day.expected)}`}{/if} h
						</span>
					</div>

					{#if day.entries.length > 0}
						<Item.Group class="-mx-3 mt-2 gap-1">
							{#each day.entries as entry (entry.id)}
								{const client = $derived(store.client(entry.clientId))}
								{#if editing === entry.id}
									<div class="mx-3 rounded-lg border bg-muted/30 p-3">
										<EntryForm
											clients={clientChoices({
												clients: store.data.clients,
												clientId: entry.clientId
											})}
											{organization}
											{entry}
											date={entry.date}
											onsave={(changes) => {
												store.updateEntry({ ...changes, id: entry.id });
												editing = undefined;
											}}
											oncancel={() => (editing = undefined)}
										/>
									</div>
								{:else}
									<Item.Root
										size="sm"
										class={['items-start', entry.id === justAdded && 'just-added']}
										onanimationend={() => (justAdded = undefined)}
									>
										<Item.Media class="pt-1.5">
											<span
												class="size-2 rounded-full"
												style:background-color={clientColor(clientIndex.get(entry.clientId) ?? 0)}
												aria-hidden="true"
											></span>
										</Item.Media>
										<Item.Content class="min-w-0">
											<Item.Title class="tabular-nums">
												{client?.name ?? 'Unknown client'}
												{#if entry.start && entry.end}
													<span class="font-normal text-muted-foreground">
														{formatTime(entry.start)} – {formatTime(entry.end)}
													</span>
												{/if}
												{#if entry.rate !== undefined && client}
													<span class="font-normal text-muted-foreground">
														{formatMoney(entry.rate, client.currency)}/h
													</span>
												{/if}
											</Item.Title>
											{#if entry.items.length > 0}
												<ul class="flex flex-col gap-0.5 text-sm">
													{#each entry.items as item, index (index)}
														<li class="flex min-w-0"><WorkItem ref={item} {organization} /></li>
													{/each}
												</ul>
											{/if}
										</Item.Content>
										<Item.Actions class="gap-1">
											{#if entryHours(entry) > 0}
												<span class="text-sm tabular-nums">{formatHours(entryHours(entry))} h</span>
											{/if}
											<DropdownMenu.Root>
												<DropdownMenu.Trigger>
													{#snippet child({ props })}
														<Button
															{...props}
															variant="ghost"
															size="icon"
															class="size-7 text-muted-foreground"
															aria-label="Change this entry"
														>
															<Ellipsis size={16} />
														</Button>
													{/snippet}
												</DropdownMenu.Trigger>
												<DropdownMenu.Content align="end">
													<DropdownMenu.Item onclick={() => (editing = entry.id)}>
														<Pencil /> Edit
													</DropdownMenu.Item>
													<DropdownMenu.Item
														variant="destructive"
														onclick={() => (removing = entry.id)}
													>
														<Trash2 /> Delete
													</DropdownMenu.Item>
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										</Item.Actions>
									</Item.Root>
								{/if}
							{/each}
						</Item.Group>
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
	/*
	 * Fades from a tint to nothing, so the entry you just saved is easy to find. The shadow widens
	 * the tint past the text without moving anything.
	 */
	:global(.just-added) {
		border-radius: var(--radius-sm);
		animation: just-added 1200ms cubic-bezier(0.23, 1, 0.32, 1);
	}

	@keyframes just-added {
		from {
			background-color: color-mix(in oklch, var(--primary) 12%, transparent);
			box-shadow: 0 0 0 0.375rem color-mix(in oklch, var(--primary) 12%, transparent);
		}
	}
</style>
