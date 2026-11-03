<script lang="ts">
	import { cn } from '#lib/utils.js';
	import { LoaderCircle } from '@lucide/svelte';

	let { class: className }: { class?: string } = $props();
</script>

<!-- The wrapper takes no box of its own, so the class still sizes and places the icon. -->
<span role="status" class="contents">
	<LoaderCircle
		aria-hidden="true"
		class={cn('size-4 animate-spin motion-reduce:animate-none', className)}
	/>
	<span class="sr-only">Loading</span>
</span>
