<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import { ChartLine, ChevronRight, Clock, FileText } from '@lucide/svelte';

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

	const destinations = [
		{
			href: resolve('/'),
			icon: ChartLine,
			name: 'Collective',
			about: 'Balance, runway and backers'
		},
		{
			href: resolve('/worklog'),
			icon: Clock,
			name: 'Work log',
			about: 'Hours and what you worked on'
		},
		{
			href: resolve('/invoices'),
			icon: FileText,
			name: 'Invoices',
			about: 'Start one or check the ones you sent'
		}
	];
</script>

<svelte:head>
	<title>{heading} · Open Work</title>
	<meta property="og:title" content="{heading} · Open Work" />
</svelte:head>

<!--
	Phones get one narrow column: a heading, what to do, then a list of places to go. Wide screens fill
	the space between header and footer, with what went wrong on the left, set large as the only thing
	on the page, and where to go on the right. Every error shares this frame, so a failed page still
	leaves the rest of the app a click away.
-->
<div
	class="mx-auto grid max-w-md gap-8 pt-10 sm:pt-16 lg:min-h-[calc(100svh-17rem)] lg:max-w-4xl lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:content-center lg:items-center lg:gap-12 lg:pt-0"
>
	<div class="space-y-3 text-center lg:space-y-5 lg:text-left">
		<h1 class="lg:text-[clamp(3rem,1.5rem+3vw,4.5rem)] lg:leading-[1.05]">{heading}</h1>
		{#if noCollective}
			<p class="text-muted-foreground lg:max-w-[34ch] lg:text-lg">
				{page.error?.message} Check the spelling, or search for it from the Collective page.
			</p>
		{:else if notFound}
			<p class="text-muted-foreground lg:max-w-[34ch] lg:text-lg">
				Nothing in Open Work lives at
				<span class="font-medium wrap-break-word text-foreground">{page.url.pathname}</span>. Check
				the address for a typo, or go to one of these.
			</p>
		{:else}
			<div class="text-muted-foreground lg:max-w-[34ch] lg:text-lg">
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
	</div>

	<nav aria-label="Pages">
		<div class="overflow-hidden rounded-xl border bg-card">
			<ul class="divide-y">
				{#each destinations as { href, icon: Icon, name, about } (href)}
					<li>
						<a
							{href}
							class="group flex items-center gap-3 px-3.5 py-2.5 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none lg:gap-4 lg:px-5 lg:py-4"
						>
							<Icon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<span class="min-w-0 flex-1">
								<span class="block font-medium">{name}</span>
								<span class="block text-sm text-muted-foreground">{about}</span>
							</span>
							<ChevronRight
								class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	</nav>
</div>
