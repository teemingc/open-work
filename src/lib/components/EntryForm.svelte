<script lang="ts">
	import ClientName from '#lib/components/ClientName.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import WorkItem from '#lib/components/WorkItem.svelte';
	import { hiddenTasks, hideTask, showTask } from '#lib/hidden-tasks.svelte.js';
	import { formatHours, toIsoDate } from '#lib/format.js';
	import {
		describeRef,
		entryHours,
		latestEnd,
		parseRef,
		refKey,
		type Client,
		type WorkLogEntry,
		type WorkRef
	} from '#lib/worklog.js';
	import { snapshot } from '$app/navigation';
	import { Plus, X } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import SuggestInput from './SuggestInput.svelte';
	import TimeInput from './TimeInput.svelte';

	let {
		clients,
		organization,
		tasks = [],
		entries = [],
		entry,
		date,
		clientId,
		onsave,
		oncancel
	}: {
		clients: Client[];
		organization?: string;
		/** Task names to suggest while typing an item. */
		tasks?: string[];
		/** Logged entries, so a new one doesn't start before the last one on its day ends. */
		entries?: Pick<WorkLogEntry, 'date' | 'start' | 'end'>[];
		/** The entry being edited. Without one, the form adds a new entry. */
		entry?: WorkLogEntry;
		/** Starting values for a new entry. */
		date: string;
		clientId?: string;
		onsave: (entry: Omit<WorkLogEntry, 'id'>) => void;
		oncancel?: () => void;
	} = $props();

	/** The current hour, or the end of today's last entry if that is later. */
	function nextStart(day: string): string {
		const today = new Date();
		const now = `${String(today.getHours()).padStart(2, '0')}:00`;
		if (day !== toIsoDate(today)) return now;
		const last = latestEnd({ entries, date: day });
		return last && last > now ? last : now;
	}

	// The form starts from these and then owns its values, so it can be edited and cancelled.
	const initial = untrack(() => ({
		date: entry?.date ?? date,
		clientId: entry?.clientId ?? clientId ?? clients[0]?.id ?? '',
		start: entry ? (entry.start ?? '') : nextStart(date),
		end: entry ? (entry.end ?? '') : nextStart(date),
		hours: entry?.hours,
		rate: entry?.rate,
		items: entry?.items ?? [],
		editing: !!entry
	}));

	const id = $props.id();
	let rowDate = $state(initial.date);
	let rowClient = $state(initial.clientId);
	let rowStart = $state(initial.start);
	let rowEnd = $state(initial.end);
	// Until the end is changed by hand, it follows the start.
	let endChanged = $state(initial.editing);
	let rowHours = $state<number | undefined>(initial.hours);
	const items: WorkRef[] = $state([...initial.items]);
	let itemText = $state('');

	const parsed = $derived(parseRef({ input: itemText, organization }));
	const timesValid = $derived(!rowStart === !rowEnd);
	const timed = $derived(!!rowStart && !!rowEnd);
	const hours = $derived(entryHours({ start: rowStart, end: rowEnd, hours: rowHours }));
	const client = $derived(clients.find((other) => other.id === rowClient));
	const canSave = $derived(
		!!rowDate && !!rowClient && timesValid && (hours > 0 || items.length > 0 || !!parsed)
	);

	// A new entry being typed is kept through a reload, or when you come back to it, within this tab.
	if (!initial.editing) {
		snapshot({
			id: 'new-entry',
			capture: () => ({
				date: rowDate,
				clientId: rowClient,
				start: rowStart,
				end: rowEnd,
				endChanged,
				hours: rowHours,
				items: $state.snapshot(items),
				itemText
			}),
			restore: (value) => {
				rowDate = value.date;
				rowClient = value.clientId;
				rowStart = value.start;
				rowEnd = value.end;
				endChanged = value.endChanged;
				rowHours = value.hours;
				items.splice(0, items.length, ...value.items);
				itemText = value.itemText;
			}
		});
	}

	function changeStart(value: string) {
		rowStart = value;
		if (!endChanged || (value && rowEnd && rowEnd < value)) rowEnd = value;
	}

	function addItem(): boolean {
		if (!parsed) return false;
		if (parsed.kind === 'task') showTask(parsed.text);
		const key = refKey(parsed);
		if (!items.some((item) => refKey(item) === key)) items.push(parsed);
		itemText = '';
		return true;
	}

	function save() {
		// Something typed but not added yet still counts.
		addItem();
		if (!canSave) return;
		onsave({
			date: rowDate,
			clientId: rowClient,
			...(timed ? { start: rowStart, end: rowEnd } : {}),
			...(!timed && rowHours ? { hours: rowHours } : {}),
			// An entry given its own rate before rates were set only on the client keeps it.
			...(initial.rate !== undefined && rowClient === initial.clientId
				? { rate: initial.rate }
				: {}),
			items: $state.snapshot(items)
		});
		if (!entry) {
			// The next block usually follows on the same day, for the same client.
			rowStart = nextStart(rowDate);
			rowEnd = rowStart;
			endChanged = false;
			rowHours = undefined;
			items.length = 0;
		}
	}
</script>

<form
	class="grid grid-cols-2 gap-3"
	onsubmit={(event) => {
		event.preventDefault();
		save();
	}}
>
	<!-- Date and client each take the full width on a phone, where a pair of them is too narrow to read. -->
	<div class="col-span-2 space-y-1.5 sm:col-span-1">
		<Label for="{id}-date">Date</Label>
		<Input id="{id}-date" type="date" required bind:value={rowDate} class="block" />
	</div>
	<div class="col-span-2 space-y-1.5 sm:col-span-1">
		<Label for="{id}-client">Client</Label>
		<Select.Root type="single" bind:value={rowClient}>
			<Select.Trigger id="{id}-client" class="w-full"
				>{#if client}<ClientName {client} />{:else}Choose one{/if}</Select.Trigger
			>
			<Select.Content>
				{#each clients as client (client.id)}
					<Select.Item value={client.id} label={client.name}><ClientName {client} /></Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<TimeInput label="Start" bind:value={() => rowStart, changeStart} />
	<TimeInput
		label="End"
		aside={timed && hours > 0 ? `${formatHours(hours)} h` : undefined}
		bind:value={
			() => rowEnd,
			(value) => {
				rowEnd = value;
				endChanged = true;
			}
		}
	/>

	{#if !timed}
		<div class="space-y-1.5">
			<Label for="{id}-hours">Or hours</Label>
			<Input
				id="{id}-hours"
				type="number"
				inputmode="decimal"
				min="0"
				step="0.5"
				class="tabular-nums"
				bind:value={rowHours}
			/>
		</div>
	{/if}

	<div class="col-span-2 space-y-1.5">
		<Label for="{id}-item">What you worked on</Label>
		<div class="flex gap-2">
			<SuggestInput
				id="{id}-item"
				bind:value={itemText}
				suggestions={tasks.filter(
					(task) =>
						!hiddenTasks.has(task) &&
						!items.some((item) => item.kind === 'task' && item.text === task)
				)}
				onpick={(task) => {
					itemText = task;
					addItem();
				}}
				onremove={hideTask}
				spellcheck={false}
				aria-describedby="{id}-item-hint"
				aria-invalid={itemText.trim() !== '' && !parsed}
				onkeydown={(event) => {
					// Enter adds the item; saving the entry is its own button.
					if (event.key === 'Enter' && !event.defaultPrevented && itemText.trim()) {
						event.preventDefault();
						addItem();
					}
				}}
			/>
			<Button type="button" variant="outline" onclick={addItem} disabled={!parsed}>
				<Plus /> <span class="max-sm:sr-only">Add item</span>
			</Button>
		</div>
	</div>

	<p id="{id}-item-hint" class="col-span-2 text-xs text-muted-foreground" aria-live="polite">
		{#if !timesValid}
			<span class="text-destructive">Enter both a start and an end, or neither.</span>
		{:else if itemText.trim() && !parsed}
			<span class="text-destructive">
				That looks like a GitHub path but is missing a number, like owner/repo/pull/123.
			</span>
		{:else if parsed && parsed.kind !== 'task'}
			{describeRef(parsed)}
		{:else if !itemText.trim()}
			A GitHub path like owner/repo/pull/123, or a task like a meeting.
		{/if}
	</p>

	{#if items.length > 0}
		<ul class="col-span-2 flex flex-wrap gap-1.5">
			{#each items as item, index (refKey(item))}
				<li
					class="flex max-w-full items-center gap-1 rounded-md border bg-background py-0.5 pr-0.5 pl-2 text-sm"
				>
					<WorkItem ref={item} {organization} />
					<Button
						type="button"
						variant="ghost"
						size="icon"
						class="size-6"
						onclick={() => items.splice(index, 1)}
					>
						<X size={12} />
						<span class="sr-only">Remove {describeRef(item)}</span>
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="col-span-2 flex items-center justify-end gap-2">
		{#if oncancel}
			<Button type="button" variant="ghost" onclick={oncancel}>Cancel</Button>
		{/if}
		<Button type="submit" disabled={!canSave}>{entry ? 'Save' : 'Log it'}</Button>
	</div>
</form>
