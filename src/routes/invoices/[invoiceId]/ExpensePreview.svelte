<script lang="ts">
	import type { MonthlyInvoice } from '../../../lib/invoice.svelte';
	import { generateExpenseTitle, generateExpenseDescription } from './formatter';
	import { Button } from '$lib/components/ui/button';
	import { Check, Clipboard, Download } from 'lucide-svelte';

	let {
		invoice,
		settings
	}: {
		invoice: MonthlyInvoice;
		settings: { hourlyRate?: number; defaultCurrency?: string };
	} = $props();

	let isEditing = $state(false);
	let customTitle = $state('');
	let customDescription = $state('');
	let copiedTitle = $state(false);
	let copiedDescription = $state(false);

	const generatedTitle = $derived(generateExpenseTitle(invoice));
	const generatedDescription = $derived(
		generateExpenseDescription(invoice, settings.hourlyRate, settings.defaultCurrency || 'USD')
	);

	const displayTitle = $derived(isEditing && customTitle ? customTitle : generatedTitle);
	const displayDescription = $derived(
		isEditing && customDescription ? customDescription : generatedDescription
	);

	function startEditing() {
		isEditing = true;
		customTitle = generatedTitle;
		customDescription = generatedDescription;
	}

	function resetToGenerated() {
		isEditing = false;
		customTitle = '';
		customDescription = '';
	}

	async function copyTitle() {
		try {
			await navigator.clipboard.writeText(displayTitle);
			copiedTitle = true;
			setTimeout(() => (copiedTitle = false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	async function copyDescription() {
		try {
			await navigator.clipboard.writeText(displayDescription);
			copiedDescription = true;
			setTimeout(() => (copiedDescription = false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	function downloadAsText() {
		const text = `${displayTitle}\n\n${displayDescription}`;
		const blob = new Blob([text], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `expense-${invoice.id}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="overflow-hidden rounded-lg border bg-white">
	<div class="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
		<h3 class="font-semibold">Expense Preview</h3>
		<div class="flex gap-2">
			{#if !isEditing}
				<Button type="button" onclick={startEditing} variant="ghost" size="sm">Edit Custom</Button>
			{:else}
				<Button type="button" onclick={resetToGenerated} variant="ghost" size="sm">
					Reset to Generated
				</Button>
			{/if}
		</div>
	</div>

	<div class="space-y-4 p-4">
		<!-- Title -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<label for="expense-title" class="text-sm font-medium text-gray-700">Title:</label>
				<Button
					type="button"
					onclick={copyTitle}
					variant="outline"
					size="sm"
					class="h-7 gap-1 px-2 text-xs"
				>
					{#if copiedTitle}
						<Check size={12} />Copied!
					{:else}
						<Clipboard size={12} />Copy
					{/if}
				</Button>
			</div>
			{#if isEditing}
				<input
					id="expense-title"
					type="text"
					bind:value={customTitle}
					class="w-full rounded border px-3 py-2 font-mono text-sm"
				/>
			{:else}
				<div class="rounded border bg-gray-50 p-3 font-mono text-sm">
					{displayTitle}
				</div>
			{/if}
		</div>

		<!-- Description -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<label for="expense-description" class="text-sm font-medium text-gray-700"
					>Description:</label
				>
				<Button
					type="button"
					onclick={copyDescription}
					variant="outline"
					size="sm"
					class="h-7 gap-1 px-2 text-xs"
				>
					{#if copiedDescription}
						<Check size={12} />Copied!
					{:else}
						<Clipboard size={12} />Copy
					{/if}
				</Button>
			</div>
			{#if isEditing}
				<textarea
					id="expense-description"
					bind:value={customDescription}
					rows="12"
					class="w-full rounded border px-3 py-2 font-mono text-sm"
				></textarea>
			{:else}
				<div class="rounded border bg-gray-50 p-3 font-mono text-sm wrap-break-word">
					{displayDescription}
				</div>
			{/if}
		</div>

		<!-- Character count -->
		<div class="text-xs text-gray-500">
			{displayDescription.length} characters
		</div>

		<!-- Actions -->
		<div class="flex gap-2">
			<button
				type="button"
				onclick={downloadAsText}
				class="flex items-center gap-2 rounded border px-4 py-2 text-sm hover:bg-gray-50"
			>
				<Download size={16} />Download as Text
			</button>
		</div>
	</div>
</div>
