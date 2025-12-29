<script lang="ts" generics="T">
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { CheckIcon, ChevronsUpDownIcon } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	interface Props {
		label: string;
		placeholder?: string;
		displayText: string;
		availableItems: T[];
		selectedItems: T[];
		isLoading?: boolean;
		error?: string;
		helpText?: string;
		onSelect: (item: T) => void;
		onRemove: (item: T) => void;
		getItemValue: (item: T) => string;
		getItemLabel: (item: T) => string;
		getItemDescription?: (item: T) => string | null;
		isItemSelected: (item: T) => boolean;
	}

	let {
		label,
		placeholder = 'Search...',
		displayText,
		availableItems,
		selectedItems,
		isLoading = false,
		error,
		helpText,
		onSelect,
		onRemove,
		getItemValue,
		getItemLabel,
		getItemDescription,
		isItemSelected
	}: Props = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement>(null!);
</script>

<div class="space-y-2">
	<Label>{label}</Label>
	<Popover.Root bind:open>
		<Popover.Trigger bind:ref={triggerRef}>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					class="w-full justify-between"
					role="combobox"
					aria-expanded={open}
				>
					<span class="truncate">{displayText}</span>
					<ChevronsUpDownIcon class="ms-2 size-4 shrink-0 opacity-50" />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-full p-0" align="start">
			<Command.Root shouldFilter={true}>
				<Command.Input {placeholder} />
				<Command.List>
					{#if isLoading}
						<Command.Loading>Loading...</Command.Loading>
					{:else if availableItems.length === 0}
						<Command.Empty>No items found.</Command.Empty>
					{:else}
						<Command.Group>
							{#each availableItems as item (getItemValue(item))}
								{@const isSelected = isItemSelected(item)}
								<Command.Item value={getItemValue(item)} onSelect={() => onSelect(item)}>
									<CheckIcon class={cn('me-2 size-4', !isSelected && 'text-transparent')} />
									<div class="flex flex-1 flex-col gap-0.5">
										<span class="font-mono text-sm">{getItemLabel(item)}</span>
										{#if getItemDescription}
											{@const description = getItemDescription(item)}
											{#if description}
												<span class="text-xs text-muted-foreground">
													{description}
												</span>
											{/if}
										{/if}
									</div>
								</Command.Item>
							{/each}
						</Command.Group>
					{/if}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>

	{#if selectedItems.length > 0}
		<div class="space-y-1">
			{#each selectedItems as item (getItemValue(item))}
				<div class="flex items-center justify-between rounded bg-blue-50 p-2">
					<span class="font-mono text-sm">{getItemLabel(item)}</span>
					<button
						type="button"
						onclick={() => onRemove(item)}
						class="text-sm text-red-600 hover:text-red-800"
					>
						Remove
					</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if helpText}
		<p class="text-xs text-gray-500">{helpText}</p>
	{/if}
	{#if error}
		<p class="text-sm text-red-600">{error}</p>
	{/if}
</div>
