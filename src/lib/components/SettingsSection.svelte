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
	The title gets a column of its own only when the settings area is wide enough to keep the
	content readable beside it, which is a container query on the area rather than the window, as
	the list of sections takes some of the width. Otherwise the title sits above the content, with
	the action beside it and the description under both so it has the full width. That row wraps,
	so with large text the action drops under the title rather than covering it. `first-of-type`
	rather than `first`, as a settings form starts with its hidden inputs.
-->
<section
	class={[
		'grid gap-6 border-t py-8 first-of-type:border-t-0 first-of-type:pt-0 @4xl/settings:grid-cols-[14rem_minmax(0,1fr)]',
		action
			? '@max-4xl/settings:flex @max-4xl/settings:flex-wrap @max-4xl/settings:items-start @4xl/settings:gap-y-3'
			: // A column that can shrink, so a long name wraps rather than widening the page.
				'grid-cols-[minmax(0,1fr)]'
	]}
>
	<div class={action && '@max-4xl/settings:contents @4xl/settings:row-span-2'}>
		<h2 class="text-lg">{title}</h2>
		{#if description}
			<p
				class={[
					'mt-1 text-sm text-muted-foreground',
					action && '@max-4xl/settings:order-1 @max-4xl/settings:-mt-5 @max-4xl/settings:basis-full'
				]}
			>
				{description}
			</p>
		{/if}
	</div>
	{#if action}
		<div class="ml-auto flex max-w-full items-center gap-2">{@render action()}</div>
	{/if}
	<div
		class={[
			'min-w-0 space-y-5',
			action && '@max-4xl/settings:order-2 @max-4xl/settings:basis-full'
		]}
	>
		{@render children()}
	</div>
</section>
