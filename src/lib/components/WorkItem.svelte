<script lang="ts">
	import { describeRef, refCells, refUrl, type WorkRef } from '#lib/worklog.js';
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

<span class="inline-flex min-w-0 items-center gap-1.5" title={describeRef(ref)}>
	<Icon size={14} class="shrink-0 text-muted-foreground" aria-hidden="true" />
	{#if url}
		<span class="truncate">
			<span class="text-muted-foreground">{repository}</span>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- external site -->
			<a href={url} target="_blank" rel="noreferrer" class="hover:underline"
				>{item}<span class="sr-only"> (opens in a new tab)</span></a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</span>
	{:else}
		<span class="truncate">{item}</span>
	{/if}
</span>
