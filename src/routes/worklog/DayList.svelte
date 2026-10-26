<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import WorkItem from '#lib/components/WorkItem.svelte';
	import { formatHours, formatMoney, parseIsoDate } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { entryHours, type MonthSummary } from '#lib/worklog.js';
	import { Pencil, Trash2 } from '@lucide/svelte';
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

{#if days.length === 0}
	<p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
		Nothing logged this month yet.
	</p>
{:else}
	<ol class="ledger-rows overflow-hidden rounded-lg border bg-card">
		{#each days as day (day.date)}
			<li class="p-3 sm:p-4">
				<div class="mb-2 flex items-baseline justify-between gap-3 text-sm">
					<h3 class="font-medium tabular-nums">
						{dayFormat.format(parseIsoDate(day.date))}
						{#if day.name || day.kind === 'holiday' || day.kind === 'leave'}
							<span class="ml-1.5 font-normal text-muted-foreground">
								{day.kind === 'leave' ? 'Leave' : 'Holiday'}{day.name ? `: ${day.name}` : ''}
							</span>
						{/if}
					</h3>
					<span class="text-muted-foreground tabular-nums">
						{formatHours(day.logged)}{#if day.expected}{` / ${formatHours(day.expected)}`}{/if} h
					</span>
				</div>

				<ul class="space-y-2">
					{#each day.entries as entry (entry.id)}
						{const client = $derived(store.client(entry.clientId))}
						<li>
							{#if editing === entry.id}
								<div class="rounded-lg border bg-muted/30 p-3">
									<EntryForm
										clients={store.data.clients}
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
								<div
									class={['flex items-start gap-3 text-sm', entry.id === justAdded && 'just-added']}
									onanimationend={() => (justAdded = undefined)}
								>
									<span
										class="mt-1.5 size-2 shrink-0 rounded-full"
										style:background-color={clientColor(clientIndex.get(entry.clientId) ?? 0)}
										aria-hidden="true"
									></span>
									<div class="min-w-0 flex-1">
										<p class="text-xs text-muted-foreground tabular-nums">
											{client?.name ??
												'Unknown client'}{#if entry.start && entry.end}{`, ${entry.start}–${entry.end}`}{/if}{#if entry.rate !== undefined && client}{`, ${formatMoney(entry.rate, client.currency)}/h`}{/if}
										</p>
										{#if entry.items.length > 0}
											<ul class="mt-0.5 flex flex-col gap-0.5">
												{#each entry.items as item, index (index)}
													<li class="flex min-w-0"><WorkItem ref={item} {organization} /></li>
												{/each}
											</ul>
										{/if}
									</div>
									<span class="w-12 shrink-0 text-right tabular-nums">
										{#if entryHours(entry) > 0}{formatHours(entryHours(entry))} h{/if}
									</span>
									<div class="flex shrink-0">
										<Button
											variant="ghost"
											size="icon"
											class="size-7"
											aria-label="Edit entry"
											onclick={() => (editing = entry.id)}
										>
											<Pencil size={14} />
										</Button>
										<!-- Asks in the page rather than with confirm(), which some browsers suppress. -->
										<Popover.Root>
											<Popover.Trigger>
												{#snippet child({ props })}
													<Button
														{...props}
														variant="ghost"
														size="icon"
														class="size-7"
														aria-label="Delete entry"
													>
														<Trash2 size={14} />
													</Button>
												{/snippet}
											</Popover.Trigger>
											<Popover.Content class="w-auto space-y-2 p-3 text-sm" align="end">
												<p>Delete this entry?</p>
												<Button
													variant="destructive"
													size="sm"
													onclick={() => store.removeEntry(entry.id)}
												>
													Delete
												</Button>
											</Popover.Content>
										</Popover.Root>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ol>
{/if}

<style>
	/*
	 * Fades from a tint to nothing, so the entry you just saved is easy to find. The shadow widens
	 * the tint past the text without moving anything.
	 */
	.just-added {
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
