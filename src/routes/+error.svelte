<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import { ChartLine, ChevronRight, Clock, FileText } from '@lucide/svelte';

	const notFound = $derived(page.status === 404);

	const destinations = [
		{
			href: resolve('/'),
			icon: ChartLine,
			name: 'Collective',
			about: 'How your collective’s money is holding up'
		},
		{
			href: resolve('/worklog'),
			icon: Clock,
			name: 'Work log',
			about: 'The hours you have logged'
		},
		{
			href: resolve('/invoices'),
			icon: FileText,
			name: 'Invoices',
			about: 'Start an invoice or see the ones you sent'
		}
	];
</script>

<svelte:head>
	<title>{notFound ? 'Page not found' : 'Page did not load'} · Open Work</title>
</svelte:head>

<!-- The same narrow column as the home page: a heading, one line, then a list of places to go. -->
<div class="mx-auto flex max-w-md flex-col gap-6 pt-10 sm:pt-16">
	<div class="space-y-2 text-center">
		<h1>{notFound ? 'No page at this address' : 'This page did not load'}</h1>
		{#if notFound}
			<p class="text-muted-foreground">
				Nothing in Open Work lives at
				<span class="font-medium break-all text-foreground">{page.url.pathname}</span>. Check the
				address for a typo, or carry on from one of these.
			</p>
		{:else}
			<div class="flex justify-center text-muted-foreground">
				<RetryableError error={page.error} onretry={() => invalidateAll()} />
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
