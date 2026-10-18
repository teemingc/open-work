<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import RetryableError from '#lib/components/RetryableError.svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { CircleAlert } from '@lucide/svelte';
</script>

<svelte:head
	><title>{page.status === 404 ? 'Not found' : 'Something went wrong'} · Open Work</title
	></svelte:head
>

<Alert.Root variant="destructive">
	<CircleAlert />
	<Alert.Title>
		{page.status === 404 ? 'This page does not exist' : 'Could not load this page'}
	</Alert.Title>
	<Alert.Description>
		<RetryableError error={page.error} onretry={() => invalidateAll()} />
	</Alert.Description>
</Alert.Root>
