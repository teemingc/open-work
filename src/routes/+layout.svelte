<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { restoreSettings } from '#lib/settings.remote.js';
	import { LEGACY_STORAGE_KEY, parseBackup } from '#lib/settings.js';
	import { collectiveImageVersion, OG_IMAGE_VERSION } from '#lib/share-image.js';
	import { onMount } from 'svelte';
	import { getCollectiveStats } from './collective/[handle]/stats.remote';
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

	// Older versions kept settings in localStorage. Move them into the settings cookie once.
	onMount(async () => {
		let legacy: string | null;
		try {
			legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
		} catch {
			return;
		}
		if (!legacy) return;
		let backup: ReturnType<typeof parseBackup> | undefined;
		try {
			backup = parseBackup(legacy);
		} catch (error) {
			console.error('Saved settings could not be read', error);
		}
		if (backup) {
			try {
				await restoreSettings(backup);
			} catch (error) {
				// Kept, to try again on the next visit.
				console.error('Could not move saved settings', error);
				return;
			}
		}
		localStorage.removeItem(LEGACY_STORAGE_KEY);
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

<!-- A page slow to arrive dims the one it replaces, so a click is seen to have been heard. -->
<main
	id="main"
	tabindex="-1"
	data-navigating={navigating.to ? '' : undefined}
	class="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 transition-opacity duration-200 outline-none data-navigating:opacity-40 data-navigating:delay-700 data-navigating:duration-500 sm:px-6"
>
	{@render children()}
</main>

<!--
	A double rule opens the footer as one closes the masthead, so every page is bound top and bottom
	like a ledger sheet. No name or mark: the sticky header already shows them.
-->
<footer
	class="flex justify-center gap-6 border-t-[3px] border-double border-rule bg-card px-4 py-5 sm:px-6"
>
	<a href={resolve('/privacy')} class="text-sm text-muted-foreground hover:text-foreground">
		Privacy
	</a>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
	<a
		href="https://github.com/teemingc/open-work"
		target="_blank"
		rel="noreferrer"
		class="text-sm text-muted-foreground hover:text-foreground"
	>
		GitHub
		<span class="sr-only">(opens in a new tab)</span>
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</footer>
