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
	The action sits beside the title on a phone, and above the content on the right once the title
	has a column of its own.
-->
<section
	class={[
		'grid gap-6 border-t py-8 first:border-t-0 first:pt-0 md:grid-cols-[14rem_minmax(0,1fr)]',
		// Columns that can shrink, so a long name truncates rather than widening the page.
		action ? 'grid-cols-[minmax(0,1fr)_auto] md:gap-y-3' : 'grid-cols-[minmax(0,1fr)]'
	]}
>
	<div class={action && 'md:row-span-2'}>
		<h2 class="text-lg">{title}</h2>
		{#if description}
			<p class="mt-1 text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if action}
		<div class="justify-self-end">{@render action()}</div>
	{/if}
	<div class={['space-y-5', action && 'col-span-2 md:col-span-1']}>{@render children()}</div>
</section>
