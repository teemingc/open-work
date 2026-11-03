<script lang="ts">
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';

	/** One height for each section, as tall as it, so the footer stays put when the page arrives. */
	let { label, heights }: { label: string; heights: string[] } = $props();
</script>

<div aria-busy="true">
	<p class="sr-only">{label}</p>
	{#each heights as height, index (index)}
		<div class="grid gap-6 border-t py-8 first:border-t-0 first:pt-0 md:grid-cols-[14rem_1fr]">
			<div class="space-y-2">
				<Skeleton class="h-6 w-28" />
				<Skeleton class="h-4 w-48 max-w-full" />
			</div>
			<Skeleton class={[height, 'w-full rounded-lg']} />
		</div>
	{/each}
</div>
