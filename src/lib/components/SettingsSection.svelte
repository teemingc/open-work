<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, description, children }: { title: string; description?: string; children: Snippet } =
		$props();
</script>

<section class="grid gap-6 border-t py-8 first:border-t-0 first:pt-0 md:grid-cols-[14rem_1fr]">
	<div>
		<h2 class="text-lg">{title}</h2>
		{#if description}
			<p class="mt-1 text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	<div class="space-y-5">{@render children()}</div>
</section>
