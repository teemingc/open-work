<script lang="ts">
	import { pointerIntersection } from '@dnd-kit/collision';
	import { createDroppable } from '@dnd-kit/svelte';
	import { untrack, type Snippet } from 'svelte';

	let {
		date,
		disabled,
		priority,
		pointer = false,
		children
	}: {
		date: string;
		disabled: boolean;
		/** Wins over days it overlaps, as the gap between two days does. */
		priority?: number;
		/** Hit only where the pointer is, not wherever the dragged entry overlaps it. */
		pointer?: boolean;
		children: Snippet<[ReturnType<typeof createDroppable>]>;
	} = $props();

	const drop = createDroppable({
		// Fixed when the drop zone appears, so they never need to follow a change.
		collisionPriority: untrack(() => priority),
		collisionDetector: untrack(() => (pointer ? pointerIntersection : undefined)),
		get id() {
			return date;
		},
		get disabled() {
			return disabled;
		}
	});
</script>

{@render children(drop)}
