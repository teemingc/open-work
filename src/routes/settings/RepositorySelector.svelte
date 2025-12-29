<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';

	let { selected = $bindable<string[]>([]), organization = '' } = $props();

	const commonRepos = [
		'sveltejs/kit',
		'sveltejs/svelte',
		'sveltejs/vite-plugin-svelte',
		'sveltejs/language-tools',
		'sveltejs/svelte-devtools',
		'sveltejs/adapter-vercel',
		'sveltejs/adapter-cloudflare',
		'sveltejs/adapter-node',
		'sveltejs/adapter-static',
		'sveltejs/svelte.dev'
	];

	// Filter common repos to only show those that match the organization
	const filteredCommonRepos = $derived(
		organization ? commonRepos.filter((repo) => repo.startsWith(`${organization}/`)) : commonRepos
	);

	let customRepo = $state('');
	let showCustomInput = $state(false);
	let error = $state('');

	function toggleRepo(repo: string) {
		const index = selected.indexOf(repo);
		if (index !== -1) {
			selected.splice(index, 1);
		} else {
			selected.push(repo);
		}
	}

	function addCustomRepo() {
		error = '';

		if (!customRepo.trim()) {
			error = 'Repository name cannot be empty';
			return;
		}

		// Auto-prefix with organization if not already prefixed
		let repoName = customRepo.trim();
		if (!repoName.includes('/')) {
			if (organization) {
				repoName = `${organization}/${repoName}`;
			} else {
				error = 'Please set an organization first or use the full repository path (owner/repo)';
				return;
			}
		}

		// Validate format: owner/repo
		const parts = repoName.split('/');
		if (parts.length !== 2 || !parts[0] || !parts[1]) {
			error = 'Invalid format. Use: owner/repository';
			return;
		}

		// Validate that repository belongs to the organization (if organization is set)
		if (organization) {
			const [owner] = parts;
			if (owner !== organization) {
				error = `Repository must belong to the ${organization} organization`;
				return;
			}
		}

		if (selected.includes(repoName)) {
			error = 'Repository already added';
			return;
		}

		selected.push(repoName);
		customRepo = '';
		showCustomInput = false;
	}

	function removeCustomRepo(repo: string) {
		const index = selected.indexOf(repo);
		if (index !== -1) {
			selected.splice(index, 1);
		}
	}
</script>

<div class="space-y-4">
	{#if filteredCommonRepos.length > 0}
		<div class="space-y-2">
			<p class="text-sm text-gray-600">
				{organization ? `Common ${organization} repositories:` : 'Common Svelte repositories:'}
			</p>
			<div class="space-y-1">
				{#each filteredCommonRepos as repo (repo)}
					<label class="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-gray-50">
						<Checkbox checked={selected.includes(repo)} onCheckedChange={() => toggleRepo(repo)} />
						<span class="font-mono text-sm">{repo}</span>
					</label>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Custom repositories -->
	{#if selected.some((r) => !commonRepos.includes(r))}
		<div class="space-y-2">
			<p class="text-sm text-gray-600">
				{organization ? `${organization} repositories:` : 'Repositories:'}
			</p>
			<div class="space-y-1">
				{#each selected.filter((r) => !commonRepos.includes(r)) as repo (repo)}
					<div class="flex items-center justify-between rounded bg-blue-50 p-2">
						<span class="font-mono text-sm">{repo}</span>
						<Button
							type="button"
							onclick={() => removeCustomRepo(repo)}
							variant="ghost"
							size="sm"
							class="text-red-600 hover:text-red-800"
						>
							Remove
						</Button>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Add custom repository -->
	<div>
		{#if !showCustomInput}
			<Button
				type="button"
				onclick={() => (showCustomInput = true)}
				variant="ghost"
				size="sm"
				class="gap-1"
			>
				<Plus class="h-4 w-4" /> Add {organization ? 'another' : 'custom'} repository...
			</Button>
		{:else}
			<div class="space-y-2">
				<div class="flex gap-2">
					{#if organization}
						<div class="relative flex-1">
							<span
								class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-gray-500"
							>
								{organization}/
							</span>
							<input
								type="text"
								bind:value={customRepo}
								placeholder="repository-name"
								style="padding-left: calc(1rem + {organization.length * 0.6}em)"
								class="w-full rounded border px-3 py-2 text-sm"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										addCustomRepo();
									}
								}}
							/>
						</div>
					{:else}
						<input
							type="text"
							bind:value={customRepo}
							placeholder="owner/repository"
							class="flex-1 rounded border px-3 py-2 text-sm"
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									addCustomRepo();
								}
							}}
						/>
					{/if}
					<Button type="button" onclick={addCustomRepo} size="sm">Add</Button>
					<Button
						type="button"
						onclick={() => {
							showCustomInput = false;
							customRepo = '';
							error = '';
						}}
						variant="outline"
						size="sm"
					>
						Cancel
					</Button>
				</div>
				{#if error}
					<p class="text-sm text-red-600">{error}</p>
				{/if}
			</div>
		{/if}
	</div>

	<p class="text-xs text-gray-500">
		Selected: {selected.length}
		{selected.length === 1 ? 'repository' : 'repositories'}
	</p>
</div>
