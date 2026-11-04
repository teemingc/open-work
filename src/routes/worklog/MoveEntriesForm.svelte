<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { untrack } from 'svelte';

	let {
		date,
		onmove,
		oncancel
	}: {
		/** The day picked to start with. */
		date: string;
		onmove: (date: string) => void;
		oncancel: () => void;
	} = $props();

	const id = $props.id();
	let target = $state(untrack(() => date));
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
