<script module lang="ts">
	const dateFormat = new Intl.DateTimeFormat('en', {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});
</script>

<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import WorkItem from '#lib/components/WorkItem.svelte';
	import { addDays, formatHours, formatTimeRange, parseIsoDate } from '#lib/format.js';
	import { entryHours, refKey, type WorkLogEntry } from '#lib/worklog.js';
	import { CalendarArrowUp, Ellipsis, Moon, Pencil, Trash2 } from '@lucide/svelte';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import type { Snippet } from 'svelte';
	import type { HTMLLiAttributes } from 'svelte/elements';

	let {
		entry,
		organization,
		client,
		rate,
		pastMidnight = false,
		selected,
		onselectedchange,
		onedit,
		onmove,
		onremove,
		handle,
		...rest
	}: HTMLLiAttributes & {
		entry: WorkLogEntry;
		organization?: string;
		/** Named beside the time when the list mixes clients. */
		client?: { name: string; color: string; logo?: string };
		/** The entry's own rate, when it has one. */
		rate?: string;
		/** Started after midnight, so the calendar date after the day it is logged on goes by the time. */
		pastMidnight?: boolean;
		/** Ticked for an action on several entries at once; no checkbox when left out. */
		selected?: boolean;
		onselectedchange?: (selected: boolean) => void;
		onedit: () => void;
		/** Offered in the menu when given. */
		onmove?: () => void;
		onremove: () => void;
		/** At the row's left edge, to drag the entry by. */
		handle?: Snippet;
	} = $props();

	const hours = $derived(entryHours(entry));
	const time = $derived(
		entry.start && entry.end ? formatTimeRange(entry.start, entry.end) : undefined
	);
	const calendarDate = $derived(
		pastMidnight ? dateFormat.format(parseIsoDate(addDays(entry.date, 1))) : undefined
	);
</script>

<!--
	One grid for every row, so each part keeps its place whatever is in it. In a narrow list the time
	heads the row beside the hours and menu, and the client and work follow on lines of their own, their
	icons in one column. From @xl the time and client share a column to the left of the work, and a
	last flexible row takes the height of long work, so the client stays under the time.
-->
<li
	{...rest}
	class={[
		'grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm @xl/entries:grid-cols-[10rem_minmax(0,1fr)_auto_auto] @xl/entries:grid-rows-[auto_auto_1fr] @xl/entries:gap-y-0.5',
		handle ? 'relative pl-16' : selected !== undefined && 'relative pl-11',
		rest.class
	]}
>
	{#if handle}
		<!-- A column of its own before the checkbox, as shadcn's data table puts a row's drag handle. -->
		<div class="absolute top-2.5 left-2 flex h-5 items-center">{@render handle()}</div>
	{/if}
	{#if selected !== undefined}
		<!-- Beside the grid, so the columns line up with rows that have no checkbox. -->
		<div class={['absolute top-2.5 flex h-5 items-center', handle ? 'left-10' : 'left-4']}>
			<Checkbox
				checked={selected}
				onCheckedChange={(checked) => onselectedchange?.(checked)}
				aria-label={time ? `Select ${time}` : 'Select this entry'}
			/>
		</div>
	{/if}
	{#if time}
		<p
			class="col-start-1 row-start-1 inline-flex min-w-0 items-center gap-1 leading-5 whitespace-nowrap text-muted-foreground tabular-nums"
			title={calendarDate && `After midnight, on ${calendarDate}`}
		>
			<span class="truncate">{time.replace(/ (AM|PM)/g, '\u00a0$1')}</span>
			<!-- The moon says it was late at night; the date it fell on is left to the tooltip. -->
			{#if calendarDate}
				<Moon size={12} aria-hidden="true" class="shrink-0" />
				<span class="sr-only">after midnight, on {calendarDate}</span>
			{/if}
		</p>
	{/if}
	{#if client}
		<!-- Its logo or dot takes the width of a work item's icon, so the names line up with the work. -->
		<p
			class={[
				'col-start-1 flex min-w-0 items-start gap-1.5 leading-5 text-muted-foreground @xl/entries:col-span-1',
				time ? 'row-start-2' : 'row-start-1',
				// Beside the rate, when the entry has one.
				rate ? 'col-span-1' : 'col-span-3'
			]}
		>
			<span class="flex h-5 w-3.5 shrink-0 items-center justify-center" aria-hidden="true">
				{#if client.logo}
					<img src={client.logo} alt="" class="size-3.5 rounded-[3px]" />
				{:else}
					<span class="size-2 rounded-full" style:background-color={client.color}></span>
				{/if}
			</span>
			<!-- Cut short in the time column; screen readers still read the whole name. -->
			<span class="min-w-0 truncate" title={client.name}>{client.name}</span>
		</p>
	{/if}

	<ul
		class={[
			'min-w-0 space-y-1 leading-5 @xl/entries:col-span-1 @xl/entries:col-start-2 @xl/entries:row-span-3 @xl/entries:row-start-1 @xl/entries:space-y-0.5',
			time && client ? 'row-start-3' : time || client || rate ? 'row-start-2' : 'row-start-1',
			// On the rate's line, the work keeps to its left.
			!(time && client) && rate ? 'col-span-1' : 'col-span-3'
		]}
	>
		{#each entry.items as item (refKey(item))}
			<li class="flex min-w-0"><WorkItem ref={item} {organization} /></li>
		{/each}
	</ul>

	<p
		class="col-start-2 row-start-1 text-right leading-5 whitespace-nowrap tabular-nums @xl/entries:col-start-3"
	>
		{#if hours > 0}<span class="font-medium">{formatHours(hours)} h</span>{/if}
	</p>
	{#if rate}
		<!-- On the line under the hours, beside the client rather than on a line of its own. -->
		<p
			class="col-start-2 row-start-2 text-right text-xs leading-5 whitespace-nowrap text-muted-foreground tabular-nums @xl/entries:col-start-3"
		>
			{rate}/h
		</p>
	{/if}

	<div class="col-start-3 row-start-1 flex h-5 items-center self-start @xl/entries:col-start-4">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<!-- Centred on the first line, its 32px, or 40px on touch, overflows the line evenly. -->
					<Button
						{...props}
						variant="ghost"
						size="icon-sm"
						class="-mx-0.5 text-muted-foreground pointer-coarse:-mx-1.5"
					>
						<Ellipsis size={16} />
						<span class="sr-only">Change this entry</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onclick={onedit}><Pencil /> Edit</DropdownMenu.Item>
				{#if onmove}
					<DropdownMenu.Item onclick={onmove}><CalendarArrowUp /> Move…</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Item variant="destructive" onclick={onremove}>
					<Trash2 /> Delete
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</li>
