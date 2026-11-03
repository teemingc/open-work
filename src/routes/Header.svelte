<script lang="ts">
	import { resolve } from '$app/paths';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import { getMe } from '#lib/opencollective.remote.js';
	import logo from '#lib/assets/favicon.svg';
	import {
		Briefcase,
		ChartLine,
		CircleAlert,
		Clock,
		FileText,
		LayoutDashboard,
		Settings,
		Trophy
	} from '@lucide/svelte';

	// Read without `await` so the header never waits on Open Collective. The query is kept for the
	// header's whole life: a query nothing holds on to is dropped from the cache, and the header
	// would stop seeing its updates.
	const meQuery = getMe();
	/** Only an unconnected Open Collective account marks Settings; `undefined` is still loading. */
	const needsSetup = $derived(meQuery.current === null);

	/** The pages for freelancers doing open work, kept under Work so visitors see what is public. */
	const WORK_PATHS = ['/work', '/worklog', '/invoices', '/settings'] as const;
	type WorkPath = (typeof WORK_PATHS)[number];

	function isWork(pathname: string) {
		return WORK_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
	}

	/**
	 * The page being navigated to, from the moment the link is clicked. `page.url` would only change
	 * once the new page has finished its `await`s, after its skeletons have shown.
	 */
	let pathname = $state(page.url.pathname);
	const inWork = $derived(isWork(pathname));

	/**
	 * The Work row opens with the click, rather than a moment later when a slow page arrives and
	 * pushes it down. It closes only once the next page has arrived, so the page you are leaving does
	 * not jump up while it is still showing.
	 */
	let showWorkRow = $state(isWork(page.url.pathname));

	beforeNavigate(({ to, type, complete }) => {
		if (type === 'leave' || !to?.route.id) return;
		pathname = to.url.pathname;
		if (isWork(pathname)) showWorkRow = true;
		// Back to where you are when the navigation is cancelled or fails.
		complete.catch(() => {
			pathname = page.url.pathname;
			showWorkRow = isWork(pathname);
		});
	});

	// Where you ended up, after a redirect.
	afterNavigate(({ to }) => {
		if (!to) return;
		pathname = to.url.pathname;
		showWorkRow = isWork(pathname);
	});

	/**
	 * Icons alone on phones, each at least 40px wide so it is easy to tap. Below 35rem the three
	 * labels do not fit beside the name, and would wrap and squeeze the icons. Each sits on the rule
	 * below it: the masthead's double rule, or the top of the Work row while it shows.
	 */
	const LINK =
		'relative flex min-w-10 items-center justify-center gap-1.5 border-b-2 border-transparent text-muted-foreground hover:text-foreground [&[aria-current]]:border-primary [&[aria-current]]:font-medium [&[aria-current]]:text-foreground min-[35rem]:min-w-0 min-[35rem]:px-3 [&>svg]:shrink-0';

	/**
	 * The Work row's links. On phones they share the row's width, as tabs, with icons alone below
	 * 23.75rem, where four labels do not fit beside them. Wider, they line up on the right under Work, with the same
	 * padding as the main links so the last labels end together.
	 */
	const SUB_LINK =
		'relative flex items-center gap-1.5 first:ml-auto max-sm:flex-1 max-sm:justify-center max-sm:px-1 border-b-2 border-transparent px-3 text-muted-foreground hover:text-foreground [&[aria-current]]:border-primary [&[aria-current]]:font-medium [&[aria-current]]:text-foreground [&>svg]:shrink-0';

	/**
	 * `page` when the link leads to the page you are on, `true` when you are elsewhere in its
	 * section, such as a collective's page. The collective link leads to the search on the home
	 * page, as each client can be invoiced through a different collective.
	 */
	function current(path: '/collective' | '/contributors' | WorkPath): 'page' | 'true' | undefined {
		if (path === '/collective' && pathname === '/') return 'page';
		if (pathname === path) return path === '/collective' ? 'true' : 'page';
		if (pathname.startsWith(`${path}/`)) return 'true';
		return undefined;
	}
</script>

<!--
	A double rule closes the masthead, like the head of a ledger page. It stays at the top while you
	scroll, which also has iOS Safari colour its bar to match instead of the page behind.
-->
<header class="sticky top-0 z-40 border-b-[3px] border-double border-rule bg-card">
	<div
		class="mx-auto flex min-h-16 max-w-6xl items-stretch justify-between gap-2 px-4 sm:gap-4 sm:px-6"
	>
		<!-- Below 22.5rem the nav needs the room, so the name is left to the mark and screen readers. -->
		<a
			href={resolve('/')}
			class="flex shrink-0 items-center gap-2.5 font-display text-xl font-semibold text-primary"
		>
			<img src={logo} alt="" class="size-7" />
			<span class="max-[22.4375rem]:sr-only">Open Work</span>
		</a>

		<!-- Over the Work row's thinner rule, the links are 2px shorter. As much padding above keeps
			their icons and labels where they were. -->
		<h2 id="main-nav" class="sr-only">Main</h2>
		<nav
			aria-labelledby="main-nav"
			class={[
				'flex items-stretch text-sm min-[35rem]:gap-2',
				showWorkRow ? '-mb-px pt-0.5' : '-mb-[3px]'
			]}
		>
			<a href={resolve(`/${dashboardSearch()}`)} aria-current={current('/collective')} class={LINK}>
				<ChartLine size={15} />
				<span class="max-[35rem]:sr-only">Collectives</span>
			</a>
			<a href={resolve('/contributors')} aria-current={current('/contributors')} class={LINK}>
				<Trophy size={15} />
				<span class="max-[35rem]:sr-only">Leaderboard</span>
			</a>
			<a href={resolve('/work')} aria-current={inWork ? 'true' : undefined} class={LINK}>
				<Briefcase size={15} />
				<span class="max-[35rem]:sr-only">Work</span>
			</a>
		</nav>
	</div>

	{#if showWorkRow}
		<div class="border-t" data-work-row>
			<h2 id="work-nav" class="sr-only">Work</h2>
			<nav
				aria-labelledby="work-nav"
				class="mx-auto -mb-[3px] flex min-h-[2.9375rem] max-w-6xl items-stretch text-sm sm:px-6"
			>
				<a href={resolve('/work')} aria-current={current('/work')} class={SUB_LINK}>
					<LayoutDashboard size={14} />
					<span class="max-[23.6875rem]:sr-only">Overview</span>
				</a>
				<a href={resolve('/worklog')} aria-current={current('/worklog')} class={SUB_LINK}>
					<Clock size={14} />
					<span class="max-[23.6875rem]:sr-only">Work log</span>
				</a>
				<a href={resolve('/invoices')} aria-current={current('/invoices')} class={SUB_LINK}>
					<FileText size={14} />
					<span class="max-[23.6875rem]:sr-only">Invoices</span>
				</a>
				<a href={resolve('/settings/clients')} aria-current={current('/settings')} class={SUB_LINK}>
					<Settings size={14} />
					<span class="max-[23.6875rem]:sr-only">Settings</span>
					<!-- Always takes its space, so the nav does not move when it appears. Only on Settings, not
						on Work: visitors who never set up would otherwise be nagged on every page. -->
					<CircleAlert
						size={12}
						class={['text-attention', !needsSetup && 'invisible']}
						aria-hidden="true"
					/>
					{#if needsSetup}<span class="sr-only">(setup unfinished)</span>{/if}
				</a>
			</nav>
		</div>
	{/if}
</header>
