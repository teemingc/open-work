<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { restoreSettings } from '#lib/settings.remote.js';
	import { LEGACY_STORAGE_KEY, parseBackup } from '#lib/settings.js';
	import { onMount } from 'svelte';
	import GitHubMark from './GitHubMark.svelte';
	import Header from './Header.svelte';
	import NavigationLoader from './NavigationLoader.svelte';

	let { children } = $props();

	/** The picture shown when this page is shared, drawn by og/[...path]. */
	// Absolute, as sharing sites need, though `resolve` gives a relative path while rendering on the server.
	const ogImage = $derived(
		new URL(resolve('/og/[...path]', { path: page.url.pathname.slice(1) }), page.url.href).href
	);

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
	<!-- Sites showing a shared link take its title and description from the page's own tags. -->
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

<main
	id="main"
	tabindex="-1"
	class="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 outline-none sm:px-6"
>
	{@render children()}
</main>

<footer class="mx-auto flex w-full max-w-6xl justify-center gap-6 px-4 pb-8 sm:px-6">
	<a href={resolve('/privacy')} class="text-sm text-muted-foreground hover:text-foreground">
		Privacy
	</a>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
	<a
		href="https://github.com/teemingc/open-work"
		target="_blank"
		rel="noreferrer"
		class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
	>
		<GitHubMark class="size-4" />
		Source code
		<span class="sr-only">(opens in a new tab)</span>
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</footer>
