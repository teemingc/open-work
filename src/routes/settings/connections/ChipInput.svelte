<script lang="ts">
	import { X } from '@lucide/svelte';

	let {
		id,
		values,
		placeholder,
		onchange
	}: {
		id: string;
		/** Mutated in place, so pass reactive state. */
		values: string[];
		placeholder?: string;
		/** Called after a value is added or removed. */
		onchange?: () => void;
	} = $props();

	let text = $state('');

	function commit() {
		const before = values.length;
		for (const part of text.split(/[\s,]+/)) {
			// Accept "owner/repo" as well as "repo".
			const name = part.split('/').pop()?.trim();
			if (name && !values.includes(name)) values.push(name);
		}
		text = '';
		if (values.length !== before) onchange?.();
	}

	function remove(name: string) {
		const index = values.indexOf(name);
		if (index === -1) return;
		values.splice(index, 1);
		onchange?.();
	}
</script>

<div
	class="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-[3px] focus-within:ring-ring/40"
>
	{#each values as name (name)}
		<span class="flex items-center gap-1 rounded bg-secondary py-0.5 pr-1 pl-2 text-sm">
			{name}
			<button
				type="button"
				class="grid size-5 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
				aria-label="Remove {name}"
				onclick={() => remove(name)}
			>
				<X size={12} />
			</button>
		</span>
	{/each}
	<input
		{id}
		bind:value={text}
		{placeholder}
		class="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
		onkeydown={(event) => {
			if (event.key === 'Enter' || event.key === ',') {
				event.preventDefault();
				commit();
			} else if (event.key === 'Backspace' && text === '' && values.length > 0) {
				values.pop();
				onchange?.();
			}
		}}
		onblur={commit}
		onchange={(event) => {
			// The typed text is not a value until it is committed.
			event.stopPropagation();
		}}
	/>
</div>
