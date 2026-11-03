<script lang="ts">
	import type { Client } from '#lib/worklog.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		client,
		...rest
	}: HTMLAttributes<HTMLSpanElement> & { client: Pick<Client, 'name' | 'logo'> } = $props();
</script>

<!-- Sized in em, so the logo matches the name's text wherever it is shown. -->
<span {...rest} class={['inline-flex max-w-full min-w-0 items-center gap-[0.4em]', rest.class]}>
	{#if client.logo}
		<img src={client.logo} alt="" class="size-[1.15em] shrink-0 rounded-[0.2em]" />
	{/if}
	<span class="min-w-0 wrap-break-word">{client.name}</span>
</span>
