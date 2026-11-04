<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { addDays } from '#lib/format.js';
	import type { WorkLogEntry } from '#lib/worklog.js';
	import { untrack } from 'svelte';

	let {
		entries,
		onmove,
		oncancel
	}: {
		/** The entries being moved. */
		entries: Pick<WorkLogEntry, 'date'>[];
		onmove: (date: string) => void;
		oncancel: () => void;
	} = $props();

	const id = $props.id();

	/** The day before the earliest, as the likeliest place for work logged a day late. */
	let target = $state(untrack(() => addDays(entries.map((entry) => entry.date).sort()[0], -1)));
</script>

<form
	class="flex flex-col gap-4"
	onsubmit={(event) => {
		event.preventDefault();
		if (target) onmove(target);
	}}
>
	<div class="space-y-1.5">
		<Label for="{id}-date">Date</Label>
		<Input id="{id}-date" type="date" required bind:value={target} class="block" />
	</div>

	<Dialog.Footer>
		<Button type="button" variant="outline" onclick={oncancel}>Cancel</Button>
		<Button type="submit" disabled={!target}>Move</Button>
	</Dialog.Footer>
</form>
