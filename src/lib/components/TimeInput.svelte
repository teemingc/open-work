<script lang="ts">
	import { Time } from '@internationalized/date';
	import { TimeField } from 'bits-ui';

	let {
		value = $bindable(''),
		label,
		aside
	}: {
		/** "22:30", or empty for none. */
		value?: string;
		label: string;
		/** Shown at the end of the label's line. */
		aside?: string;
	} = $props();

	// Follows `value`, and holds a time typed halfway until it is whole.
	let time = $derived.by(() => {
		const [hour, minute] = value.split(':').map(Number);
		return value ? new Time(hour, minute) : undefined;
	});

	function change(next: Time | undefined) {
		value = next
			? `${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')}`
			: '';
	}
</script>

<!-- Always a 12-hour clock with AM and PM, whatever the browser's language would show. -->
<div class="space-y-1.5">
	<TimeField.Root
		bind:value={time}
		onValueChange={change}
		hourCycle={12}
		granularity="minute"
		locale="en-US"
	>
		<div class="flex items-baseline justify-between gap-2">
			<TimeField.Label class="block text-sm leading-none font-medium select-none">
				{label}
			</TimeField.Label>
			{#if aside}
				<span class="text-sm leading-none text-muted-foreground tabular-nums">{aside}</span>
			{/if}
		</div>
		<TimeField.Input
			class="flex min-h-9 w-full flex-wrap items-center rounded-md border border-input bg-card px-3 text-sm tabular-nums transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 pointer-coarse:min-h-10"
		>
			{#snippet children({ segments })}
				{#each segments as { part, value }, index (index)}
					<TimeField.Segment
						{part}
						class={[
							'rounded-sm px-px outline-none focus:bg-accent focus:text-accent-foreground data-placeholder:text-muted-foreground',
							part === 'literal' && 'px-0 text-muted-foreground'
						]}
					>
						{value}
					</TimeField.Segment>
				{/each}
			{/snippet}
		</TimeField.Input>
	</TimeField.Root>
</div>
