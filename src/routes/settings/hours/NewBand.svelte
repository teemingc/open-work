<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import type { Band } from '#lib/worklog.js';
	import { Plus } from '@lucide/svelte';

	let {
		id,
		from,
		hint,
		onadd
	}: {
		id: string;
		from: number;
		/** The id of the text saying what an empty top means. */
		hint?: string;
		onadd: (band: Band) => void;
	} = $props();

	let upTo = $state<number | null>(null);
	let rate = $state<number | null>(null);

	function add(event: SubmitEvent) {
		event.preventDefault();
		if (rate === null) return;
		onadd({ upTo: upTo ?? undefined, rate: Math.min(rate, 100) });
		upTo = null;
		rate = null;
	}
</script>

<form class="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-end gap-2" onsubmit={add}>
	<div class="space-y-1.5">
		<Label for="{id}-up-to" class="font-normal">From {from.toLocaleString('en')} up to</Label>
		<Input
			id="{id}-up-to"
			type="number"
			inputmode="decimal"
			min={from}
			aria-describedby={hint}
			class="tabular-nums"
			bind:value={upTo}
		/>
	</div>
	<div class="space-y-1.5">
		<Label for="{id}-rate" class="font-normal">Rate (%)</Label>
		<Input
			id="{id}-rate"
			type="number"
			inputmode="decimal"
			min="0"
			max="100"
			step="0.1"
			required
			class="tabular-nums"
			bind:value={rate}
		/>
	</div>
	<Button type="submit" variant="outline" size="icon">
		<Plus size={16} />
		<span class="sr-only">Add the band</span>
	</Button>
</form>
