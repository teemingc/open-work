<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { CircleAlert } from '@lucide/svelte';
	import { restoreSettings } from '#lib/settings.remote.js';
	import { LEGACY_STORAGE_KEY, parseBackup } from '#lib/settings.js';
	import { onMount } from 'svelte';
	import Header from './Header.svelte';
	import NavigationLoader from './NavigationLoader.svelte';

	let { children } = $props();

	// Older versions kept settings in localStorage. Move them into the settings cookie once.
	onMount(async () => {
		let legacy: string | null;
		try {
			legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
		} catch {
			return;
		}
		if (!legacy) return;
		try {
			await restoreSettings(parseBackup(legacy));
		} catch (error) {
			console.error('Could not move saved settings', error);
		}
		localStorage.removeItem(LEGACY_STORAGE_KEY);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Open Work</title>
</svelte:head>

<NavigationLoader />
<Header />

<main class="mx-auto w-full max-w-6xl px-4 pt-6 pb-16 sm:px-6">
	<svelte:boundary>
		{@render children()}

		{#snippet pending()}
			<div class="flex appear-delayed justify-center py-16"><Spinner class="size-6" /></div>
		{/snippet}

		{#snippet failed(error, reset)}
			<Alert.Root variant="destructive">
				<CircleAlert />
				<Alert.Title>Could not load this page</Alert.Title>
				<Alert.Description>
					<RetryableError {error} onretry={reset} />
				</Alert.Description>
			</Alert.Root>
		{/snippet}
	</svelte:boundary>
</main>
