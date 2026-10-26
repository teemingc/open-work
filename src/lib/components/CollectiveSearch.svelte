<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Command from '#lib/components/ui/command/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { collectiveLogo, SUGGESTED_COLLECTIVES } from '#lib/collective-suggestions.js';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import { Search } from '@lucide/svelte';
	import { Command as CommandPrimitive } from 'bits-ui';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import { readRecentCollectives } from '#lib/recent-collectives.js';
	import type { CollectiveMatch } from '#lib/collective-search.js';
	import { searchCollectives } from '../../routes/collective/[handle]/stats.remote';

	let {
		name,
		slug,
		field = false
	}: {
		/** The placeholder, like "Find another collective". */
		name: string;
		/** The slug of the collective on screen, left out of the recent list. */
		slug?: string;
		/** Full width and larger, for a page with no collective yet. */
		field?: boolean;
	} = $props();

	/** Wait for a pause in typing, so each keystroke is not a request to Open Collective. */
	const DEBOUNCE_MS = 350;
	const MAX_RECENT = 5;

	let open = $state(false);
	let term = $state('');
	let searched = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let input = $state<HTMLInputElement | null>(null);
	/** The list's id, which the input points to while the list is open. */
	const listId = $props.id();

	const results = $derived(searched.length >= 2 ? searchCollectives(searched) : undefined);

	/** Collectives you visited, newest first. Read as the list opens, so it holds still while open. */
	let recent: CollectiveMatch[] = $state.raw([]);

	function show() {
		if (open) return;
		recent = readRecentCollectives()
			.filter((item) => item.slug !== slug)
			.slice(0, MAX_RECENT);
		open = true;
	}

	function type(value: string) {
		term = value;
		show();
		clearTimeout(timer);
		timer = setTimeout(() => (searched = value.trim().toLowerCase()), DEBOUNCE_MS);
	}

	function choose(match: CollectiveMatch) {
		open = false;
		clearTimeout(timer);
		term = '';
		searched = '';
		input?.blur();
		// The chart settings carry over, so the next collective is shown the same way.
		void goto(resolve(`/collective/[handle]${dashboardSearch()}`, { handle: match.slug }));
	}

	/** Close once focus leaves the search, but not when it moves into the list being clicked. */
	function leave(event: FocusEvent & { currentTarget: HTMLElement }) {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) open = false;
	}
</script>

{#snippet item(match: CollectiveMatch)}
	<Command.Item value={match.slug} onSelect={() => choose(match)}>
		{#if match.imageUrl}
			<img src={match.imageUrl} alt="" class="size-5 rounded" loading="lazy" />
		{:else}
			<span class="size-5 rounded bg-muted"></span>
		{/if}
		<span class="truncate">{match.name}</span>
		<span class="ml-auto truncate text-xs text-muted-foreground">{match.slug}</span>
	</Command.Item>
{/snippet}

<div class="relative w-full" onfocusout={leave}>
	<Command.Root
		shouldFilter={false}
		label="Search Open Collective"
		class="h-auto overflow-visible bg-transparent"
	>
		<label
			class={[
				'flex items-center rounded-md border bg-card shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
				field ? 'h-11 gap-2.5 px-3.5' : 'h-9 gap-2 px-3'
			]}
		>
			<Search class={['shrink-0 text-muted-foreground', field ? 'size-4.5' : 'size-4']} />
			<!-- 16px text at least on phones: iOS Safari zooms in on focusing anything smaller. -->
			<CommandPrimitive.Input
				bind:ref={input}
				value={term}
				placeholder={name}
				autocomplete="off"
				oninput={(event) => type(event.currentTarget.value)}
				onfocus={show}
				onclick={show}
				onkeydown={(event) => {
					if (event.key === 'Escape' && open) {
						event.preventDefault();
						open = false;
					}
				}}
				class={[
					'h-full w-full min-w-0 bg-transparent text-base outline-hidden placeholder:text-muted-foreground',
					!field && 'sm:text-sm'
				]}
			>
				<!--
					Bits UI always marks the input expanded and points it at a viewport this search does not
					use, so both are set here, after its props, to say whether the list is open and where.
				-->
				{#snippet child({ props })}
					<input {...props} aria-expanded={open} aria-controls={open ? listId : undefined} />
				{/snippet}
			</CommandPrimitive.Input>
		</label>

		{#if open}
			<!--
				Focusable, so clicking an item keeps focus inside the search instead of closing it first.
				Grows down out of the field like the site's popovers, and closes at once.
			-->
			<div
				tabindex="-1"
				class="absolute top-full left-0 z-50 mt-1 w-full origin-top animate-in rounded-md border bg-popover text-popover-foreground shadow-md duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] fade-in-0 outline-none zoom-in-95 slide-in-from-top-2"
			>
				<Command.List id={listId} class="p-1">
					{#if searched.length < 2}
						{#if recent.length > 0}
							<Command.Group heading="Recent">
								{#each recent as match (match.slug)}
									{@render item(match)}
								{/each}
							</Command.Group>
						{:else}
							<Command.Group heading="Suggestions">
								{#each SUGGESTED_COLLECTIVES as { slug, name } (slug)}
									{@render item({ slug, name, imageUrl: collectiveLogo(slug) })}
								{/each}
							</Command.Group>
						{/if}
					{:else if results?.loading && !results.current}
						<Command.Loading>
							<div class="flex justify-center py-6"><Spinner /></div>
						</Command.Loading>
					{:else if results?.error}
						<div class="px-3 py-4 text-sm" role="alert">
							<RetryableError error={results.error} onretry={() => results?.refresh()} />
						</div>
					{:else if results?.current?.length === 0}
						<Command.Empty>No collective matches "{searched}".</Command.Empty>
					{:else if results?.current}
						<Command.Group>
							{#each results.current as match (match.slug)}
								{@render item(match)}
							{/each}
						</Command.Group>
					{/if}
				</Command.List>
			</div>
		{/if}
	</Command.Root>
</div>
