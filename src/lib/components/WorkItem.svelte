<script lang="ts">
	import { refCells, refUrl, type WorkRef } from '#lib/worklog.js';
	import { CalendarClock, CircleDot, GitPullRequest, ShieldAlert } from '@lucide/svelte';

	let { ref, organization }: { ref: WorkRef; organization?: string } = $props();

	const ICONS = {
		pr: GitPullRequest,
		issue: CircleDot,
		advisory: ShieldAlert,
		task: CalendarClock
	} satisfies Record<WorkRef['kind'], unknown>;

	const Icon = $derived(ICONS[ref.kind]);
	const url = $derived(refUrl(ref));
	const [repository, item] = $derived(refCells({ ref, organization }));
</script>

<!-- The icon sits on the first line, in a column of its own, when the reference wraps. -->
<span class="inline-flex min-w-0 items-start gap-1.5">
	<span class="flex h-lh w-3.5 shrink-0 items-center justify-center">
		<Icon size={14} class="text-muted-foreground" aria-hidden="true" />
	</span>
	{#if url}
		<!-- Wraps rather than truncating, so the whole reference shows. Positioned, so the link's hidden
			text cannot widen the page. -->
		<span class="relative min-w-0 wrap-break-word">
			<span class="text-muted-foreground">{repository}</span>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
			<a href={url} target="_blank" rel="noreferrer" class="hover:underline"
				>{item}<span class="sr-only"> (opens in a new tab)</span></a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</span>
	{:else}
		<span class="min-w-0 wrap-break-word">{item}</span>
	{/if}
</span>
