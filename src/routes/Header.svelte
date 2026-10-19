<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import { getMe } from '#lib/opencollective.remote.js';
	import logo from '#lib/assets/favicon.svg';
	import { ChartLine, Clock, FileText, Settings } from '@lucide/svelte';

	// Read without `await` so the header never waits on Open Collective. The query is kept for the
	// header's whole life: a query nothing holds on to is dropped from the cache, and the header
	// would stop seeing its updates.
	const meQuery = getMe();
	/** Only an unconnected Open Collective account marks Settings; `undefined` is still loading. */
	const needsSetup = $derived(meQuery.current === null);

	/**
	 * Icons alone on phones and small tablets, each at least 40px wide so it is easy to tap. Below
	 * 768px the four labels do not fit beside the name, and would wrap and squeeze the icons.
	 */
	const LINK =
		'relative -mb-[3px] flex min-w-10 items-center justify-center gap-1.5 border-b-2 border-transparent text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-foreground md:min-w-0 md:px-3 md:whitespace-nowrap [&>svg]:shrink-0';

	/** The home page is the collective page too. */
	function isCurrent(path: '/collective' | '/invoices' | '/worklog' | '/settings'): boolean {
		const { pathname } = page.url;
		return pathname.startsWith(path) || (path === '/collective' && pathname === '/');
	}
</script>

<!--
	A double rule closes the masthead, like the head of a ledger page. It stays at the top while you
	scroll, which also has iOS Safari colour its bar to match instead of the page behind.
-->
<header class="sticky top-0 z-40 border-b-[3px] border-double border-rule bg-card">
	<div
		class="mx-auto flex h-16 max-w-6xl items-stretch justify-between gap-2 px-4 sm:gap-4 sm:px-6"
	>
		<!-- Below 360px the nav needs the room, so the name is left to the mark and screen readers. -->
		<a
			href={resolve('/')}
			class="flex shrink-0 items-center gap-2.5 font-display text-xl font-semibold whitespace-nowrap text-primary"
		>
			<img src={logo} alt="" class="size-7" />
			<span class="max-[359px]:sr-only">Open Work</span>
		</a>

		<nav aria-label="Main" class="flex items-stretch text-sm md:gap-2">
			<a
				href={resolve(`/${dashboardSearch()}`)}
				aria-current={isCurrent('/collective') ? 'page' : undefined}
				class={LINK}
			>
				<ChartLine size={15} />
				<span class="max-md:sr-only">Collective</span>
			</a>
			<a
				href={resolve('/worklog')}
				aria-current={isCurrent('/worklog') ? 'page' : undefined}
				class={LINK}
			>
				<Clock size={15} />
				<span class="max-md:sr-only">Work log</span>
			</a>
			<a
				href={resolve('/invoices')}
				aria-current={isCurrent('/invoices') ? 'page' : undefined}
				class={LINK}
			>
				<FileText size={15} />
				<span class="max-md:sr-only">Invoices</span>
			</a>
			<a
				href={resolve('settings')}
				aria-current={isCurrent('/settings') ? 'page' : undefined}
				class={LINK}
			>
				<Settings size={15} />
				<span class="max-md:sr-only">Settings</span>
				<!--
					Always takes its space, so the nav does not move when it appears. Without labels it sits on
					the icon's corner, so the icon stays centred in its tap target.
				-->
				<span
					class={[
						'size-1.5 rounded-full bg-attention max-md:absolute max-md:top-[calc(50%-11px)] max-md:right-2',
						!needsSetup && 'invisible'
					]}
					title={needsSetup ? 'Setup unfinished' : undefined}
				></span>
				{#if needsSetup}<span class="sr-only">(setup unfinished)</span>{/if}
			</a>
		</nav>
	</div>
</header>
