<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	const notFound = $derived(page.status === 404);
	/** What went wrong in a few words. A page that did not load says so already, so this names the side at fault. */
	/** A collective page that exists, for a collective that does not. */
	const noCollective = $derived(notFound && !!page.route.id?.startsWith('/collective'));
	const heading = $derived(
		noCollective
			? 'Collective not found'
			: notFound
				? 'No page at this address'
				: page.status >= 500
					? 'Something went wrong on our side'
					: 'That request did not work'
	);
	/** SvelteKit's message for an unexpected error, which says nothing about what to do. */
	const UNEXPECTED = 'Internal Error';
	const error = $derived(
		page.error?.message === UNEXPECTED
			? { message: 'Trying again usually fixes it. If not, give it a few minutes.' }
			: page.error
	);

	/**
	 * Loads the page again rather than only its data. Re-running the loads alone left a page that
	 * failed while drawing on this error, so the button flashed its spinner and nothing changed.
	 */
	function retry() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the address already open
		return goto(page.url.href, { invalidateAll: true, replaceState: true });
	}
</script>

<svelte:head>
	<title>{heading} · Open Work</title>
	<meta property="og:title" content="{heading} · Open Work" />
</svelte:head>

<!--
	What went wrong and what to do, alone in the space between header and footer. A missing page also
	leads back to looking up a collective, as the header shows only icons on phones.
-->
<div
	class="mx-auto flex max-w-3xl flex-col justify-center pt-10 text-center sm:pt-16 lg:min-h-[calc(100svh-17rem)] lg:pt-0"
>
	<div class="space-y-3 lg:space-y-5">
		<h1 class="text-balance lg:text-5xl lg:leading-[1.1]">{heading}</h1>
		{#if noCollective}
			<p class="mx-auto text-muted-foreground lg:max-w-[40ch] lg:text-lg">
				{page.error?.message} Check the spelling, or search for it from the Collective page.
			</p>
		{:else if notFound}
			<p class="mx-auto text-muted-foreground lg:max-w-[40ch] lg:text-lg">
				Nothing in Open Work lives at
				<span class="font-medium wrap-break-word text-foreground">{page.url.pathname}</span>. Check
				the address for a typo.
			</p>
		{:else}
			<div class="mx-auto text-muted-foreground lg:max-w-[40ch] lg:text-lg">
				<RetryableError {error} onretry={retry} prominent />
			</div>
			{#if page.status >= 500}
				<p class="pt-2 text-sm text-muted-foreground">
					Still not working?
					<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
					<a
						href="https://github.com/teemingc/open-work/issues/new"
						target="_blank"
						rel="noreferrer"
						class="text-foreground underline underline-offset-4 hover:text-primary"
					>
						Report it on GitHub<span class="sr-only"> (opens in a new tab)</span></a
					>.
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</p>
			{/if}
		{/if}
		{#if notFound}
			<div class="pt-2">
				<Button href={resolve('/')} class="w-full sm:w-auto">Look up a collective</Button>
			</div>
		{/if}
	</div>
</div>
