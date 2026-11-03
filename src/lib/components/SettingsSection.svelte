<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		action,
		children
	}: {
		title: string;
		description?: string;
		/** Such as a button that adds to the section's list, kept at its top right. */
		action?: Snippet;
		children: Snippet;
	} = $props();
</script>

<!--
	The action sits beside the title on a phone, with the description under both so it has the full
	width, and above the content on the right once the title has a column of its own. On a phone the
	row wraps, so with large text the action drops under the title rather than covering it.
-->
<section
	class={[
		'grid gap-6 border-t py-8 first:border-t-0 first:pt-0 md:grid-cols-[14rem_minmax(0,1fr)]',
		action
			? 'max-md:flex max-md:flex-wrap max-md:items-start md:gap-y-3'
			: // A column that can shrink, so a long name wraps rather than widening the page.
				'grid-cols-[minmax(0,1fr)]'
	]}
>
	<div class={action && 'max-md:contents md:row-span-2'}>
		<h2 class="text-lg">{title}</h2>
		{#if description}
			<p
				class={[
					'mt-1 text-sm text-muted-foreground',
					action && 'max-md:order-1 max-md:-mt-5 max-md:basis-full'
				]}
			>
				{description}
			</p>
		{/if}
	</div>
	{#if action}
		<div class="ml-auto max-w-full">{@render action()}</div>
	{/if}
	<div class={['min-w-0 space-y-5', action && 'max-md:order-2 max-md:basis-full']}>
		{@render children()}
	</div>
</section>
