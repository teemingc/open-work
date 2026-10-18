<script lang="ts" module>
	const queue: (() => void)[] = [];
	let draining = false;

	/** Mount charts one at a time when the browser is idle, so scrolling never waits on a chart. */
	function schedule(mount: () => void) {
		queue.push(mount);
		if (draining) return;
		draining = true;
		const next = () => {
			const job = queue.shift();
			if (!job) {
				draining = false;
				return;
			}
			job();
			idle(next);
		};
		idle(next);
	}

	function idle(callback: () => void) {
		if ('requestIdleCallback' in window) requestIdleCallback(callback, { timeout: 500 });
		else setTimeout(callback, 50);
	}
</script>

<script lang="ts">
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import type { Snippet } from 'svelte';

	let { class: className, children }: { class: string; children: Snippet } = $props();

	let visible = $state(false);

	/** Draw the chart once it comes near the screen. Drawing every chart at once blocks the page. */
	function observe(node: HTMLElement) {
		let active = true;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				schedule(() => {
					if (active) visible = true;
				});
			},
			{ rootMargin: '200px 0px' }
		);
		observer.observe(node);
		return () => {
			active = false;
			observer.disconnect();
		};
	}
</script>

<!-- Keeps the chart's height while it waits, so the page does not jump. -->
<div class={className} {@attach observe}>
	{#if visible}
		<div class="size-full animate-in duration-300 fade-in">
			{@render children()}
		</div>
	{:else}
		<Skeleton class="size-full" />
	{/if}
</div>
