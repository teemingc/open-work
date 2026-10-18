<script lang="ts">
	import { cn } from '#lib/utils.js';
	import { LoaderCircle } from '@lucide/svelte';

	let { class: className }: { class?: string } = $props();
</script>

<LoaderCircle role="status" aria-label="Loading" class={cn('size-4 animate-spin', className)} />
