<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { RotateCcw } from '@lucide/svelte';
	import { isHttpError } from '@sveltejs/kit';

	let { error, onretry }: { error: unknown; onretry: () => void } = $props();

	const details = $derived.by((): { message: string; retryAfter?: number } => {
		if (isHttpError(error)) return error.body;
		if (error && typeof error === 'object' && 'message' in error) {
			const { message, retryAfter } = error as { message: unknown; retryAfter?: number };
			return { message: String(message), retryAfter };
		}
		return { message: 'Something went wrong.' };
	});

	let left = $state(0);

	/** Count down the wait Open Collective asked for, a second at a time. */
	function countdown() {
		left = details.retryAfter ?? 0;
		if (left <= 0) return;
		const timer = setInterval(() => {
			left = Math.max(0, left - 1);
			if (left === 0) clearInterval(timer);
		}, 1000);
		return () => clearInterval(timer);
	}
</script>

{#key error}
	<div class="flex flex-col items-start gap-2" {@attach countdown}>
		<p>
			{details.message}
			{#if left > 0}
				Try again in <span class="tabular-nums">{left}</span>
				{left === 1 ? 'second' : 'seconds'}.
			{/if}
		</p>
		<Button variant="outline" size="sm" disabled={left > 0} onclick={onretry}>
			<RotateCcw /> Try again
		</Button>
	</div>
{/key}
