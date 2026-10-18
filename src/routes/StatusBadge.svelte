<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { isDead, statusLabel } from './expenses';

	let { status }: { status: string } = $props();

	const color = $derived(
		status === 'PAID'
			? 'text-status-paid'
			: isDead(status) || status === 'ERROR'
				? 'text-destructive'
				: status === 'DRAFT' || status === 'INCOMPLETE'
					? 'text-status-draft'
					: 'text-status-submitted'
	);
</script>

<Badge variant="outline" class={['bg-card', color]}>
	<span class="size-1.5 rounded-full bg-current"></span>
	{statusLabel(status)}
</Badge>
