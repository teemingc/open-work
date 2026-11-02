<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { getMe } from '#lib/opencollective.remote.js';
	import { saveSettings } from '#lib/settings.remote.js';
	import { settingsStatus } from '#lib/settings-status.svelte.js';
	import { ArrowLeft, Check, CircleAlert } from '@lucide/svelte';
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';

	let { children }: { children: Snippet } = $props();

	const TABS = [
		{ path: '/settings/clients', label: 'Clients' },
		{ path: '/settings/invoicing', label: 'Invoicing' },
		{ path: '/settings/hours', label: 'Hours and pay' },
		{ path: '/settings/time-off', label: 'Time off' },
		{ path: '/settings/connections', label: 'Connections' },
		{ path: '/settings/data', label: 'Data' }
	] as const;

	// Read without `await`, like the header, so the tabs never wait on Open Collective.
	const meQuery = getMe();
	/** Invoicing is where Open Collective is connected, so it carries the header's dot. */
	const needsSetup = $derived(meQuery.current === null);

	/** Where you came from, named as the header names it. */
	const PAGES = [
		{ path: '/worklog', label: 'Work log' },
		{ path: '/invoices', label: 'Invoices' },
		{ path: '/contributors', label: 'Leaderboard' },
		{ path: '/collective', label: 'Collectives' },
		{ path: '/', label: 'Collectives' }
	] as const;

	/** The page you opened settings from, kept while you move between tabs. */
	let back = $state<{ href: ResolvedPathname; label: string }>();

	afterNavigate(({ from }) => {
		if (!from || from.url.pathname.startsWith('/settings')) return;
		const { pathname, search, hash } = from.url;
		const known = PAGES.find(({ path }) =>
			path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
		);
		// The address you were at, which already carries the base path.
		back = {
			href: (pathname + search + hash) as ResolvedPathname,
			label: known?.label ?? 'Back'
		};
	});

	/** Brings the current tab into view on phones, where the row scrolls sideways. */
	function reveal(node: HTMLElement) {
		node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}
</script>

{#if back}
	<a
		href={back.href}
		class="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeft size={15} />
		{back.label}
	</a>
{/if}

<div class="mb-6 flex flex-wrap items-end justify-between gap-2">
	<h1>Settings</h1>
	<p class="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
		{#if saveSettings.pending > 0}
			<!-- A quick save goes straight to "Saved" without flashing this first. -->
			<span class="flex appear-delayed items-center gap-1.5"><Spinner /> Saving…</span>
		{:else if saveSettings.fields.allIssues()}
			<CircleAlert size={15} class="text-destructive" /> Not saved. Fix the fields marked below.
		{:else if settingsStatus.justSaved}
			<span
				class="flex animate-in items-center gap-1.5 duration-150 fade-in"
				out:fade={{ duration: 150 }}
			>
				<Check size={15} class="text-status-paid" /> Saved
			</span>
		{/if}
	</p>
</div>

<!-- Links styled as tabs, so each page has its own address to link to and come back to. -->
<nav aria-label="Settings" class="mb-8 [scrollbar-width:none] overflow-x-auto">
	<div class="inline-flex h-9 items-center rounded-lg bg-muted p-[3px] text-muted-foreground">
		{#each TABS as tab (tab.path)}
			<a
				href={resolve(tab.path)}
				aria-current={page.url.pathname === tab.path ? 'page' : undefined}
				{@attach page.url.pathname === tab.path && reveal}
				class="inline-flex h-full items-center gap-1.5 rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap text-foreground transition-[color,box-shadow] hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=page]:bg-background aria-[current=page]:shadow-sm dark:text-muted-foreground dark:aria-[current=page]:border-input dark:aria-[current=page]:bg-input/30 dark:aria-[current=page]:text-foreground"
			>
				{tab.label}
				{#if tab.path === '/settings/invoicing' && needsSetup}
					<span class="size-1.5 rounded-full bg-attention" title="Setup unfinished"></span>
					<span class="sr-only">(setup unfinished)</span>
				{/if}
			</a>
		{/each}
	</div>
</nav>

<div>{@render children()}</div>
