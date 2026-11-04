<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '#lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-header"
	class={cn(
		// Clear of the close button: on both sides while centred, so the text stays in the middle.
		'flex flex-col gap-2 px-4 text-center sm:ps-0 sm:pe-4 sm:text-start',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
