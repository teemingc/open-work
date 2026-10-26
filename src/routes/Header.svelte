<script lang="ts">
	import { resolve } from '$app/paths';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { dashboardSearch } from '#lib/dashboard-search.svelte.js';
	import { getMe } from '#lib/opencollective.remote.js';
	import { getSettings } from '#lib/settings.remote.js';
	import logo from '#lib/assets/favicon.svg';
	import { Briefcase, ChartLine, Clock, FileText, Settings, Trophy } from '@lucide/svelte';

	// Read without `await` so the header never waits on Open Collective. The query is kept for the
	// header's whole life: a query nothing holds on to is dropped from the cache, and the header
	// would stop seeing its updates.
	const meQuery = getMe();
	/** Only an unconnected Open Collective account marks Settings; `undefined` is still loading. */
	const needsSetup = $derived(meQuery.current === null);
	const settingsQuery = getSettings();
	/** The collective you invoice from, which the collective link leads to. */
	const collectiveSlug = $derived(settingsQuery.current?.collectiveSlug);

	/** The pages for freelancers doing open work, kept under Work so visitors see what is public. */
	const WORK_PATHS = ['/worklog', '/invoices', '/settings'] as const;
	type WorkPath = (typeof WORK_PATHS)[number];

	/**
	 * The page being navigated to, from the moment the link is clicked. The Work row opens or closes
	 * with the click, rather than a moment later when a slow page arrives and pushes it down.
	 * `page.url` would only change once the new page has finished its `await`s, after its
	 * skeletons have shown.
	 */
	let pathname = $state(page.url.pathname);

	beforeNavigate(({ to, type, complete }) => {
		if (type === 'leave' || !to?.route.id) return;
		pathname = to.url.pathname;
		// Back to where you are when the navigation is cancelled or fails.
		complete.catch(() => (pathname = page.url.pathname));
	});

	// Where you ended up, after a redirect.
	afterNavigate(({ to }) => {
		if (to) pathname = to.url.pathname;
	});

	const inWork = $derived(
		WORK_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
	);

	/**
	 * Icons alone on phones, each at least 40px wide so it is easy to tap. Below 560px the three
	 * labels do not fit beside the name, and would wrap and squeeze the icons. Each sits on the rule
	 * below it: the masthead's double rule, or the top of the Work row while it shows.
	 */
	const LINK =
		'relative flex min-w-10 items-center justify-center gap-1.5 border-b-2 border-transparent text-muted-foreground hover:text-foreground [&[aria-current]]:border-primary [&[aria-current]]:font-medium [&[aria-current]]:text-foreground min-[560px]:min-w-0 min-[560px]:px-3 min-[560px]:whitespace-nowrap [&>svg]:shrink-0';

	/**
	 * The Work row's links, labelled at every width: three short ones fit on any phone. They line up
	 * on the right under Work, with the same padding as the main links so the last labels end together.
	 */
	const SUB_LINK =
		'relative -mb-[3px] flex items-center gap-1.5 border-b-2 border-transparent px-3 whitespace-nowrap text-muted-foreground hover:text-foreground [&[aria-current]]:border-primary [&[aria-current]]:font-medium [&[aria-current]]:text-foreground [&>svg]:shrink-0';

	/**
	 * `page` when the link leads to the page you are on, `true` when you are elsewhere in its
	 * section, such as another collective's page. The collective link leads to your own collective,
	 * or to the search on the home page when none is set.
	 */
	function current(path: '/collective' | '/contributors' | WorkPath): 'page' | 'true' | undefined {
		if (path === '/collective') {
			if (pathname === (collectiveSlug ? `/collective/${collectiveSlug}` : '/')) return 'page';
			if (pathname === '/') return 'true';
		}
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

		<!-- Over the Work row's thinner rule, the links are 2px shorter. As much padding above keeps
			their icons and labels where they were. -->
		<nav
			aria-label="Main"
			class={[
				'flex items-stretch text-sm min-[560px]:gap-2',
				inWork ? '-mb-px pt-0.5' : '-mb-[3px]'
			]}
		>
			<a
				href={collectiveSlug
					? resolve(`/collective/[handle]${dashboardSearch()}`, { handle: collectiveSlug })
					: resolve(`/${dashboardSearch()}`)}
				aria-current={current('/collective')}
				class={LINK}
			>
				<ChartLine size={15} />
				<span class="max-[560px]:sr-only">Collectives</span>
			</a>
			<a href={resolve('/contributors')} aria-current={current('/contributors')} class={LINK}>
				<Trophy size={15} />
				<span class="max-[560px]:sr-only">Leaderboard</span>
			</a>
			<a href={resolve('/worklog')} aria-current={inWork ? 'true' : undefined} class={LINK}>
				<Briefcase size={15} />
				<span class="max-[560px]:sr-only">Work</span>
			</a>
		</nav>
	</div>

	{#if inWork}
		<div class="border-t">
			<nav
				aria-label="Work"
				class="mx-auto flex h-11 max-w-6xl items-stretch justify-end px-1 text-sm sm:px-6"
			>
				<a href={resolve('/worklog')} aria-current={current('/worklog')} class={SUB_LINK}>
					<Clock size={14} />
					Work log
				</a>
				<a href={resolve('/invoices')} aria-current={current('/invoices')} class={SUB_LINK}>
					<FileText size={14} />
					Invoices
				</a>
				<a href={resolve('/settings')} aria-current={current('/settings')} class={SUB_LINK}>
					<Settings size={14} />
					Settings
					<!-- Always takes its space, so the nav does not move when it appears. Only on Settings, not
						on Work: visitors who never set up would otherwise be nagged on every page. -->
					<span
						class={['size-1.5 rounded-full bg-attention', !needsSetup && 'invisible']}
						title={needsSetup ? 'Setup unfinished' : undefined}
					></span>
					{#if needsSetup}<span class="sr-only">(setup unfinished)</span>{/if}
				</a>
			</nav>
		</div>
	{/if}
</header>
