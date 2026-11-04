<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { getMe } from '#lib/opencollective.remote.js';
	import { saveSettings } from '#lib/settings.remote.js';
	import { settingsStatus } from '#lib/settings-status.svelte.js';
	import { ArrowLeft, Check, ChevronDown, CircleAlert } from '@lucide/svelte';
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
	/** Connections is where Open Collective is connected, so it carries the header's dot. */
	const needsSetup = $derived(meQuery.current === null);

	/** Where you came from, named as the header names it. */
	const PAGES = [
		{ path: '/work', label: 'Overview' },
		{ path: '/worklog', label: 'Work log' },
		{ path: '/invoices', label: 'Invoices' },
		{ path: '/contributors', label: 'Leaderboard' },
		{ path: '/collective', label: 'Collectives' },
		{ path: '/', label: 'Collectives' }
	] as const;

	/** The page you opened settings from, kept while you move between sections. */
	let back = $state<{ href: ResolvedPathname; label: string }>();

	const current = $derived(TABS.find((tab) => tab.path === page.url.pathname));
	/** Whether the list of sections is open on narrower screens, where it folds away. */
	let sectionsOpen = $state(false);

	afterNavigate(({ from }) => {
		sectionsOpen = false;
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

<!-- The status shares the heading's line at any width, wrapping its own text rather than going
	under the heading, so the sections below do not jump each time it appears. -->
<div class="mb-6 flex items-end justify-between gap-3">
	<h1 id="settings-heading">Settings</h1>
	<p
		class="flex min-w-0 items-center justify-end gap-1.5 text-right text-sm text-muted-foreground"
		role="status"
	>
		{#if saveSettings.pending > 0}
			<!-- A quick save goes straight to "Saved" without flashing this first. -->
			<span class="flex appear-delayed items-center gap-1.5"><Spinner /> Saving…</span>
		{:else if saveSettings.fields.allIssues()}
			<CircleAlert size={15} class="shrink-0 text-destructive" /> Not saved. Fix the fields marked below.
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

{#snippet sections()}
	<ul class="space-y-0.5">
		{#each TABS as tab (tab.path)}
			<li>
				<a
					href={resolve(tab.path)}
					aria-current={tab === current ? 'page' : undefined}
					class="flex min-h-9 items-center gap-2 rounded-md border-l-2 border-transparent px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:bg-muted aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
				>
					{tab.label}
					{#if tab.path === '/settings/connections' && needsSetup}
						<span class="size-2 shrink-0 rounded-full bg-attention" aria-hidden="true"></span>
						<span class="sr-only">(setup unfinished)</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

<!--
	Links rather than tabs, so each section has its own address to link to and come back to. A
	column beside the section from tablet width, as in shadcn's settings example. Narrower, it folds
	into the section you are on, so the list never scrolls sideways or pushes the section down.
	The section is a container, so its own layout follows the width left beside the list.
-->
<div class="md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8 lg:gap-10">
	<nav aria-labelledby="settings-heading" class="mb-8 md:mb-0">
		<details class="group rounded-md border bg-card md:hidden" bind:open={sectionsOpen}>
			<summary
				class="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden"
			>
				{current?.label ?? 'Sections'}
				<!-- On the chevron rather than beside the name, as it is another section that needs you. -->
				<span class="relative ml-auto flex shrink-0">
					<ChevronDown
						size={16}
						class="text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
					/>
					{#if needsSetup && current?.path !== '/settings/connections'}
						<span
							class="absolute -top-1 -right-1 size-2 rounded-full bg-attention ring-2 ring-card"
							aria-hidden="true"
						></span>
						<span class="sr-only">(Connections setup unfinished)</span>
					{/if}
				</span>
			</summary>
			<div class="border-t p-1">{@render sections()}</div>
		</details>
		<div class="hidden md:block">{@render sections()}</div>
	</nav>

	<div class="@container/settings min-w-0">{@render children()}</div>
</div>
