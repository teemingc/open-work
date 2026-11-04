<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Command from '#lib/components/ui/command/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { collectiveLogo, SUGGESTED_COLLECTIVES } from '#lib/collective-suggestions.js';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import { Mail, Search, Trash2 } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Command as CommandPrimitive } from 'bits-ui';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import { forgetCollective, readRecentCollectives } from '#lib/recent-collectives.js';
	import type { CollectiveMatch } from '#lib/collective-search.js';
	import { searchCollectives } from '#lib/collective-stats.remote.js';

	let {
		name,
		nameShown = true,
		slug,
		field = false,
		id,
		onchoose,
		email,
		onemail,
		busy = false,
		invalid = false
	}: {
		/** The field's name, like "Find another collective". */
		name: string;
		/**
		 * Whether the name is shown above the field. Leave it out when `id` has a label of its own, or
		 * when the name is a heading already on screen, like "Look up a collective".
		 */
		nameShown?: boolean;
		/** The slug of the collective on screen, left out of the recent list, or the one chosen. */
		slug?: string;
		/** Full width and larger, for a page with no collective yet. */
		field?: boolean;
		id?: string;
		/**
		 * Picks a collective instead of opening it, showing `slug` while closed. Clearing the field
		 * and leaving it picks none.
		 */
		onchoose?: (match: CollectiveMatch | undefined) => void;
		/** The email address chosen instead of a collective, shown while closed when no `slug` is. */
		email?: string;
		/** Offers an email address, once one is typed, as a choice besides the collectives. */
		onemail?: (email: string) => void;
		busy?: boolean;
		invalid?: boolean;
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
	const inputId = $derived(id ?? `${listId}-input`);

	const results = $derived(searched.length >= 2 ? searchCollectives(searched) : undefined);

	/** Typing an address searches no collectives, as no slug has an `@` in it. */
	const typingEmail = $derived(!!onemail && term.includes('@'));
	const address = $derived(
		typingEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(term.trim()) ? term.trim() : undefined
	);
	const shown = $derived(slug ?? email ?? '');
	const showsEmail = $derived(open ? typingEmail : !slug && !!email);

	/** Collectives you visited, newest first. Read as the list opens, so it holds still while open. */
	let recent: CollectiveMatch[] = $state.raw([]);
	/** The item moved to with the arrow keys or pointer. */
	let highlighted = $state('');
	const showsRecent = $derived(open && !typingEmail && searched.length < 2 && recent.length > 0);

	function forget(match: CollectiveMatch) {
		forgetCollective(match.slug);
		recent = recent.filter((item) => item.slug !== match.slug);
	}

	function show() {
		if (open) return;
		recent = readRecentCollectives()
			.filter((item) => item.slug !== slug)
			.slice(0, MAX_RECENT);
		if (onchoose) term = shown;
		open = true;
	}

	function type(value: string) {
		term = value;
		show();
		clearTimeout(timer);
		timer = setTimeout(
			() => (searched = onemail && value.includes('@') ? '' : value.trim().toLowerCase()),
			DEBOUNCE_MS
		);
	}

	function close() {
		open = false;
		clearTimeout(timer);
		term = '';
		searched = '';
	}

	function choose(match: CollectiveMatch) {
		close();
		input?.blur();
		if (onchoose) onchoose(match);
		// The chart settings carry over, so the next collective is shown the same way.
		else void goto(resolve(`/collective/[handle]${dashboardSearch()}`, { handle: match.slug }));
	}

	/** Close once focus leaves the search, but not when it moves into the list being clicked. */
	function leave(event: FocusEvent & { currentTarget: HTMLElement }) {
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
		if (!open) return;
		if (onchoose && shown && !term.trim()) onchoose(undefined);
		// A whole address left in the field is as good as picking it.
		else if (address && address !== email) onemail?.(address);
		close();
	}
</script>

{#snippet item(match: CollectiveMatch, removable = false)}
	<Command.Item value={match.slug} onSelect={() => choose(match)}>
		{#if match.imageUrl}
			<img src={match.imageUrl} alt="" class="size-5 rounded" loading="lazy" />
		{:else}
			<span class="size-5 rounded bg-muted"></span>
		{/if}
		<span class="min-w-0 wrap-break-word">{match.name}</span>
		<span class="ml-auto min-w-0 text-xs wrap-anywhere text-muted-foreground">{match.slug}</span>
		{#if removable}
			<!-- Small so the row keeps its height, with a fingertip's worth of room to hit it. -->
			<Button
				type="button"
				variant="ghost"
				size="icon"
				class="relative -my-1 size-6 shrink-0 after:absolute after:-inset-2 pointer-coarse:size-6"
				tabindex={-1}
				onpointerdown={(event) => event.preventDefault()}
				onclick={(event) => {
					event.stopPropagation();
					forget(match);
				}}
			>
				<Trash2 size={12} />
				<span class="sr-only">Remove {match.name} from recent</span>
			</Button>
		{/if}
	</Command.Item>
{/snippet}

<div class="relative w-full" onfocusout={leave}>
	<Command.Root
		shouldFilter={false}
		bind:value={highlighted}
		label={name}
		class="h-auto overflow-visible bg-transparent"
	>
		{#if nameShown && !id}
			<label for={inputId} class="mb-1.5 block text-sm font-medium">{name}</label>
		{/if}
		<label
			class={[
				'flex items-center rounded-md border bg-card shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
				invalid && 'border-destructive ring-destructive/20 dark:ring-destructive/40',
				field ? 'min-h-11 gap-2.5 px-3.5' : 'min-h-9 gap-2 px-3 pointer-coarse:min-h-10'
			]}
		>
			{const Icon = $derived(showsEmail ? Mail : Search)}
			<Icon class={['shrink-0 text-muted-foreground', field ? 'size-4.5' : 'size-4']} />
			<!-- 16px text at least on phones: iOS Safari zooms in on focusing anything smaller. -->
			<CommandPrimitive.Input
				bind:ref={input}
				id={inputId}
				value={term}
				autocomplete="off"
				oninput={(event) => type(event.currentTarget.value)}
				onfocus={show}
				onclick={show}
				onkeydown={(event) => {
					if (event.key === 'Escape' && open) {
						event.preventDefault();
						open = false;
					}
					// Like a browser's own suggestions, Shift+Delete forgets the one highlighted.
					const match = recent.find((item) => item.slug === highlighted);
					if (event.key === 'Delete' && event.shiftKey && showsRecent && match) {
						event.preventDefault();
						forget(match);
					}
				}}
				class={[
					'w-full min-w-0 self-stretch bg-transparent text-base outline-hidden',
					!field && 'sm:text-sm'
				]}
			>
				<!--
					Bits UI always marks the input expanded and points it at a viewport this search does not
					use, so both are set here, after its props, to say whether the list is open and where. The
					value is set here too, as Bits UI clears its own on mount, hiding a chosen collective.
				-->
				{#snippet child({ props })}
					<input
						{...props}
						aria-expanded={open}
						aria-controls={open ? listId : undefined}
						aria-invalid={invalid || undefined}
						value={onchoose && !open ? shown : term}
					/>
				{/snippet}
			</CommandPrimitive.Input>
			{#if busy}<Spinner class="shrink-0 text-muted-foreground" />{/if}
		</label>

		{#if open && !(typingEmail && !address)}
			<!--
				Focusable, so clicking an item keeps focus inside the search instead of closing it first.
				Grows down out of the field like the site's popovers, and closes at once.
			-->
			<div
				tabindex="-1"
				class="absolute top-full left-0 z-50 mt-1 w-full origin-top animate-in rounded-md border bg-popover text-popover-foreground shadow-md duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] fade-in-0 outline-none zoom-in-95 slide-in-from-top-2"
			>
				<Command.List id={listId} class="p-1">
					{#if address}
						<Command.Item
							value={address}
							onSelect={() => {
								const chosen = address;
								close();
								input?.blur();
								onemail?.(chosen);
							}}
						>
							<Mail />
							<span class="min-w-0 wrap-anywhere">Email {address}</span>
						</Command.Item>
					{:else if searched.length < 2}
						{#if recent.length > 0}
							<Command.Group heading="Recent">
								{#each recent as match (match.slug)}
									{@render item(match, true)}
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
