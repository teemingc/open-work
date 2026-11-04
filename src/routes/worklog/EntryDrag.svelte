<script lang="ts">
	import { createDraggable } from '@dnd-kit/svelte';
	import type { Snippet } from 'svelte';

	let {
		id,
		children
	}: {
		/** The entry's id. */
		id: string;
		children: Snippet<[ReturnType<typeof createDraggable>]>;
	} = $props();

	const drag = createDraggable({
		get id() {
			return id;
		}
	});
</script>

{@render children(drag)}
