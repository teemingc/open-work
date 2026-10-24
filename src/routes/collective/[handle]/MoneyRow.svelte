<script lang="ts">
	let {
		value,
		name,
		color,
		money
	}: { value: number; name: string; color?: string; money: Intl.NumberFormat } = $props();
</script>

<div class="flex w-full items-center gap-2">
	<!-- No swatch without a colour, where an empty one indented the name. -->
	{#if color}
		<span class="size-2.5 shrink-0 rounded-[2px]" style:background={color}></span>
	{/if}
	<span class="max-w-44 min-w-0 flex-1 truncate text-muted-foreground">{name}</span>
	<span class="font-medium text-foreground tabular-nums">{money.format(Math.abs(value))}</span>
</div>
