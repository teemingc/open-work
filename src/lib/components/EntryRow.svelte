<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import WorkItem from '#lib/components/WorkItem.svelte';
	import ClientName from '#lib/components/ClientName.svelte';
	import { formatHours, formatTime } from '#lib/format.js';
	import { entryHours, refKey, type WorkLogEntry } from '#lib/worklog.js';
	import { Ellipsis, Pencil, Trash2 } from '@lucide/svelte';
	import type { HTMLLiAttributes } from 'svelte/elements';

	let {
		entry,
		organization,
		client,
		rate,
		onedit,
		onremove,
		...rest
	}: HTMLLiAttributes & {
		entry: WorkLogEntry;
		organization?: string;
		/** Named beside the time when the list mixes clients. */
		client?: { name: string; color: string; logo?: string };
		/** The entry's own rate, when it has one. */
		rate?: string;
		onedit: () => void;
		onremove: () => void;
	} = $props();

	/** "1:00 – 2:00 PM", keeping both halves of the day only when the range crosses noon or midnight. */
	function timeRange(start: string, end: string): string {
		const [from, to] = [formatTime(start), formatTime(end)];
		return from.slice(-2) === to.slice(-2) ? `${from.slice(0, -3)} – ${to}` : `${from} – ${to}`;
	}

	const hours = $derived(entryHours(entry));
	const time = $derived(entry.start && entry.end ? timeRange(entry.start, entry.end) : undefined);
</script>

<!--
	One grid for every row, so times, work, hours and the menu each keep to a column. On a phone the
	time goes above the work instead of beside it.
-->
<li
	{...rest}
	class={[
		'grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-0.5 px-4 py-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)_auto_auto]',
		rest.class
	]}
>
	{#if time || client}
		<p
			class="col-start-1 flex flex-wrap items-baseline gap-x-2 text-muted-foreground tabular-nums sm:flex-col"
		>
			<!-- Breaks only between the two times, so a narrow column never runs into the hours. -->
			{#if time}<span>{time.replace(/ (AM|PM)/g, '\u00a0$1')}</span>{/if}
			{#if client}
				{#if client.logo}
					<ClientName {client} class="[&>span]:truncate" title={client.name} />
				{:else}
					<span class="inline-flex max-w-full min-w-0 items-center gap-1.5">
						<span
							class="size-2 shrink-0 rounded-full"
							style:background-color={client.color}
							aria-hidden="true"
						></span>
						<!-- Cut short in the time column; screen readers still read the whole name. -->
						<span class="min-w-0 truncate" title={client.name}>{client.name}</span>
					</span>
				{/if}
			{/if}
		</p>
	{/if}

	<!-- Under the time on a phone, the work takes the width of the hours and menu too. -->
	<ul
		class={[
			'min-w-0 space-y-0.5 sm:col-span-1 sm:col-start-2 sm:row-start-1',
			time || client ? 'col-span-3' : 'col-start-1'
		]}
	>
		{#each entry.items as item (refKey(item))}
			<li class="flex min-w-0"><WorkItem ref={item} {organization} /></li>
		{/each}
	</ul>

	<p class="col-start-2 row-start-1 text-right whitespace-nowrap tabular-nums sm:col-start-3">
		{#if hours > 0}<span class="font-medium">{formatHours(hours)} h</span>{/if}
		{#if rate}<span class="block text-xs text-muted-foreground">{rate}/h</span>{/if}
	</p>

	<div class="col-start-3 row-start-1 self-start sm:col-start-4">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<!-- Negative margins keep its 32px, or 40px on touch, from making the row taller. -->
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						class="-mx-0.5 -my-1.5 text-muted-foreground pointer-coarse:-mx-1.5 pointer-coarse:-my-2.5"
					>
						<Ellipsis size={16} />
						<span class="sr-only">Change this entry</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onclick={onedit}><Pencil /> Edit</DropdownMenu.Item>
				<DropdownMenu.Item variant="destructive" onclick={onremove}>
					<Trash2 /> Delete
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</li>
