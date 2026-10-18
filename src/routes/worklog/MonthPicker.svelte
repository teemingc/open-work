<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { ChevronDown, ChevronLeft, ChevronRight } from '@lucide/svelte';

	let {
		month,
		current,
		label
	}: {
		/** The month on screen, as "YYYY-MM". */
		month: string;
		/** This month, as "YYYY-MM". */
		current: string;
		/** The month written out, like "October 2026". */
		label: string;
	} = $props();

	const MONTHS = Array.from({ length: 12 }, (_, i) =>
		new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(2026, i, 1))
	);

	let open = $state(false);
	/** The year the grid shows. Starts at the month on screen each time the picker opens. */
	let year = $state(0);

	function key(y: number, index: number): string {
		return `${y}-${String(index + 1).padStart(2, '0')}`;
	}

	function choose(next: string) {
		open = false;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query string
		void goto(`${resolve('/worklog')}?month=${next}`);
	}
</script>

<h1>
	<Popover.Root
		bind:open
		onOpenChange={(next) => {
			if (next) year = Number(month.slice(0, 4));
		}}
	>
		<Popover.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					class="-mx-2 flex items-center gap-1.5 rounded-md px-2 hover:bg-accent"
					aria-label="Choose a month, showing {label}"
				>
					{label}
					<ChevronDown class="size-5 text-muted-foreground" aria-hidden="true" />
				</button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-64 p-3" align="start">
			<div class="mb-2 flex items-center justify-between">
				<Button
					variant="ghost"
					size="icon"
					class="size-8"
					aria-label="Previous year"
					onclick={() => year--}
				>
					<ChevronLeft />
				</Button>
				<span class="text-sm font-medium tabular-nums" aria-live="polite">{year}</span>
				<Button
					variant="ghost"
					size="icon"
					class="size-8"
					aria-label="Next year"
					onclick={() => year++}
				>
					<ChevronRight />
				</Button>
			</div>
			<div class="grid grid-cols-3 gap-1">
				{#each MONTHS as name, index (name)}
					{@const value = key(year, index)}
					<Button
						variant={value === month ? 'default' : 'ghost'}
						size="sm"
						class={value === current && value !== month ? 'font-semibold underline' : ''}
						aria-current={value === month ? 'date' : undefined}
						onclick={() => choose(value)}
					>
						{name}
					</Button>
				{/each}
			</div>
		</Popover.Content>
	</Popover.Root>
</h1>
