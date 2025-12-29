<script lang="ts">
	import MultiSelectCombobox from '$lib/components/MultiSelectCombobox.svelte';

	interface Repository {
		name: string;
		description: string | null;
		archived: boolean;
	}

	interface Props {
		organization: string;
		selectedRepositories: string[];
		onToggle: (repository: string) => void;
		githubToken?: string;
		error?: string;
	}

	let { organization, selectedRepositories, onToggle, githubToken, error }: Props = $props();

	async function fetchOrganizationRepos(org: string, token?: string) {
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github.v3+json'
		};

		if (token) {
			headers.Authorization = `token ${token}`;
		}

		const response = await fetch(
			`https://api.github.com/orgs/${org}/repos?per_page=100&sort=updated`,
			{ headers }
		);

		if (!response.ok) {
			throw new Error('Failed to fetch repositories');
		}

		const data = (await response.json()) as Repository[];
		// Filter out archived/deprecated repositories
		return data.filter((repo) => !repo.archived);
	}

	// Reactive promise that refetches when organization or token changes
	let reposPromise = $derived(
		organization ? fetchOrganizationRepos(organization, githubToken) : Promise.resolve([])
	);

	function handleSelect(repo: Repository) {
		const fullRepoName = `${organization}/${repo.name}`;
		onToggle(fullRepoName);
	}

	function handleRemove(fullRepoName: string) {
		onToggle(fullRepoName);
	}

	// Convert selected string array to Repository objects for display
	const selectedRepoObjects = $derived.by(() => {
		return selectedRepositories.map((fullName) => {
			const repoName = fullName.split('/')[1] || fullName;
			return {
				name: repoName,
				description: null,
				archived: false
			} satisfies Repository;
		});
	});

	const displayText = $derived.by(() => {
		if (selectedRepositories.length === 0) return 'Select repositories...';
		return `${selectedRepositories.length} ${selectedRepositories.length === 1 ? 'repository' : 'repositories'} selected`;
	});
</script>

{#await reposPromise}
	<MultiSelectCombobox
		label="Repositories"
		placeholder="Search repositories..."
		{displayText}
		availableItems={[]}
		selectedItems={selectedRepoObjects}
		isLoading={true}
		{error}
		helpText="Select repositories from the {organization} organization. Archived repositories are hidden."
		onSelect={handleSelect}
		onRemove={(repo) => handleRemove(`${organization}/${repo.name}`)}
		getItemValue={(repo) => repo.name}
		getItemLabel={(repo) => repo.name}
		getItemDescription={(repo) => repo.description}
		isItemSelected={(repo) => selectedRepositories.includes(`${organization}/${repo.name}`)}
	/>
{:then availableRepos}
	<MultiSelectCombobox
		label="Repositories"
		placeholder="Search repositories..."
		{displayText}
		availableItems={availableRepos}
		selectedItems={selectedRepoObjects}
		isLoading={false}
		{error}
		helpText="Select repositories from the {organization} organization. Archived repositories are hidden."
		onSelect={handleSelect}
		onRemove={(repo) => handleRemove(`${organization}/${repo.name}`)}
		getItemValue={(repo) => repo.name}
		getItemLabel={(repo) => repo.name}
		getItemDescription={(repo) => repo.description}
		isItemSelected={(repo) => selectedRepositories.includes(`${organization}/${repo.name}`)}
	/>
{:catch err}
	<MultiSelectCombobox
		label="Repositories"
		placeholder="Search repositories..."
		{displayText}
		availableItems={[]}
		selectedItems={selectedRepoObjects}
		isLoading={false}
		error={err instanceof Error ? err.message : 'Failed to fetch repositories'}
		helpText="Select repositories from the {organization} organization. Archived repositories are hidden."
		onSelect={handleSelect}
		onRemove={(repo) => handleRemove(`${organization}/${repo.name}`)}
		getItemValue={(repo) => repo.name}
		getItemLabel={(repo) => repo.name}
		getItemDescription={(repo) => repo.description}
		isItemSelected={(repo) => selectedRepositories.includes(`${organization}/${repo.name}`)}
	/>
{/await}
