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

	/** Whether the page showing is in Work, which it is only once it has arrived. */
	const arrived = $derived(isWork(page.url.pathname));

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

	/** What the header's links share: a rounded item, as in shadcn's sidebar, at least 40px wide. */
	const ITEM =
		'flex h-9 min-w-10 items-center justify-center gap-1.5 rounded-md text-sm whitespace-nowrap text-muted-foreground hover:text-foreground pointer-coarse:h-10 [&[aria-current]]:font-medium [&[aria-current]]:text-accent-foreground [&>svg]:shrink-0';

	/**
	 * The main links, filled for the page you are on. Icons alone where the three labels do not fit
	 * beside the name, measured on the header's row so it follows the text size.
	 */
	const LINK = `${ITEM} hover:bg-muted [&[aria-current]]:bg-accent @[32rem]/header:px-3`;

	/**
	 * Curves where a tab meets the row below, filling the corners beside its foot with the row's
	 * colour, so the tab flows into the row rather than meeting it at right angles.
	 */
	const FLARES =
		'before:absolute before:bottom-0 before:-left-2 before:size-2 before:bg-[radial-gradient(circle_at_0_0,transparent_0.5rem,var(--color-accent)_calc(0.5rem+0.5px))] after:absolute after:-right-2 after:bottom-0 after:size-2 after:bg-[radial-gradient(circle_at_100%_0,transparent_0.5rem,var(--color-accent)_calc(0.5rem+0.5px))]';

	/**
	 * In Work, its link drops to the Work row like a folder's tab, in the row's colour, so the row
	 * reads as the one it opened.
	 */
	const WORK_TAB = `${LINK} relative mt-2.5 h-auto min-w-12 self-stretch rounded-b-none px-3 pb-2.5 pointer-coarse:h-auto ${FLARES}`;

	/**
	 * The Work row's links, on the row's tint, with the page you are on raised on the pill below.
	 * On phones they share its width; where four labels do not fit, the others keep only their icons
	 * and the page you are on keeps its label. Wider, they line up on the right, under Work.
	 */
	const SUB_LINK = `${ITEM} relative px-3 hover:bg-card/60 max-sm:flex-auto sm:first-of-type:ml-auto`;

	/**
	 * Moves the Work row's pill, in the card's colour, to the page you are on, so it slides from the
	 * tab you left to the one you chose. It moves with the click, as `aria-current` changes then
	 * rather than when the page arrives, and again when the tabs change size, as when a label shows.
	 * It is placed without sliding at first, so it does not slide in when the page loads.
	 */
	function slidePill(nav: HTMLElement) {
		const pill = nav.querySelector<HTMLElement>('[data-pill]')!;
		function place() {
			const link = nav.querySelector<HTMLElement>('a[aria-current]');
			pill.hidden = !link;
			if (!link) return;
			pill.style.translate = `${link.offsetLeft}px ${link.offsetTop}px`;
			pill.style.width = `${link.offsetWidth}px`;
			pill.style.height = `${link.offsetHeight}px`;
		}
		place();
		const frame = requestAnimationFrame(() => (pill.dataset.ready = ''));
		const resizes = new ResizeObserver(place);
		for (const link of nav.querySelectorAll('a')) resizes.observe(link);
		const changes = new MutationObserver(place);
		changes.observe(nav, { attributeFilter: ['aria-current'], subtree: true });
		return () => {
			cancelAnimationFrame(frame);
			resizes.disconnect();
			changes.disconnect();
		};
	}

	/** The page fades out behind a card that stays at the top, in the gap above it. */
	const FADE = 'bg-linear-to-b from-background from-50% to-transparent';

	/** The Work row has reached the top and stays there, below the gap, as a card of its own. */
	let stuck = $state(false);

	/** Whether the header has scrolled up past the gap above the Work row, which then sticks. */
	function watchStuck(header: HTMLElement) {
		const observer = new IntersectionObserver(([entry]) => (stuck = !entry.isIntersecting), {
			rootMargin: '-8px 0px 0px 0px'
		});
		observer.observe(header);
		return () => observer.disconnect();
	}

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

	/** A Work tab's label, hidden where the four do not fit unless it is the page you are on. */
	function label(path: WorkPath) {
		return current(path) ? undefined : '@max-[26rem]/work:sr-only';
	}
</script>

<!--
	The header is a card inset by the page gutter, like the cards on the page, so nothing runs to the
	screen's edges, where a phone's rounded corners and Safari's floating controls would cut it off.
	It stays at the top while you scroll, over a fade of the page in the gap above it. In Work, its
	Work row is a second piece flush below it, so the two read as one card, and only the Work row
	stays, as you move between its pages more than you leave them. Once it has, it rounds its top
	corners as a card of its own. On a screen as short as a phone on its side, nothing stays.
-->
<header
	class={['z-40 mx-auto w-full max-w-6xl px-4 pt-2 lg:px-6', !arrived && `sticky top-0 ${FADE}`]}
	{@attach watchStuck}
>
	<div
		class={[
			'border bg-card',
			showWorkRow ? 'rounded-t-xl' : 'shadow-on-scroll rounded-xl',
			showWorkRow && arrived && 'border-b-0'
		]}
	>
		<div class="@container/header flex min-h-14 items-center justify-between gap-2 px-2">
			<!-- Where the row is narrow, the nav needs the room, so the name is left to the mark and screen readers. -->
			<a
				href={resolve('/')}
				class="flex shrink-0 items-center gap-2.5 rounded-md px-1.5 font-display text-xl font-semibold text-primary"
			>
				<img src={logo} alt="" class="size-7" />
				<span class="@max-[20rem]/header:sr-only">Open Work</span>
			</a>

			<div class="flex items-center gap-1 self-stretch pr-2">
				<h2 id="main-nav" class="sr-only">Main</h2>
				<nav
					aria-labelledby="main-nav"
					class="flex items-center gap-0.5 self-stretch @[32rem]/header:gap-1"
				>
					<a
						href={resolve(`/${dashboardSearch()}`)}
						aria-current={current('/collective')}
						class={LINK}
					>
						<ChartLine size={15} />
						<span class="@max-[32rem]/header:sr-only">Collectives</span>
					</a>
					<a href={resolve('/contributors')} aria-current={current('/contributors')} class={LINK}>
						<Trophy size={15} />
						<span class="@max-[32rem]/header:sr-only">Leaderboard</span>
					</a>
					<a
						href={resolve('/work')}
						aria-current={inWork ? 'true' : undefined}
						class={showWorkRow ? WORK_TAB : LINK}
					>
						<Briefcase size={15} />
						<span class="@max-[32rem]/header:sr-only">Work</span>
					</a>
				</nav>
			</div>
		</div>
	</div>
	<!--
		Until a Work page arrives, the row hangs below the header, over the page you are leaving and
		the header's bottom border, so that page is not pushed down while it is still showing.
	-->
	{#if showWorkRow && !arrived && inWork}
		{@render workRow('absolute inset-x-0 top-full -mt-px px-4 lg:px-6')}
	{/if}
</header>

{#if showWorkRow && arrived}
	{@render workRow(
		'sticky top-2 z-40 mx-auto w-full max-w-6xl px-4 lg:px-6 [@media(max-height:30rem)]:static'
	)}
{/if}

{#snippet workRow(position: string)}
	<div class={position} data-work-row>
		<!-- The fade covers the gap above, behind the card. -->
		<div class={['absolute inset-x-0 -top-2 bottom-0 -z-10', FADE]} hidden={!stuck}></div>
		<!-- Measured as a container rather than the window, so the labels give way at larger text sizes. -->
		<div
			class={[
				'@container/work flex items-center border bg-accent p-1.5 transition-[border-radius,box-shadow] duration-150 sm:pr-4.5',
				stuck ? 'rounded-xl shadow-raised' : 'rounded-b-xl border-t-transparent'
			]}
		>
			<h2 id="work-nav" class="sr-only">Work</h2>
			<nav
				aria-labelledby="work-nav"
				class="relative flex flex-1 items-center gap-0.5 sm:gap-1"
				{@attach slidePill}
			>
				<span
					class="pointer-events-none absolute top-0 left-0 rounded-md bg-card shadow-xs ease-[cubic-bezier(0.215,0.61,0.355,1)] motion-safe:data-ready:transition-[translate,width,height] motion-safe:data-ready:duration-200"
					data-pill
					aria-hidden="true"
				></span>
				<a href={resolve('/work')} aria-current={current('/work')} class={SUB_LINK}>
					<LayoutDashboard size={14} />
					<span class={label('/work')}>Overview</span>
				</a>
				<a href={resolve('/worklog')} aria-current={current('/worklog')} class={SUB_LINK}>
					<Clock size={14} />
					<span class={label('/worklog')}>Work log</span>
				</a>
				<a href={resolve('/invoices')} aria-current={current('/invoices')} class={SUB_LINK}>
					<FileText size={14} />
					<span class={label('/invoices')}>Invoices</span>
				</a>
				<a href={resolve('/settings/clients')} aria-current={current('/settings')} class={SUB_LINK}>
					<!-- A dot on the icon's corner, like an app badge, so it takes no room of its own and does
						not read as a warning about the word beside it. Only on Settings, not on Work: visitors
						who never set up would otherwise be nagged on every page. -->
					<span class="relative flex">
						<Settings size={14} />
						{#if needsSetup}
							<span
								class="absolute -top-1 -right-1 size-2 rounded-full bg-attention ring-2 ring-accent"
								aria-hidden="true"
							></span>
						{/if}
					</span>
					<span class={label('/settings')}>Settings</span>
					{#if needsSetup}<span class="sr-only">(setup unfinished)</span>{/if}
				</a>
			</nav>
		</div>
	</div>
{/snippet}
