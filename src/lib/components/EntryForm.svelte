<script lang="ts" module>
	import type { WorkRef as Ref } from '#lib/worklog.js';

	const DRAFT_KEY = 'worklog:draft';

	type Draft = {
		date: string;
		clientId: string;
		start: string;
		end: string;
		startChanged: boolean;
		endChanged: boolean;
		hours?: number;
		items: Ref[];
		itemText: string;
	};

	/** The new entry left unsaved in this browser, if any. */
	function readDraft(): Draft | undefined {
		try {
			const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
			return draft && typeof draft.date === 'string' && Array.isArray(draft.items)
				? draft
				: undefined;
		} catch {
			return undefined;
		}
	}
</script>

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
	import { Plus, Trash2 } from '@lucide/svelte';
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

	// The form starts from these and then owns its values, so it can be edited and cancelled. A new
	// entry starts from the one left unsaved, so one begun in the morning is still there at the end of
	// the day, even after the app was closed.
	const initial = untrack(() => {
		const draft = entry ? undefined : readDraft();
		const start = entry ? (entry.start ?? '') : (draft?.start ?? nextStart(date));
		return {
			date: entry?.date ?? (draft && draft.date !== date ? draft.date : undefined),
			clientId:
				(draft && clients.some((other) => other.id === draft.clientId) && draft.clientId) ||
				entry?.clientId ||
				clientId ||
				clients[0]?.id ||
				'',
			start,
			end: entry ? (entry.end ?? '') : (draft?.end ?? start),
			startChanged: !!draft?.startChanged,
			endChanged: !!entry || !!draft?.endChanged,
			hours: entry?.hours ?? draft?.hours,
			rate: entry?.rate,
			items: entry?.items ?? draft?.items ?? [],
			itemText: draft?.itemText ?? '',
			editing: !!entry
		};
	});

	const id = $props.id();
	// A new entry is on the given date, following it as days pass, until another is picked. A date
	// picked is dropped when the given date moves to another month, and the rest of the form is kept.
	const dateMonth = $derived(date.slice(0, 7));
	let pickedDate = $derived.by(() => {
		void dateMonth;
		return untrack(() => initial.date);
	});
	const rowDate = $derived(pickedDate ?? date);
	let rowClient = $state(initial.clientId);
	let rowStart = $state(initial.start);
	let rowEnd = $state(initial.end);
	// Until the start is changed by hand, it is the hour the form opened in.
	let startChanged = $state(initial.startChanged);
	// Until the end is changed by hand, it follows the start.
	let endChanged = $state(initial.endChanged);
	let rowHours = $state<number | undefined>(initial.hours);
	const items: WorkRef[] = $state([...initial.items]);
	let itemText = $state(initial.itemText);

	const parsed = $derived(parseRef({ input: itemText, organization }));
	const timesValid = $derived(!rowStart === !rowEnd);
	const timed = $derived(!!rowStart && !!rowEnd);
	const hours = $derived(entryHours({ start: rowStart, end: rowEnd, hours: rowHours }));
	const client = $derived(clients.find((other) => other.id === rowClient));
	const canSave = $derived(
		!!rowDate && !!rowClient && timesValid && (hours > 0 || items.length > 0 || !!parsed)
	);

	// A new entry being typed is kept in this browser until it is logged, or emptied.
	if (!initial.editing) {
		$effect(() => {
			const draft: Draft = {
				date: rowDate,
				clientId: rowClient,
				start: rowStart,
				end: rowEnd,
				startChanged,
				endChanged,
				hours: rowHours,
				items: $state.snapshot(items),
				itemText
			};
			const begun =
				startChanged || endChanged || !!rowHours || items.length > 0 || itemText.trim() !== '';
			try {
				if (begun) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
				else localStorage.removeItem(DRAFT_KEY);
			} catch {
				// Without storage the draft lasts as long as the page.
			}
		});
	}

	function changeStart(value: string) {
		rowStart = value;
		startChanged = true;
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
			startChanged = false;
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
		<Input
			id="{id}-date"
			type="date"
			required
			bind:value={() => rowDate, (value) => (pickedDate = value)}
		/>
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

	<!-- Always a line of text, so typing a task never takes the hint away and moves the form. -->
	<p
		id="{id}-item-hint"
		class="col-span-2 min-h-lh text-xs text-muted-foreground"
		aria-live="polite"
	>
		{#if !timesValid}
			<span class="text-destructive">Enter both a start and an end, or neither.</span>
		{:else if itemText.trim() && !parsed}
			<span class="text-destructive">
				That GitHub URL is missing the pull request or issue number.
			</span>
		{:else if parsed && parsed.kind !== 'task'}
			{describeRef(parsed)}
		{:else}
			A GitHub URL, or a task like a meeting.
		{/if}
	</p>

	{#if items.length > 0}
		<!-- One item a row, so a long list reads down one edge rather than wherever each tag fits. -->
		<ul class="col-span-2 divide-y rounded-md border bg-background">
			{#each items as item, index (refKey(item))}
				<li class="flex min-w-0 items-center justify-between gap-2 py-1 pr-1 pl-3 text-sm">
					<WorkItem ref={item} {organization} />
					<Button
						type="button"
						variant="ghost"
						size="icon"
						class="relative size-6 after:absolute after:-inset-2 pointer-coarse:size-6"
						onclick={() => items.splice(index, 1)}
					>
						<Trash2 size={12} />
						<span class="sr-only">Remove {describeRef(item)}</span>
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	<!-- On phones the buttons take the full width, as in shadcn's form blocks, with the main one first. -->
	<div class="col-span-2 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
		{#if oncancel}
			<Button type="button" variant="ghost" onclick={oncancel}>Cancel</Button>
		{/if}
		<Button type="submit" disabled={!canSave}>{entry ? 'Save' : 'Log it'}</Button>
	</div>
</form>
