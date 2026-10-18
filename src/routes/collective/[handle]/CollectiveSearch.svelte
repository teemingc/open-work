<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { collectiveLogo, SUGGESTED_COLLECTIVES } from '#lib/collective-suggestions.js';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import { ChevronsUpDown, Search } from '@lucide/svelte';
	import { readRecentCollectives } from './recent-collectives';
	import { searchCollectives, type CollectiveMatch } from './stats.remote';

	let {
		name,
		slug,
		field = false
	}: {
		/** The collective on screen, or a prompt when there is none. */
		name: string;
		/** The slug of the collective on screen, left out of the recent list. */
		slug?: string;
		/** Look like a search box, for a page with no collective yet. */
		field?: boolean;
	} = $props();

	/** Wait for a pause in typing, so each keystroke is not a request to Open Collective. */
	const DEBOUNCE_MS = 350;
	const MAX_RECENT = 5;

	let open = $state(false);
	let term = $state('');
	let searched = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	const results = $derived(searched.length >= 2 ? searchCollectives(searched) : undefined);

	/** Collectives you visited, newest first. Read as the search opens, so it holds still while open. */
	let recent: CollectiveMatch[] = $state.raw([]);

	function loadRecent() {
		recent = readRecentCollectives()
			.filter((item) => item.slug !== slug)
			.slice(0, MAX_RECENT);
	}

	function type(value: string) {
		term = value;
		clearTimeout(timer);
		timer = setTimeout(() => (searched = value.trim().toLowerCase()), DEBOUNCE_MS);
	}

	/** Start afresh each time the search opens. */
	function reset() {
		clearTimeout(timer);
		term = '';
		searched = '';
	}

	function choose(match: CollectiveMatch) {
		open = false;
		void goto(resolve('/collective/[handle]', { handle: match.slug }));
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

<Popover.Root
	bind:open
	onOpenChange={(next) => {
		if (next) loadRecent();
	}}
	onOpenChangeComplete={(next) => {
		// Only once it has finished closing, so nothing moves while you can still see it.
		if (!next) reset();
	}}
>
	<Popover.Trigger>
		{#snippet child({ props })}
			{#if field}
				<Button
					{...props}
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label="Search Open Collective"
					class="h-11 w-full justify-start gap-2.5 bg-card px-3.5 text-base font-normal text-muted-foreground"
				>
					<Search class="size-4.5" />
					{name}
				</Button>
			{:else}
				<Button
					{...props}
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label="Show another collective"
					class="w-full justify-between sm:w-64"
				>
					<span class="truncate">{name}</span>
					<ChevronsUpDown class="opacity-50" />
				</Button>
			{/if}
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
		<Command.Root shouldFilter={false}>
			<Command.Input
				placeholder="Search Open Collective"
				value={term}
				oninput={(event) => type(event.currentTarget.value)}
			/>
			<Command.List>
				{#if searched.length < 2}
					{#if recent.length > 0}
						<Command.Group heading="Recent">
							{#each recent as match (match.slug)}
								{@render item(match)}
							{/each}
						</Command.Group>
					{:else}
						<Command.Group heading="Try one">
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
		</Command.Root>
	</Popover.Content>
</Popover.Root>
