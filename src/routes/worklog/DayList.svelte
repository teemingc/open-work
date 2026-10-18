<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
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
		organization
	}: { store: WorkLogStore; summary: MonthSummary; organization?: string } = $props();

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
	<ol class="divide-y rounded-lg border bg-card">
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
						{formatHours(day.logged)}{#if day.expected}
							/ {formatHours(day.expected)}{/if} h
					</span>
				</div>

				<ul class="space-y-2">
					{#each day.entries as entry (entry.id)}
						{@const client = store.client(entry.clientId)}
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
								<div class="flex items-start gap-3 text-sm">
									<span
										class="mt-1.5 size-2 shrink-0 rounded-full"
										style:background-color={clientColor(clientIndex.get(entry.clientId) ?? 0)}
										aria-hidden="true"
									></span>
									<div class="min-w-0 flex-1">
										<p class="text-xs text-muted-foreground tabular-nums">
											{client?.name ?? 'Unknown client'}{#if entry.start && entry.end}
												· {entry.start}–{entry.end}{/if}{#if entry.rate !== undefined && client}
												· {formatMoney(entry.rate, client.currency)}/h{/if}
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
										<Button
											variant="ghost"
											size="icon"
											class="size-7"
											aria-label="Delete entry"
											onclick={() => {
												if (confirm('Delete this entry?')) store.removeEntry(entry.id);
											}}
										>
											<Trash2 size={14} />
										</Button>
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
