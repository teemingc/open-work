<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import EntryRow from '#lib/components/EntryRow.svelte';
	import { formatHours, formatMoney, parseIsoDate } from '#lib/format.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import {
		clientChoices,
		dropDays,
		inDayOrder,
		startsPastMidnight,
		taskNames,
		type DaySummary,
		type MonthSummary
	} from '#lib/worklog.js';
	import { clientColor } from '#lib/client-colors.js';
	import EntryForm from '#lib/components/EntryForm.svelte';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { CalendarArrowUp, GripVertical, X } from '@lucide/svelte';
	import {
		DragDropProvider,
		KeyboardSensor,
		PointerSensor,
		type DragDropEventHandlers
	} from '@dnd-kit/svelte';
	import { Accessibility, Feedback } from '@dnd-kit/dom';
	import type { ComponentProps } from 'svelte';
	import MoveEntriesForm from './MoveEntriesForm.svelte';
	import EntryDrag from './EntryDrag.svelte';
	import DayDrop from './DayDrop.svelte';

	let {
		store,
		summary,
		organization,
		today,
		justAdded = $bindable()
	}: {
		store: WorkLogStore;
		summary: MonthSummary;
		today: string;
		organization?: string;
		/** The entry just saved, tinted once and then cleared, so it does not tint again later. */
		justAdded?: string;
	} = $props();

	let editing = $state<string | undefined>();
	/** The entry waiting for you to confirm its deletion. */
	let removing = $state<string | undefined>();
	/** Entries ticked for moving together. */
	const selected = $state<string[]>([]);
	/** The entries being moved, while the dialog asks where to. */
	let moving = $state<string[] | undefined>();

	const dayFormat = new Intl.DateTimeFormat('en', {
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	});

	/** The entry being dragged, and the drop zone it is over. */
	let dragging = $state<string | undefined>();
	let over = $state<string | undefined>();
	const draggingEntry = $derived(store.data.entries.find((entry) => entry.id === dragging));

	const sensors = [
		// Only the handle starts a drag, so it can start at once rather than after a long press.
		PointerSensor.configure({ activationConstraints: () => undefined }),
		KeyboardSensor
	];

	const clientIndex = $derived(new Map(store.data.clients.map((client, i) => [client.id, i])));

	/**
	 * Days with something to show, newest first so today's work is at the top, and each day's work
	 * newest first too, so the whole list runs back in time. Entries without times stay at the end.
	 */
	const days = $derived(
		summary.days
			.map((day) => {
				const worked = inDayOrder(store.data.entries.filter((entry) => entry.date === day.date));
				return {
					...day,
					worked,
					entries: [
						...worked.filter((entry) => entry.start).reverse(),
						...worked.filter((entry) => !entry.start)
					]
				};
			})
			.filter((day) => day.entries.length > 0 || day.kind === 'holiday')
			.reverse()
	);
	/**
	 * While dragging, the days up to today with nothing logged, each under the line between shown days
	 * where it goes: keyed by the shown day above it, or by "" above the first.
	 */
	const gaps = $derived.by(() => {
		if (!dragging) return {};
		const shownDays = new Set(days.map((day) => day.date));
		return Object.groupBy(
			summary.days.filter((day) => day.date <= today && !shownDays.has(day.date)).toReversed(),
			(day) => days.findLast((shownDay) => shownDay.date > day.date)?.date ?? ''
		);
	});

	const shown = $derived(new Set(days.flatMap((day) => day.entries.map((entry) => entry.id))));
	/** Ticked entries in this month; others stay ticked for when you come back to theirs. */
	const selectedHere = $derived(selected.filter((id) => shown.has(id)));
	const movingEntries = $derived(store.data.entries.filter((entry) => moving?.includes(entry.id)));

	function select(ids: string[], checked: boolean) {
		for (const id of ids) {
			const index = selected.indexOf(id);
			if (checked && index === -1) selected.push(id);
			else if (!checked && index !== -1) selected.splice(index, 1);
		}
	}

	/** A day's drop zone, rather than the band that opens the days between two others. */
	const isDay = (id: unknown) => !String(id).startsWith('gap:');

	/** The day a drop zone stands for: a band with only one day in it stands for that day. */
	function dropDate(id: string) {
		if (isDay(id)) return id;
		const empty = gaps[id.slice('gap:'.length)];
		return empty?.length === 1 ? empty[0].date : undefined;
	}

	const formatDay = (date: string) => dayFormat.format(parseIsoDate(date));

	type DragEvent<K extends keyof DragDropEventHandlers> = Parameters<
		Required<DragDropEventHandlers>[K]
	>[0];

	/** Dragging a ticked entry takes the others ticked with it. */
	function dragGroup(id: string) {
		return selected.includes(id) ? selectedHere : [id];
	}
	/** Everything going with the drag, so the rest of the group can fade where it is. */
	const draggedIds = $derived(dragging ? dragGroup(dragging) : []);

	const plugins: ComponentProps<typeof DragDropProvider>['plugins'] = (defaults) => [
		...defaults.filter((plugin) => plugin !== Accessibility && plugin !== Feedback),
		// The list sorts the entry into its new day as it lands, so it never flies back to where it was.
		Feedback.configure({ dropAnimation: null }),
		Accessibility.configure({
			screenReaderInstructions: {
				draggable:
					'To move this entry to another day, press space, then the arrow keys to move it there, and space again to drop it. Press escape to cancel.'
			},
			announcements: {
				dragstart: () =>
					draggedIds.length > 1 ? `Picked up ${draggedIds.length} entries.` : 'Picked up.',
				dragover: ({ operation: { target } }: DragEvent<'onDragOver'>) => {
					const date = target && dropDate(String(target.id));
					return date ? `Over ${formatDay(date)}.` : undefined;
				},
				dragend: ({ operation: { target }, canceled }: DragEvent<'onDragEnd'>) => {
					const date = target && dropDate(String(target.id));
					return canceled || !date ? 'Put back.' : `Dropped on ${formatDay(date)}.`;
				}
			}
		})
	];

	/**
	 * Dropped on the night before the day it was worked on, or back on that day, an entry keeps its
	 * date and only changes the day it counts toward. Anywhere else, its date changes.
	 */
	function drop(id: string, date: string) {
		const entries = store.data.entries.filter((entry) => dragGroup(id).includes(entry.id));
		const ids = (keep: (days: string[]) => boolean) =>
			entries.filter((entry) => keep(dropDays(entry))).map((entry) => entry.id);
		const before = ids((days) => days[0] === date);
		const back = ids((days) => days[1] === date);
		const moved = ids((days) => !days.includes(date));
		if (before.length > 0) store.countTowardDayBefore({ ids: before, dayBefore: true });
		if (back.length > 0) store.countTowardDayBefore({ ids: back, dayBefore: false });
		if (moved.length > 0) store.moveEntries({ ids: moved, date });
	}

	function clearSelection() {
		selected.splice(0, selected.length);
	}
</script>

{#snippet gap(above: string, empty: DaySummary[])}
	{const band = $derived(`gap:${above}`)}
	{const open = $derived(over === band || empty.some((day) => day.date === over))}
	<DayDrop date={band} disabled={false} priority={3} pointer>
		{#snippet children(bandZone)}
			<li class="relative">
				<!--
					A band over the line between two days, reaching into the rows on either side. Dragging
					onto it opens the days with nothing logged that go there, and it grows with them.
				-->
				<div {@attach bandZone.attach} class="absolute inset-x-0 -top-5 -bottom-5"></div>
				<div
					class={[
						'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
						open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
					]}
				>
					<ol class="overflow-hidden">
						{#each empty as day (day.date)}
							<DayDrop date={day.date} disabled={false} priority={4} pointer>
								{#snippet children(dayZone)}
									<li
										{@attach dayZone.attach}
										class={[
											'flex items-baseline justify-between gap-3 border-b bg-muted/50 py-2.5 pr-14 pl-16 text-sm transition-colors',
											(dayZone.isDropTarget || dropDate(over ?? '') === day.date) &&
												'bg-primary/10 outline-2 -outline-offset-2 outline-primary outline-dashed'
										]}
									>
										<h3 class="font-medium tabular-nums">{formatDay(day.date)}</h3>
										<span class="whitespace-nowrap tabular-nums">
											<span class="font-semibold">0</span>{#if day.expected}<span
													class="text-muted-foreground">{` / ${formatHours(day.expected)}`}</span
												>{/if}
											h
										</span>
									</li>
								{/snippet}
							</DayDrop>
						{/each}
					</ol>
				</div>
			</li>
		{/snippet}
	</DayDrop>
{/snippet}

<Card.Root class="@container/entries gap-0 overflow-hidden py-0">
	<!-- One fixed row, so the actions appearing never move the list. -->
	<Card.Header
		class="flex h-14 items-center justify-between gap-3 border-b px-4 py-0 [.border-b]:pb-0"
	>
		<Card.Title class="whitespace-nowrap">Days logged</Card.Title>
		{#if selectedHere.length > 0}
			<!-- Centred in the row, where Card.Action would sit at its top. -->
			<Card.Action class="flex items-center gap-2 self-center">
				<!-- On a narrow card the count moves into the button, so neither wraps. -->
				<span
					class="hidden text-sm whitespace-nowrap text-muted-foreground tabular-nums @xs/card-header:inline"
				>
					{selectedHere.length} selected
				</span>
				<Button variant="outline" size="sm" onclick={() => (moving = [...selectedHere])}>
					<CalendarArrowUp />Move<span class="tabular-nums @xs/card-header:hidden"
						>{selectedHere.length}<span class="sr-only"> selected</span></span
					>
				</Button>
				<Button variant="ghost" size="icon-sm" onclick={clearSelection}>
					<X />
					<span class="sr-only">Clear selection</span>
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	{#if days.length === 0}
		<p class="p-6 text-center text-sm text-muted-foreground">Nothing logged this month yet.</p>
	{:else}
		<DragDropProvider
			{sensors}
			{plugins}
			onDragStart={({ operation: { source } }) =>
				(dragging = source ? String(source.id) : undefined)}
			onDragOver={({ operation: { target } }) => (over = target ? String(target.id) : undefined)}
			onDragEnd={({ operation: { source, target }, canceled }) => {
				const date = target && dropDate(String(target.id));
				if (!canceled && source && date) drop(String(source.id), date);
				dragging = undefined;
				over = undefined;
			}}
		>
			<ol>
				{#if gaps['']}
					{@render gap('', gaps[''])}
				{/if}
				{#each days as day (day.date)}
					<DayDrop date={day.date} disabled={!draggingEntry || day.date === draggingEntry.date}>
						{#snippet children(dropZone)}
							<li
								{@attach dropZone.attach}
								class={[
									'relative border-b transition-colors last:border-b-0',
									dropZone.isDropTarget &&
										'bg-primary/5 outline-2 -outline-offset-2 outline-primary'
								]}
							>
								<!-- The day's total lines up with each entry's hours, as their sum. -->
								<div
									class={[
										'relative flex items-baseline justify-between gap-3 border-b bg-muted/50 py-1.5 pr-14 pl-4 text-sm',
										day.entries.length > 0 && 'pl-16'
									]}
								>
									{#if day.entries.length > 0}
										{const ids = $derived(day.entries.map((entry) => entry.id))}
										{const count = $derived(ids.filter((id) => selected.includes(id)).length)}
										<Checkbox
											class="absolute top-1/2 left-10 -translate-y-1/2"
											checked={count === ids.length}
											indeterminate={count > 0 && count < ids.length}
											onCheckedChange={(checked) => select(ids, checked)}
											aria-label="Select every entry on {dayFormat.format(parseIsoDate(day.date))}"
										/>
									{/if}
									<div class="flex min-w-0 items-baseline gap-2">
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
									</div>
									<span class="whitespace-nowrap tabular-nums">
										<span class="font-semibold">{formatHours(day.logged)}</span
										>{#if day.expected}<span class="text-muted-foreground"
												>{` / ${formatHours(day.expected)}`}</span
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
														tasks={taskNames(store.data)}
														onhidetask={(text) => store.hideTask(text)}
														date={entry.date}
														onsave={(changes) => {
															store.updateEntry({ ...changes, id: entry.id });
															editing = undefined;
														}}
														oncancel={() => (editing = undefined)}
													/>
												</li>
											{:else}
												<EntryDrag id={entry.id}>
													{#snippet children(drag)}
														<EntryRow
															{@attach drag.attach}
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
															pastMidnight={startsPastMidnight({ day: day.worked, entry })}
															class={[
																entry.id === justAdded && 'just-added',
																drag.isDragging && 'rounded-md bg-card ring-1 ring-border',
																drag.isDragging &&
																	(draggedIds.length > 1
																		? // Cards stacked behind the one in hand, for the others going with it.
																			'shadow-[5px_5px_0_-1px_var(--card),5px_5px_0_0_var(--border),10px_10px_0_-1px_var(--card),10px_10px_0_0_var(--border),0_10px_15px_-3px_rgb(0_0_0/0.1)]'
																		: 'shadow-lg'),
																!drag.isDragging &&
																	draggedIds.includes(entry.id) &&
																	'opacity-40 transition-opacity'
															]}
															onanimationend={() => (justAdded = undefined)}
															selected={selected.includes(entry.id)}
															onselectedchange={(checked) => select([entry.id], checked)}
															onedit={() => (editing = entry.id)}
															onmove={() => (moving = [entry.id])}
															onremove={() => (removing = entry.id)}
														>
															{#snippet handle()}
																<Button
																	variant="ghost"
																	size="icon"
																	{@attach drag.attachHandle}
																	class="relative size-7 cursor-grab touch-none text-muted-foreground after:absolute after:inset-x-0 after:-inset-y-1.5 hover:bg-transparent hover:text-foreground active:cursor-grabbing"
																>
																	<GripVertical aria-hidden="true" />
																	<span class="sr-only">Drag to another day</span>
																</Button>
																{#if drag.isDragging && draggedIds.length > 1}
																	<span
																		class="absolute -top-2.5 -left-1.5 rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-foreground tabular-nums"
																		aria-hidden="true">{draggedIds.length}</span
																	>
																{/if}
															{/snippet}
														</EntryRow>
													{/snippet}
												</EntryDrag>
											{/if}
										{/each}
									</ul>
								{/if}
							</li>
						{/snippet}
					</DayDrop>
					{#if gaps[day.date]}
						{@render gap(day.date, gaps[day.date]!)}
					{/if}
				{/each}
			</ol>
		</DragDropProvider>
	{/if}
</Card.Root>

<Dialog.Root bind:open={() => moving !== undefined, (open) => !open && (moving = undefined)}>
	<Dialog.Content>
		{#if moving && movingEntries.length > 0}
			<Dialog.Header>
				<Dialog.Title>
					Move {moving.length === 1 ? 'this entry' : `${moving.length} entries`}
				</Dialog.Title>
			</Dialog.Header>
			<MoveEntriesForm
				entries={movingEntries}
				onmove={(date) => {
					store.moveEntries({ date, ids: moving! });
					select(moving!, false);
					moving = undefined;
				}}
				oncancel={() => (moving = undefined)}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>

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
