<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { LogIn, RotateCcw } from '@lucide/svelte';
	import { isHttpError } from '@sveltejs/kit';

	let { error, onretry }: { error: unknown; onretry: () => unknown } = $props();

	const details = $derived.by((): { message: string; retryAfter?: number; connect?: boolean } => {
		if (isHttpError(error)) return error.body;
		if (error && typeof error === 'object' && 'message' in error) {
			const { message, retryAfter, connect } = error as {
				message: unknown;
				retryAfter?: number;
				connect?: boolean;
			};
			return { message: String(message), retryAfter, connect };
		}
		return { message: 'Something went wrong.' };
	});

	let left = $state(0);

	/** Count down the wait Open Collective asked for, a second at a time. */
	function countdown() {
		// Read the wait into a local: reading `left` here would make each tick re-run this and restart the count.
		const wait = details.retryAfter ?? 0;
		left = wait;
		if (wait <= 0) return;
		const timer = setInterval(() => {
			left = Math.max(0, left - 1);
			if (left === 0) clearInterval(timer);
		}, 1000);
		return () => clearInterval(timer);
	}

	let retrying = $state(false);

	async function retry() {
		retrying = true;
		try {
			await onretry();
		} finally {
			retrying = false;
		}
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
		{#if details.connect}
			<p>Connect your Open Collective account in settings to get a higher limit.</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			{#if details.connect}
				<Button href="{resolve('/settings')}#oc-connection" size="sm">
					<LogIn /> Connect Open Collective
				</Button>
			{/if}
			<Button variant="outline" size="sm" disabled={left > 0 || retrying} onclick={retry}>
				{#if retrying}<Spinner /> Trying again{:else}<RotateCcw /> Try again{/if}
			</Button>
		</div>
	</div>
{/key}
