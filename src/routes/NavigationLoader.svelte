<script lang="ts">
	import { navigating } from '$app/state';
	import type { TransitionConfig } from 'svelte/transition';

	/** Fill the bar before fading it out, unless the navigation ended before it appeared. */
	function finish(node: HTMLElement): TransitionConfig {
		const bar = node.firstElementChild as HTMLElement;
		const scale = new DOMMatrixReadOnly(getComputedStyle(bar).transform).a;
		if (scale > 0) {
			bar.style.animation = 'none';
			bar.style.transform = `scaleX(${scale})`;
			requestAnimationFrame(() => {
				bar.style.transition = 'transform 150ms ease-out';
				bar.style.transform = 'scaleX(1)';
			});
		}
		return { delay: scale > 0 ? 150 : 0, duration: 200, css: (t) => `opacity: ${t}` };
	}
</script>

{#if navigating.to}
	<div class="loader" out:finish aria-hidden="true">
		<div class="bar"></div>
	</div>
{/if}

<style>
	.loader {
		position: fixed;
		inset: 0 0 auto;
		z-index: 50;
		height: 3px;
		pointer-events: none;
	}

	.bar {
		height: 100%;
		background: var(--color-primary);
		transform: scaleX(0);
		transform-origin: left;
		/* Quick navigations finish before the delay and never show the bar. */
		animation: creep 12s cubic-bezier(0.05, 0.7, 0.1, 1) 300ms forwards;
	}

	@keyframes creep {
		from {
			transform: scaleX(0.08);
		}
		to {
			transform: scaleX(0.92);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bar {
			animation: appear 0s 300ms forwards;
		}

		@keyframes appear {
			to {
				transform: scaleX(1);
				opacity: 0.6;
			}
		}
	}
</style>
