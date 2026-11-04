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
	data-slot="card"
	class={cn(
		'flex flex-col gap-(--card-padding) rounded-xl border bg-card py-(--card-padding) text-card-foreground [--card-padding:--spacing(4)] sm:[--card-padding:--spacing(6)]',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
