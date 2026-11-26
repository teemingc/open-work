<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { addMonths } from '#lib/worklog.js';
	import { ChevronDown, ChevronLeft, ChevronRight } from '@lucide/svelte';

	let {
		path,
		month,
		current,
		label
	}: {
		/** The page whose `?month=` the picker steps through. */
		path: '/worklog' | '/work';
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

	/** The month abbreviated, like "Oct 2026", for phones where the full name would wrap. */
	const short = $derived(
		new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(
			new Date(`${month}-01T00:00:00`)
		)
	);

	const id = $props.id();

	let open = $state(false);
	/** The year the grid shows. Starts at the month on screen each time the picker opens. */
	let year = $state(0);

	function key(y: number, index: number): string {
		return `${y}-${String(index + 1).padStart(2, '0')}`;
	}

	function choose(next: string) {
		open = false;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query string
		void goto(`${resolve(path)}?month=${next}`);
	}
</script>

<!--
	One control for the month: the arrows step a month either way, and the month between them opens a
	grid to jump further. Back to this month sits before it, only while another month is on screen and
	only where it fits on the title's row; on phones it is in the grid. Given more than its own width,
	as on a row to itself under the title, the month stretches and the arrows stay at the ends.
-->
<div class="flex shrink-0 grow items-center gap-2">
	{#if month !== current}
		<Button variant="outline" class="max-sm:hidden" href={resolve(path)}>Today</Button>
	{/if}
	<nav aria-labelledby="{id}-month" class="flex grow items-center rounded-md border bg-card">
		<h2 id="{id}-month" class="sr-only">Month</h2>
		<Button
			variant="ghost"
			size="icon"
			class="rounded-r-none"
			href="{resolve(path)}?month={addMonths(month, -1)}"
		>
			<ChevronLeft /><span class="sr-only">Previous month</span>
		</Button>
		<Popover.Root
			bind:open
			onOpenChange={(next) => {
				if (next) year = Number(month.slice(0, 4));
			}}
		>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" class="grow rounded-none border-x px-3 tabular-nums">
						<span class="sm:hidden">{short}</span>
						<span class="max-sm:hidden">{label}</span>
						<ChevronDown class="text-muted-foreground" aria-hidden="true" />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-64 p-3" align="center">
				<div class="mb-2 flex items-center justify-between">
					<Button variant="ghost" size="icon" class="size-8" onclick={() => year--}>
						<ChevronLeft /><span class="sr-only">Previous year</span>
					</Button>
					<span class="text-sm font-medium tabular-nums" aria-live="polite">{year}</span>
					<Button variant="ghost" size="icon" class="size-8" onclick={() => year++}>
						<ChevronRight /><span class="sr-only">Next year</span>
					</Button>
				</div>
				<div class="grid grid-cols-3 gap-1">
					{#each MONTHS as name, index (name)}
						{const value = $derived(key(year, index))}
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
				<Button
					variant="outline"
					size="sm"
					class="mt-2 w-full"
					disabled={month === current}
					onclick={() => choose(current)}
				>
					This month
				</Button>
			</Popover.Content>
		</Popover.Root>
		<Button
			variant="ghost"
			size="icon"
			class="rounded-l-none"
			href="{resolve(path)}?month={addMonths(month, 1)}"
		>
			<ChevronRight /><span class="sr-only">Next month</span>
		</Button>
	</nav>
</div>
