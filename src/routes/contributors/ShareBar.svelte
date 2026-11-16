<script lang="ts" module>
	/**
	 * Whether a bar's details were open a moment ago. The next bar's then open at once and without
	 * their entrance, so running the pointer down the column reads each in turn rather than
	 * replaying the entrance on every row.
	 */
	let warm = $state(false);
	/** The bar whose details are open: one at a time, so the next bar's replace the last's. */
	let active = $state<symbol | null>(null);
	let cooling: ReturnType<typeof setTimeout> | undefined;

	/** How long after one bar's details close the next still open at once. */
	const WARM_MS = 400;
</script>

<script lang="ts">
	import * as Popover from '#lib/components/ui/popover/index.js';
	import type { Spread } from './contributors';

	let {
		name,
		length,
		spread,
		onOpenChange
	}: {
		/** The contributor's name. */
		name: string;
		/** How long the bar is beside the leader's, from 0 to 1. */
		length: number;
		spread: Spread;
		/** Told when the details open and close. */
		onOpenChange?: (open: boolean) => void;
	} = $props();

	/**
	 * A shade for each of the `SEGMENTS` named, the one given the most the strongest, so a bar of one
	 * shade went to one project and a bar of many was spread widely. The second is between the first
	 * and third, so the last is no paler than the third series colour: the fourth is too faint on a
	 * white row.
	 */
	const SHADES = [
		'bg-chart-2',
		'bg-[color-mix(in_oklab,var(--chart-2),var(--chart-1))]',
		'bg-chart-1',
		'bg-chart-3'
	];

	const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
	/** A sliver is under 1%, rather than the 0% it would round to. */
	const part = (share: number) => (share < 0.005 ? 'Under 1%' : percent.format(share));

	/** Whether these details opened straight after another bar's. */
	let instant = $state(false);

	const id = Symbol();

	function setOpen(open: boolean) {
		clearTimeout(cooling);
		if (open) {
			instant = warm;
			warm = true;
			active = id;
		} else {
			if (active === id) active = null;
			cooling = setTimeout(() => (warm = false), WARM_MS);
		}
		onOpenChange?.(open);
	}

	const others = $derived(spread.count - spread.top.length);
	const rest = $derived(others > 0 ? 1 - spread.top.reduce((sum, { share }) => sum + share, 0) : 0);
</script>

{#snippet bar()}
	<span class="flex h-2 gap-px overflow-hidden rounded-full">
		{#each spread.top as { share }, i (i)}
			<span class={['min-w-px basis-0', SHADES[i]]} style:flex-grow={share}></span>
		{:else}
			<span class="flex-1 bg-primary"></span>
		{/each}
		{#if rest > 0}
			<span class="min-w-px basis-0 bg-chart-other" style:flex-grow={rest}></span>
		{/if}
	</span>
{/snippet}

{#if spread.count}
	<Popover.Root bind:open={() => active === id, setOpen}>
		<Popover.Trigger openOnHover openDelay={warm ? 0 : 150}>
			{#snippet child({ props })}
				<!--
					As wide as the bar, so the room beside a short one opens nothing. A finger gets a 40px
					target around a bar too thin to tap, where the name's link above keeps the part of it they
					share. A mouse gets less, as targets that tall would meet between rows.
				-->
				<button
					{...props}
					class="relative block cursor-default rounded-full outline-offset-4 after:absolute after:inset-x-0 after:-inset-y-1.5 pointer-coarse:after:-inset-y-4"
					style:width="{length * 100}%"
				>
					{@render bar()}
					<span class="sr-only">
						{#if spread.count === 1}
							All to {spread.top[0].name}.
						{:else}
							Spread over {spread.count}, the most to {spread.top[0].name}: {part(
								spread.top[0].share
							)}.
						{/if}
					</span>
				</button>
			{/snippet}
		</Popover.Trigger>
		<!-- Eases out harder than the popover's own curve, which starts too slowly for an entrance. -->
		<Popover.Content
			class={[
				'w-64 p-3 text-sm whitespace-normal ease-[cubic-bezier(0.23,1,0.32,1)]',
				instant && 'data-[state=open]:animate-none!',
				// Gone at once when another bar's take their place, rather than fading under them.
				active && active !== id && 'data-[state=closed]:animate-none!'
			]}
			align="start"
		>
			<p class="font-medium text-pretty">
				{name} gave to {spread.count === 1 ? 'one recipient' : `${spread.count} recipients`}
			</p>
			<ol class="mt-2 flex flex-col gap-1.5">
				{#each spread.top as { name: recipient, share }, i (i)}
					<li class="flex gap-2">
						<span class={['mt-1.5 size-2 shrink-0 rounded-xs', SHADES[i]]}></span>
						<span class="min-w-0 flex-1 wrap-break-word">{recipient}</span>
						<span class="text-muted-foreground">{part(share)}</span>
					</li>
				{/each}
				{#if rest > 0}
					<li class="flex gap-2">
						<span class="mt-1.5 size-2 shrink-0 rounded-xs bg-chart-other"></span>
						<span class="min-w-0 flex-1">{others} {others === 1 ? 'other' : 'others'}</span>
						<span class="text-muted-foreground">{part(rest)}</span>
					</li>
				{/if}
			</ol>
		</Popover.Content>
	</Popover.Root>
{:else}
	<span class="block" style:width="{length * 100}%">{@render bar()}</span>
{/if}
