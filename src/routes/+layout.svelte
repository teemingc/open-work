<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { collectiveImageVersion, OG_IMAGE_VERSION } from '#lib/share-image.js';
	import { getCollectiveStats } from '#lib/collective-stats.remote.js';
	import Header from './Header.svelte';
	import NavigationLoader from './NavigationLoader.svelte';

	let { children } = $props();

	// A collective's card shows its figures, so it is drawn again when they change. The page waits
	// on the same stats, so this asks Open Collective for nothing more.
	const ogVersion = $derived(
		page.route.id === '/collective/[handle]' && page.params.handle
			? await getCollectiveStats(page.params.handle.toLowerCase()).then(
					collectiveImageVersion,
					() => OG_IMAGE_VERSION
				)
			: OG_IMAGE_VERSION
	);

	/** The picture shown when this page is shared, drawn by og/[...path]. */
	// Absolute, as sharing sites need, though `resolve` gives a relative path while rendering on the server.
	const ogImage = $derived.by(() => {
		const url = new URL(
			resolve('/og/[...path]', { path: page.url.pathname.slice(1) }),
			page.url.href
		);
		url.searchParams.set('v', ogVersion);
		return url.href;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Open Work</title>
	<!-- Each page sets its own og:title and og:description beside its title and description. -->
	<meta property="og:site_name" content="Open Work" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={page.url.origin + page.url.pathname} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<a
	href="#main"
	class="sr-only rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
>
	Skip to content
</a>
<NavigationLoader />
<Header />

<!--
	A page slow to arrive dims the one it replaces, so a click is seen to have been heard. Pages lay
	out by the width of `main` rather than the window's, so they follow the space and the text size.
-->
<main
	id="main"
	tabindex="-1"
	data-navigating={navigating.to ? '' : undefined}
	class="@container/main mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-16 transition-opacity duration-200 data-navigating:opacity-40 data-navigating:delay-700 data-navigating:duration-500 md:pt-6 lg:px-6"
>
	{@render children()}
</main>

<!--
	A double rule closes every page like a ledger sheet, within the gutters so it never runs to the
	screen's edges. No name or mark: the header already shows them.
-->
<footer class="mx-auto w-full max-w-6xl px-4 lg:px-6">
	<div class="flex flex-wrap justify-center gap-x-4 border-t-[3px] border-double border-rule py-3">
		<a
			href={resolve('/privacy')}
			class="inline-flex min-h-10 items-center px-2 text-sm text-muted-foreground hover:text-foreground"
		>
			Privacy
		</a>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
		<a
			href="https://github.com/teemingc/open-work"
			target="_blank"
			rel="noreferrer"
			class="inline-flex min-h-10 items-center px-2 text-sm text-muted-foreground hover:text-foreground"
		>
			GitHub
			<span class="sr-only">(opens in a new tab)</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>
</footer>
