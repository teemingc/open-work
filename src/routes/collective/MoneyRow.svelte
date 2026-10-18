<script lang="ts">
	let {
		value,
		name,
		color,
		money
	}: { value: number; name: string; color?: string; money: Intl.NumberFormat } = $props();
</script>

<div class="flex w-full items-center gap-2">
	<span class="size-2.5 shrink-0 rounded-[2px]" style:background={color}></span>
	<span class="flex-1 text-muted-foreground">{name}</span>
	<span class="font-mono font-medium text-foreground tabular-nums"
		>{money.format(Math.abs(value))}</span
	>
</div>
