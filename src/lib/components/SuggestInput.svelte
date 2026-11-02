<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { cn } from '#lib/utils.js';
	import { X } from '@lucide/svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		id,
		value = $bindable(''),
		suggestions,
		onpick,
		onremove,
		onkeydown,
		...rest
	}: Omit<HTMLInputAttributes, 'value' | 'type' | 'files'> & {
		id: string;
		value?: string;
		suggestions: string[];
		/** A suggestion was chosen. Typing still works as usual. */
		onpick: (suggestion: string) => void;
		/** Stops suggesting one, from its remove button or Shift+Delete. */
		onremove: (suggestion: string) => void;
	} = $props();

	let input = $state<HTMLElement | null>(null);
	let open = $state(false);
	// The suggestion moved to with the arrow keys, or -1 for what's typed.
	let active = $state(-1);

	const matches = $derived.by(() => {
		const query = value.trim().toLowerCase();
		return suggestions
			.filter((suggestion) => {
				const text = suggestion.toLowerCase();
				return text !== query && text.includes(query);
			})
			.slice(0, 8);
	});
	const shown = $derived(open && matches.length > 0);

	function show() {
		open = true;
		active = -1;
	}

	function pick(suggestion: string) {
		open = false;
		active = -1;
		onpick(suggestion);
	}

	function remove(suggestion: string) {
		onremove(suggestion);
		// The next one moves up into its place.
		active = Math.min(active, matches.length - 1);
	}
</script>

<Popover.Root bind:open={() => shown, (next) => (open = next)}>
	<Input
		{...rest}
		{id}
		bind:ref={input}
		bind:value
		role="combobox"
		autocomplete="off"
		aria-autocomplete="list"
		aria-expanded={shown}
		aria-controls="{id}-suggestions"
		aria-activedescendant={shown && active >= 0 ? `${id}-suggestion-${active}` : undefined}
		oninput={show}
		onblur={() => (open = false)}
		onkeydown={(event) => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				if (!shown) return show();
				const step = event.key === 'ArrowDown' ? 1 : -1;
				// Past either end comes back to what's typed.
				active = ((active + 1 + step + matches.length + 1) % (matches.length + 1)) - 1;
			} else if (event.key === 'Enter') {
				if (shown && active >= 0) {
					event.preventDefault();
					pick(matches[active]);
				} else {
					open = false;
				}
			} else if (event.key === 'Delete' && event.shiftKey && shown && active >= 0) {
				event.preventDefault();
				remove(matches[active]);
			}
			onkeydown?.(event);
		}}
	/>
	<Popover.Content
		customAnchor={input}
		align="start"
		trapFocus={false}
		onOpenAutoFocus={(event) => event.preventDefault()}
		onCloseAutoFocus={(event) => event.preventDefault()}
		onInteractOutside={(event) => {
			if (event.target === input) event.preventDefault();
		}}
		class="w-(--bits-popover-anchor-width) p-1"
	>
		<ul id="{id}-suggestions" role="listbox">
			{#each matches as suggestion, index (suggestion)}
				<!-- The keyboard reaches options through the input, which keeps focus. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{id}-suggestion-{index}"
					role="option"
					aria-selected={index === active}
					class={cn(
						'flex cursor-default items-center gap-2 rounded-sm py-0.5 pr-0.5 pl-2 text-sm',
						index === active && 'bg-accent text-accent-foreground'
					)}
					onpointerenter={() => (active = index)}
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => pick(suggestion)}
				>
					<span class="truncate">{suggestion}</span>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						class="ml-auto size-6 shrink-0"
						tabindex={-1}
						aria-label="Remove {suggestion} from suggestions"
						onclick={(event) => {
							event.stopPropagation();
							remove(suggestion);
						}}
					>
						<X size={12} />
					</Button>
				</li>
			{/each}
		</ul>
	</Popover.Content>
</Popover.Root>
