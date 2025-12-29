<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Nav from './Nav.svelte';
	import { resolve } from '$app/paths';
	import { invoiceStore } from '$lib/invoice.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	let { children } = $props();

	// Redirect to setup if not complete (except when already on setup page)
	onMount(() => {
		if (!invoiceStore.isSetupComplete && !page.url.pathname.includes('/setup')) {
			goto(resolve('/setup'));
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if invoiceStore.isSetupComplete}
	<Nav />
{/if}

<main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	{@render children()}
</main>
