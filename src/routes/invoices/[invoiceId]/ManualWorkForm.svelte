<script lang="ts">
	import type { ManualWorkItem } from '$lib/invoice.svelte';
	import { formatWorkType } from './formatter';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Select from '$lib/components/ui/select';

	let {
		onAdd
	}: {
		onAdd: (item: Omit<ManualWorkItem, 'id'>) => void;
	} = $props();

	const workTypes: ManualWorkItem['type'][] = [
		'experimentation',
		'investigation',
		'meeting',
		'research',
		'maintenance',
		'triage',
		'support',
		'other'
	];

	let type = $state<ManualWorkItem['type']>('experimentation');
	let title = $state('');
	let hours = $state(0.5);
	let description = $state('');
	let links = $state('');
	let date = $state(new Date().toISOString().split('T')[0]);

	let errors = $state<Record<string, string>>({});

	function validate(): boolean {
		errors = {};

		if (!title.trim()) {
			errors.title = 'Title is required';
		} else if (title.length > 100) {
			errors.title = 'Title must be 100 characters or less';
		}

		if (hours < 0.5) {
			errors.hours = 'Minimum 0.5 hours required';
		}

		// Validate links if provided
		if (links.trim()) {
			const linkList = links
				.split('\n')
				.map((l) => l.trim())
				.filter((l) => l);
			for (const link of linkList) {
				try {
					new URL(link);
				} catch {
					errors.links = `Invalid URL: ${link}`;
					break;
				}
			}
		}

		return Object.keys(errors).length === 0;
	}

	function handleSubmit() {
		if (!validate()) return;

		const linkList = links
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l);

		onAdd({
			type,
			title: title.trim(),
			hours,
			description: description.trim(),
			date: new Date(date).toISOString(),
			links: linkList.length > 0 ? linkList : undefined
		});

		// Reset form
		title = '';
		hours = 0.5;
		description = '';
		links = '';
		date = new Date().toISOString().split('T')[0];
		errors = {};
	}
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		handleSubmit();
	}}
	class="space-y-4"
>
	<div class="grid grid-cols-2 gap-4">
		<!-- Type -->
		<div class="space-y-2">
			<Label>Type</Label>
			<Select.Root type="single" bind:value={type}>
				<Select.Trigger class="w-full">
					{formatWorkType(type)}
				</Select.Trigger>
				<Select.Content>
					{#each workTypes as workType (workType)}
						<Select.Item value={workType}>{formatWorkType(workType)}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<!-- Hours -->
		<div class="space-y-2">
			<Label for="hours">
				Hours <span class="text-red-500">*</span>
			</Label>
			<Input
				id="hours"
				type="number"
				bind:value={hours}
				min="0.5"
				step="0.5"
				required
				class={errors.hours ? 'border-red-500' : ''}
			/>
			{#if errors.hours}
				<p class="mt-1 text-xs text-red-600">{errors.hours}</p>
			{/if}
		</div>
	</div>

	<!-- Title -->
	<div class="space-y-2">
		<Label for="title">
			Title <span class="text-red-500">*</span>
		</Label>
		<Input
			id="title"
			type="text"
			bind:value={title}
			maxlength={100}
			required
			placeholder="Brief description of the work"
			class={errors.title ? 'border-red-500' : ''}
		/>
		<div class="mt-1 flex justify-between">
			{#if errors.title}
				<p class="text-xs text-red-600">{errors.title}</p>
			{:else}
				<p class="text-xs text-gray-500">{title.length}/100 characters</p>
			{/if}
		</div>
	</div>

	<!-- Date -->
	<div class="space-y-2">
		<Label for="date">Date</Label>
		<Input id="date" type="date" bind:value={date} />
	</div>

	<!-- Description -->
	<div class="space-y-2">
		<Label for="description">Description (optional)</Label>
		<Textarea
			id="description"
			bind:value={description}
			rows={3}
			placeholder="Detailed description of the work done"
		/>
	</div>

	<!-- Links -->
	<div class="space-y-2">
		<Label for="links">Supporting Links (optional)</Label>
		<Textarea
			id="links"
			bind:value={links}
			rows={2}
			placeholder="One URL per line"
			class={`font-mono ${errors.links ? 'border-red-500' : ''}`}
		/>
		{#if errors.links}
			<p class="mt-1 text-xs text-red-600">{errors.links}</p>
		{/if}
	</div>

	<Button type="submit" class="w-full">Add Work Item</Button>
</form>
