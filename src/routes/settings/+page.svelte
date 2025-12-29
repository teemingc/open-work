<script lang="ts">
	import { invoiceStore } from '../../lib/invoice.svelte';
	import { testGitHubToken } from '../invoices/[invoiceId]/github';
	import RepositoryAutocomplete from '../setup/RepositoryAutocomplete.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import {
		Check,
		X,
		Download,
		FolderOpen,
		Trash2,
		CheckCircle2,
		AlertTriangle
	} from 'lucide-svelte';

	// Initialize from settings only once
	let githubUsername = $state(invoiceStore.state.settings.githubUsername || '');
	let githubToken = $state(invoiceStore.state.settings.githubToken || '');
	let organization = $state(invoiceStore.state.settings.organization || '');
	let repositories = $state<string[]>(invoiceStore.state.settings.repositories || []);
	let hourlyRate = $state(invoiceStore.state.settings.hourlyRate || 0);
	let defaultCurrency = $state(invoiceStore.state.settings.defaultCurrency || 'USD');
	let monthlyHourGoal = $state(invoiceStore.state.settings.monthlyHourGoal || 0);

	let tokenStatus = $state<'unknown' | 'testing' | 'valid' | 'invalid'>('unknown');
	let savedMessage = $state('');

	function toggleRepository(fullRepoName: string) {
		const index = repositories.indexOf(fullRepoName);
		if (index !== -1) {
			repositories.splice(index, 1);
		} else {
			repositories.push(fullRepoName);
		}
	}

	async function testToken() {
		if (!githubToken) return;

		tokenStatus = 'testing';
		const isValid = await testGitHubToken(githubToken);
		tokenStatus = isValid ? 'valid' : 'invalid';

		setTimeout(() => {
			if (tokenStatus !== 'testing') tokenStatus = 'unknown';
		}, 3000);
	}

	function saveSettings() {
		invoiceStore.updateSettings({
			githubUsername: githubUsername || undefined,
			githubToken: githubToken || undefined,
			organization: organization || undefined,
			repositories,
			hourlyRate: hourlyRate > 0 ? hourlyRate : undefined,
			defaultCurrency,
			monthlyHourGoal: monthlyHourGoal > 0 ? monthlyHourGoal : undefined
		});

		savedMessage = 'Settings saved!';
		setTimeout(() => (savedMessage = ''), 2000);
	}

	function handleExport() {
		const data = invoiceStore.exportData();
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `oc-invoice-backup-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleImport() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/json';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			const text = await file.text();
			const success = invoiceStore.importData(text);
			if (success) {
				alert('Data imported successfully!');
				// Reload settings from imported data
				githubUsername = invoiceStore.state.settings.githubUsername || '';
				githubToken = invoiceStore.state.settings.githubToken || '';
				organization = invoiceStore.state.settings.organization || '';
				repositories = invoiceStore.state.settings.repositories || [];
				hourlyRate = invoiceStore.state.settings.hourlyRate || 0;
				defaultCurrency = invoiceStore.state.settings.defaultCurrency || 'USD';
				monthlyHourGoal = invoiceStore.state.settings.monthlyHourGoal || 0;
			}
		};
		input.click();
	}

	function handleClearData() {
		invoiceStore.clearAllData();
	}
</script>

<div class="mx-auto max-w-450 px-6 py-8">
	<div class="mb-8">
		<h1 class="text-4xl font-normal">Settings</h1>
		<p class="text-muted-foreground">Configure your GitHub integration and billing preferences</p>
	</div>

	<!-- Two Column Layout -->
	<div class="grid gap-6 lg:grid-cols-[1fr_400px]">
		<!-- Left Column: Configuration -->
		<div class="space-y-6">
			<!-- GitHub Configuration -->
			<section id="github-config" class="overflow-hidden rounded-xl border bg-card p-6 shadow-sm">
				<h2 class="mb-4 text-xl">GitHub Configuration</h2>

				<div class="space-y-4">
					<div class="space-y-2">
						<Label for="github-username">GitHub Username</Label>
						<Input
							id="github-username"
							type="text"
							bind:value={githubUsername}
							placeholder="octocat"
						/>
					</div>

					<div class="space-y-2">
						<Label for="organization">Organization</Label>
						<Input id="organization" type="text" bind:value={organization} placeholder="sveltejs" />
						<p class="text-xs text-gray-500">
							The GitHub organization that manages the OpenCollective account
						</p>
					</div>

					<div id="github-token" class="space-y-2">
						<Label for="github-token-input">Personal Access Token (Optional)</Label>
						<div class="flex gap-2">
							<Input
								id="github-token-input"
								type="password"
								bind:value={githubToken}
								placeholder="ghp_..."
								class="flex-1"
							/>
							<Button
								type="button"
								onclick={testToken}
								disabled={!githubToken || tokenStatus === 'testing'}
								variant="outline"
							>
								{#if tokenStatus === 'testing'}
									Testing...
								{:else}
									Test
								{/if}
							</Button>
						</div>
						{#if tokenStatus === 'valid'}
							<p class="mt-1 flex items-center gap-1.5 text-sm text-green-600">
								<Check size={16} />Token is valid
							</p>
						{:else if tokenStatus === 'invalid'}
							<p class="mt-1 flex items-center gap-1.5 text-sm text-red-600">
								<X size={16} />Token is invalid
							</p>
						{/if}
						<div class="mt-2 space-y-2 rounded-md bg-blue-50 p-3 text-xs text-gray-700">
							<p class="flex items-center gap-2 font-medium text-blue-900">
								{#if githubToken}
									<CheckCircle2 class="h-4 w-4" /> You have a token configured (5,000 requests/hour)
								{:else}
									<AlertTriangle class="h-4 w-4" /> Without a token, you're limited to 60 requests/hour
								{/if}
							</p>
							<p class="font-medium">How to create a Personal Access Token:</p>
							<ol class="ml-4 list-decimal space-y-1">
								<li>
									Go to
									<a
										href="https://github.com/settings/tokens/new"
										target="_blank"
										rel="noopener noreferrer"
										class="font-medium text-blue-600 hover:underline"
									>
										GitHub Settings → Personal access tokens → Tokens (classic)
									</a>
								</li>
								<li>Click "Generate new token" → "Generate new token (classic)"</li>
								<li>Add a note like "OpenCollective Invoice Generator"</li>
								<li>
									Select scopes: <strong>repo</strong> (Full control of private repositories) and
									<strong>read:org</strong> (Read org data)
								</li>
								<li>Click "Generate token" and copy the token (starts with "ghp_")</li>
								<li>Paste it in the field above and click "Test" to verify</li>
							</ol>
						</div>
						<div>
							<RepositoryAutocomplete
								{organization}
								selectedRepositories={repositories}
								onToggle={toggleRepository}
								{githubToken}
							/>
						</div>
					</div>
				</div>
			</section>

			<!-- Billing Configuration -->
			<section class="overflow-hidden rounded-xl border bg-card p-6 shadow-sm">
				<h2 class="mb-4 text-xl">Billing Configuration</h2>

				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="hourly-rate">Hourly Rate</Label>
						<Input
							id="hourly-rate"
							type="number"
							bind:value={hourlyRate}
							min="0"
							step="0.01"
							placeholder="50.00"
						/>
					</div>

					<div class="space-y-2">
						<Label for="currency">Currency</Label>
						<Select.Root
							value={defaultCurrency}
							type="single"
							onValueChange={(v) => v && (defaultCurrency = v)}
						>
							<Select.Trigger class="w-full">
								{defaultCurrency}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="USD">USD ($)</Select.Item>
								<Select.Item value="EUR">EUR (€)</Select.Item>
								<Select.Item value="GBP">GBP (£)</Select.Item>
								<Select.Item value="CAD">CAD (CA$)</Select.Item>
								<Select.Item value="AUD">AUD (A$)</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
				</div>

				{#if hourlyRate > 0}
					<p class="mt-2 text-sm text-gray-600">
						Example: 32 hours × {defaultCurrency === 'USD' ? '$' : ''}{hourlyRate}/{defaultCurrency} =
						{defaultCurrency === 'USD' ? '$' : ''}{(32 * hourlyRate).toFixed(2)}
						{defaultCurrency}
					</p>
				{/if}
			</section>

			<!-- Monthly Goals -->
			<section class="overflow-hidden rounded-xl border bg-card p-6 shadow-sm">
				<h2 class="mb-4 text-xl">Monthly Goals</h2>

				<div class="space-y-4">
					<div class="space-y-2">
						<Label for="monthly-hour-goal">Target Hours per Month</Label>
						<Input
							id="monthly-hour-goal"
							type="number"
							bind:value={monthlyHourGoal}
							min="0"
							step="1"
							placeholder="40"
						/>
						<p class="mt-1 text-xs text-gray-500">Set your monthly hour target to track progress</p>
					</div>

					{#if monthlyHourGoal > 0 && hourlyRate > 0}
						<p class="text-sm text-gray-600">
							At your current rate, {monthlyHourGoal} hours = {defaultCurrency === 'USD'
								? '$'
								: ''}{(monthlyHourGoal * hourlyRate).toFixed(2)}
							{defaultCurrency}
						</p>
					{/if}
				</div>
			</section>
		</div>

		<!-- Right Column: Data Management & Actions -->
		<div class="space-y-6 lg:sticky lg:top-4 lg:h-fit">
			<!-- Data Management -->
			<section class="overflow-hidden rounded-xl border bg-card p-6 shadow-sm">
				<h2 class="mb-4 text-xl">Data Management</h2>

				<div class="space-y-3">
					<div class="flex gap-2">
						<Button type="button" onclick={handleExport} variant="outline"
							><Download size={16} />Export All Data</Button
						>
						<Button type="button" onclick={handleImport} variant="outline"
							><FolderOpen size={16} />Import Data</Button
						>
					</div>

					<Button type="button" onclick={handleClearData} variant="destructive">
						<Trash2 size={16} />Clear All Data
					</Button>
					<p class="text-xs text-gray-500">
						Warning: This will permanently delete all invoices and settings
					</p>
				</div>
			</section>

			<!-- Save Actions -->
			<div class="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
				<Button type="button" onclick={saveSettings} size="lg" class="w-full">Save Settings</Button>
				{#if savedMessage}
					<div
						class="flex items-center justify-center gap-2 rounded-lg bg-green-50 p-3 text-sm font-medium text-green-700"
					>
						<Check size={16} />
						{savedMessage}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
