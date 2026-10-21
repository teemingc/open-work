<script lang="ts">
	import { invalidateAll } from '$app/navigation';
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

<!-- The same narrow column as the home page: a heading, one line, then a list of places to go. -->
<div class="mx-auto flex max-w-md flex-col gap-6 pt-10 sm:pt-16">
	<div class="space-y-3 text-center">
		<h1>{heading}</h1>
		{#if noCollective}
			<p class="text-muted-foreground">
				{page.error?.message} Check the spelling, or search for it from the Collective page.
			</p>
		{:else if notFound}
			<p class="text-muted-foreground">
				Nothing in Open Work lives at
				<span class="font-medium break-all text-foreground">{page.url.pathname}</span>. Check the
				address for a typo, or go to one of these.
			</p>
		{:else}
			<div class="flex justify-center text-muted-foreground">
				<RetryableError {error} onretry={() => invalidateAll()} />
			</div>
		{/if}
	</div>

	{#if notFound}
		<nav aria-label="Pages" class="overflow-hidden rounded-xl border bg-card">
			<ul class="divide-y">
				{#each destinations as { href, icon: Icon, name, about } (href)}
					<li>
						<a
							{href}
							class="group flex items-center gap-3 px-3.5 py-2.5 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
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
		</nav>
	{/if}
</div>
