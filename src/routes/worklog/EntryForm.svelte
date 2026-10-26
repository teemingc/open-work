<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import WorkItem from '#lib/components/WorkItem.svelte';
	import { formatHours } from '#lib/format.js';
	import {
		describeRef,
		entryHours,
		parseRef,
		rateOn,
		refKey,
		type Client,
		type WorkLogEntry,
		type WorkRef
	} from '#lib/worklog.js';
	import { Plus, X } from '@lucide/svelte';
	import { untrack } from 'svelte';

	let {
		clients,
		organization,
		entry,
		date,
		clientId,
		onsave,
		oncancel
	}: {
		clients: Client[];
		organization?: string;
		/** The entry being edited. Without one, the form adds a new entry. */
		entry?: WorkLogEntry;
		/** Starting values for a new entry. */
		date: string;
		clientId?: string;
		onsave: (entry: Omit<WorkLogEntry, 'id'>) => void;
		oncancel?: () => void;
	} = $props();

	// The form starts from these and then owns its values, so it can be edited and cancelled.
	const initial = untrack(() => ({
		date: entry?.date ?? date,
		clientId: entry?.clientId ?? clientId ?? clients[0]?.id ?? '',
		start: entry?.start ?? '',
		end: entry?.end ?? '',
		hours: entry?.hours,
		rate: entry?.rate,
		items: entry?.items ?? []
	}));

	const id = $props.id();
	let rowDate = $state(initial.date);
	let rowClient = $state(initial.clientId);
	let rowStart = $state(initial.start);
	let rowEnd = $state(initial.end);
	let rowHours = $state<number | undefined>(initial.hours);
	let rowRate = $state<number | undefined>(initial.rate);
	const items: WorkRef[] = $state([...initial.items]);
	let itemText = $state('');

	const parsed = $derived(parseRef({ input: itemText, organization }));
	const timesValid = $derived(!rowStart === !rowEnd);
	const timed = $derived(!!rowStart && !!rowEnd);
	const hours = $derived(entryHours({ start: rowStart, end: rowEnd, hours: rowHours }));
	const client = $derived(clients.find((other) => other.id === rowClient));
	const clientName = $derived(client?.name);
	const clientRate = $derived(client && rowDate ? rateOn(client, rowDate) : undefined);
	const ownRate = $derived(typeof rowRate === 'number' && rowRate >= 0 ? rowRate : undefined);
	const canSave = $derived(
		!!rowDate && !!rowClient && timesValid && (hours > 0 || items.length > 0 || !!parsed)
	);

	function addItem(): boolean {
		if (!parsed) return false;
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
			...(ownRate !== undefined ? { rate: ownRate } : {}),
			items: $state.snapshot(items)
		});
		if (!entry) {
			// The next block usually follows on the same day, for the same client.
			rowStart = '';
			rowEnd = '';
			rowHours = undefined;
			rowRate = undefined;
			items.length = 0;
		}
	}
</script>

<form
	class="grid grid-cols-2 gap-3"
	aria-label={entry ? 'Edit entry' : 'Log work'}
	onsubmit={(event) => {
		event.preventDefault();
		save();
	}}
>
	<div class="space-y-1.5">
		<Label for="{id}-date">Date</Label>
		<Input id="{id}-date" type="date" required bind:value={rowDate} class="block" />
	</div>
	<div class="space-y-1.5">
		<Label for="{id}-client">Client</Label>
		<Select.Root type="single" bind:value={rowClient}>
			<Select.Trigger id="{id}-client" class="w-full">{clientName ?? 'Choose one'}</Select.Trigger>
			<Select.Content>
				{#each clients as client (client.id)}
					<Select.Item value={client.id}>{client.name}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
	<div class="space-y-1.5">
		<Label for="{id}-start">Start</Label>
		<Input id="{id}-start" type="time" step="900" bind:value={rowStart} class="block" />
	</div>
	<div class="space-y-1.5">
		<Label for="{id}-end">End</Label>
		<Input id="{id}-end" type="time" step="900" bind:value={rowEnd} class="block" />
	</div>

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
	<div class="space-y-1.5">
		<Label for="{id}-rate">Rate per hour{client ? ` (${client.currency})` : ''}</Label>
		<Input
			id="{id}-rate"
			type="number"
			inputmode="decimal"
			min="0"
			step="0.01"
			class="tabular-nums"
			placeholder={clientRate === undefined ? undefined : String(clientRate)}
			aria-describedby="{id}-rate-hint"
			bind:value={rowRate}
		/>
		<p id="{id}-rate-hint" class="text-xs text-muted-foreground">
			Leave empty to use the client's rate on this date.
		</p>
	</div>

	<div class="col-span-2 space-y-1.5">
		<Label for="{id}-item">What you worked on</Label>
		<div class="flex gap-2">
			<Input
				id="{id}-item"
				bind:value={itemText}
				placeholder="owner/repo/pull/123"
				autocomplete="off"
				spellcheck={false}
				aria-describedby="{id}-item-hint"
				aria-invalid={itemText.trim() !== '' && !parsed}
				onkeydown={(event) => {
					// Enter adds the item; saving the entry is its own button.
					if (event.key === 'Enter' && itemText.trim()) {
						event.preventDefault();
						addItem();
					}
				}}
			/>
			<Button type="button" variant="outline" onclick={addItem} disabled={!parsed}>
				<Plus /> Add item
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
		{:else if parsed}
			{describeRef(parsed)}. Press Enter to add it.
		{:else}
			A GitHub link or path like <code class="font-mono">owner/repo/pull/123</code>, or a task like
			a meeting. Add as many as you worked on in this block.
		{/if}
	</p>

	{#if items.length > 0}
		<ul class="col-span-2 flex flex-wrap gap-1.5" aria-label="Items in this entry">
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
						aria-label="Remove {describeRef(item)}"
						onclick={() => items.splice(index, 1)}
					>
						<X size={12} />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="col-span-2 flex items-center justify-end gap-2">
		{#if hours > 0}
			<span class="mr-auto text-sm text-muted-foreground tabular-nums">{formatHours(hours)} h</span>
		{/if}
		{#if oncancel}
			<Button type="button" variant="ghost" onclick={oncancel}>Cancel</Button>
		{/if}
		<Button type="submit" disabled={!canSave}>{entry ? 'Save' : 'Log it'}</Button>
	</div>
</form>
