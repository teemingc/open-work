<script lang="ts">
	import { invoiceStore } from '../../lib/invoice.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import RepositoryAutocomplete from './RepositoryAutocomplete.svelte';
	import { Check } from 'lucide-svelte';

	let step = $state<'username' | 'organization' | 'repositories'>('username');
	let githubUsername = $state(invoiceStore.state.settings.githubUsername ?? '');
	let organization = $state(invoiceStore.state.settings.organization ?? '');
	let repositories = $state<string[]>(invoiceStore.state.settings.repositories ?? []);
	let error = $state('');
	let loading = $state(false);

	function handleUsernameNext() {
		error = '';
		if (!githubUsername.trim()) {
			error = 'Please enter your GitHub username';
			return;
		}
		step = 'organization';
	}

	function handleOrganizationNext() {
		error = '';
		if (!organization.trim()) {
			error = 'Please enter an organization';
			return;
		}
		step = 'repositories';
	}

	function toggleRepository(fullRepoName: string) {
		error = '';

		const index = repositories.indexOf(fullRepoName);
		if (index !== -1) {
			// Remove if already selected
			repositories.splice(index, 1);
		} else {
			// Add if not selected
			repositories.push(fullRepoName);
		}
	}

	async function completeSetup() {
		error = '';
		if (repositories.length === 0) {
			error = 'Please add at least one repository';
			return;
		}

		loading = true;

		// Save settings
		invoiceStore.updateSettings({
			githubUsername,
			organization,
			repositories
		});

		// Navigate to home
		await goto(resolve('/'));
	}

	function goBack() {
		error = '';
		if (step === 'organization') {
			step = 'username';
		} else if (step === 'repositories') {
			step = 'organization';
		}
	}
</script>

<div class="mx-auto max-w-2xl">
	<div class="mb-8 text-center">
		<h1 class="mb-2 text-3xl font-bold">Welcome to OpenCollective Invoice Generator</h1>
		<p class="text-gray-600">Let's get you set up in just a few steps</p>
		{#if invoiceStore.isSetupComplete}
			<div class="mt-4">
				<a
					href={resolve('/')}
					class="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
				>
					Skip to Home →
				</a>
			</div>
		{/if}
	</div>

	<!-- Progress indicator -->
	<div class="mb-8 flex items-center justify-center gap-2">
		<div class="flex items-center">
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full {step === 'username'
					? 'bg-blue-600 text-white'
					: 'bg-green-600 text-white'}"
			>
				{#if step === 'username'}
					1
				{:else}
					<Check size={18} />
				{/if}
			</div>
			<span class="ml-2 text-sm {step === 'username' ? 'font-semibold' : 'text-gray-600'}"
				>Username</span
			>
		</div>
		<div class="mx-4 h-px w-12 bg-gray-300"></div>
		<div class="flex items-center">
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full {step === 'organization'
					? 'bg-blue-600 text-white'
					: step === 'repositories'
						? 'bg-green-600 text-white'
						: 'bg-gray-300 text-gray-600'}"
			>
				{#if step === 'username' || step === 'organization'}
					2
				{:else}
					<Check size={18} />
				{/if}
			</div>
			<span
				class="ml-2 text-sm {step === 'organization'
					? 'font-semibold'
					: step === 'repositories'
						? 'text-gray-600'
						: 'text-gray-400'}"
			>
				Organization
			</span>
		</div>
		<div class="mx-4 h-px w-12 bg-gray-300"></div>
		<div class="flex items-center">
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full {step === 'repositories'
					? 'bg-blue-600 text-white'
					: 'bg-gray-300 text-gray-600'}"
			>
				3
			</div>
			<span class="ml-2 text-sm {step === 'repositories' ? 'font-semibold' : 'text-gray-400'}">
				Repositories
			</span>
		</div>
	</div>

	<!-- Setup forms -->
	<div class="rounded-lg border bg-white p-8 shadow">
		{#if step === 'username'}
			<div class="space-y-6">
				<div>
					<h2 class="mb-2 text-xl font-semibold">What's your GitHub username?</h2>
					<p class="text-sm text-gray-600">
						This will be used to track your contributions across repositories
					</p>
				</div>

				<div class="space-y-2">
					<Label for="github-username">GitHub Username</Label>
					<Input
						id="github-username"
						type="text"
						bind:value={githubUsername}
						placeholder="octocat"
						autofocus
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								handleUsernameNext();
							}
						}}
					/>
				</div>

				{#if error}
					<p class="text-sm text-red-600">{error}</p>
				{/if}

				<div class="flex justify-end">
					<Button type="button" onclick={handleUsernameNext}>Next →</Button>
				</div>
			</div>
		{:else if step === 'organization'}
			<div class="space-y-6">
				<div>
					<h2 class="mb-2 text-xl font-semibold">Which organization do you contribute to?</h2>
					<p class="text-sm text-gray-600">
						Enter the GitHub organization that manages the OpenCollective account
					</p>
				</div>

				<div class="space-y-2">
					<Label for="organization">Organization</Label>
					<Input
						id="organization"
						type="text"
						bind:value={organization}
						placeholder="sveltejs"
						autofocus
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								handleOrganizationNext();
							}
						}}
					/>
					<p class="text-xs text-gray-500">Example: sveltejs, facebook, microsoft</p>
				</div>

				{#if error}
					<p class="text-sm text-red-600">{error}</p>
				{/if}

				<div class="flex justify-between">
					<Button type="button" variant="outline" onclick={goBack}>← Back</Button>
					<Button type="button" onclick={handleOrganizationNext}>Next →</Button>
				</div>
			</div>
		{:else if step === 'repositories'}
			<div class="space-y-6">
				<div>
					<h2 class="mb-2 text-xl font-semibold">Add repositories to track</h2>
					<p class="text-sm text-gray-600">
						Add repositories from the <strong>{organization}</strong> organization that you contribute
						to
					</p>
				</div>

				<!-- Add repository input -->
				<RepositoryAutocomplete
					{organization}
					selectedRepositories={repositories}
					onToggle={toggleRepository}
					githubToken={invoiceStore.state.settings.githubToken}
					{error}
				/>

				<div class="flex justify-between">
					<Button type="button" variant="outline" onclick={goBack}>← Back</Button>
					<Button
						type="button"
						onclick={completeSetup}
						disabled={repositories.length === 0 || loading}
					>
						{loading ? 'Setting up...' : 'Complete Setup →'}
					</Button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Help text -->
	<div class="mt-6 text-center text-sm text-gray-600">
		<p>
			Need help? Check out the
			<a
				href="https://github.com/settings"
				target="_blank"
				rel="noopener noreferrer"
				class="text-blue-600 hover:underline"
			>
				GitHub settings
			</a>
			to verify your organization and repositories
		</p>
	</div>
</div>
