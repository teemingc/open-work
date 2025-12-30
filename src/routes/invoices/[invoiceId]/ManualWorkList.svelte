<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { ManualWorkItem } from '../../../lib/invoice.svelte';
	import { formatWorkType } from './formatter';
	import {
		Microscope,
		Search,
		Users,
		BookOpen,
		Wrench,
		Target,
		MessageCircle,
		FileText
	} from 'lucide-svelte';

	let {
		items,
		onDelete
	}: {
		items: ManualWorkItem[];
		onDelete: (id: string) => void;
	} = $props();

	const totalHours = $derived(items.reduce((sum, i) => sum + i.hours, 0));

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getTypeIcon(type: ManualWorkItem['type']) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dunno what the icon component types are
		const icons: Record<ManualWorkItem['type'], any> = {
			experimentation: Microscope,
			investigation: Search,
			meeting: Users,
			research: BookOpen,
			maintenance: Wrench,
			triage: Target,
			support: MessageCircle,
			other: FileText
		};
		return icons[type];
	}
</script>

<div class="space-y-4">
	<!-- Summary -->
	<div class="flex items-center justify-between rounded bg-gray-50 p-3 text-sm text-gray-600">
		<span>{items.length} manual items</span>
		<span>{totalHours}h total</span>
	</div>

	<!-- Items list -->
	<div class="space-y-2">
		{#each items as item (item.id)}
			{@const IconComponent = getTypeIcon(item.type)}
			<div class="rounded-lg border p-3 transition-colors hover:bg-gray-50">
				<div class="flex items-start justify-between gap-3">
					<div class="flex flex-1 items-start gap-2">
						<IconComponent size={20} class="mt-0.5 shrink-0" />
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-xs text-gray-500">{formatWorkType(item.type)}</span>
								<span class="text-xs text-gray-400">•</span>
								<span class="text-xs text-gray-500">{formatDate(item.date)}</span>
								<span class="text-xs text-gray-400">•</span>
								<span class="text-xs font-semibold text-blue-600">{item.hours}h</span>
							</div>
							<p class="mt-1 text-sm font-medium">{item.title}</p>
							{#if item.description}
								<p class="mt-1 text-xs text-gray-600">{item.description}</p>
							{/if}
							{#if item.links && item.links.length > 0}
								<div class="mt-2 space-y-1">
									{#each item.links as link (link)}
										<a
											href={link}
											target="_blank"
											rel="noopener noreferrer"
											class="block text-xs text-blue-600 hover:underline"
										>
											{link}
										</a>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<div class="flex gap-2">
						<button
							type="button"
							onclick={() => {
								if (confirm('Delete this item?')) {
									onDelete(item.id);
								}
							}}
							class="text-sm text-red-600 hover:text-red-800"
						>
							Delete
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#if items.length === 0}
		<div class="py-8 text-center text-gray-500">
			<p>No manual work items added yet.</p>
		</div>
	{/if}
</div>
