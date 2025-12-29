<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { GitHubContribution } from './github';
	import {
		GitPullRequest,
		GitCommit,
		Bug,
		Eye,
		MessageCircle,
		Package,
		ChevronRight
	} from 'lucide-svelte';

	let {
		contributions,
		onUpdateHours
	}: {
		contributions: GitHubContribution[];
		onUpdateHours: (id: string, hours: number) => void;
	} = $props();

	interface WorkGroup {
		key: string;
		primary: GitHubContribution;
		related: GitHubContribution[];
		totalHours: number;
	}

	// Extract PR/issue number from title or description
	function extractNumber(contrib: GitHubContribution): string | null {
		// For PRs and issues, use the ID
		if (contrib.type === 'pr' || contrib.type === 'issue') {
			const match = contrib.id.match(/\d+/);
			return match ? match[0] : null;
		}

		// For commits and reviews, look for PR references in title
		const prMatch = contrib.title.match(/#(\d+)/);
		if (prMatch) return prMatch[1];

		// Check description too
		const descMatch = contrib.description?.match(/#(\d+)/);
		return descMatch ? descMatch[1] : null;
	}

	// Group by repository and then by related work
	const grouped = $derived(() => {
		const repoGroups: Record<string, WorkGroup[]> = {};

		for (const contrib of contributions) {
			if (!repoGroups[contrib.repository]) {
				repoGroups[contrib.repository] = [];
			}

			const prNumber = extractNumber(contrib);

			if (prNumber) {
				// Find existing group for this PR/issue
				const existingGroup = repoGroups[contrib.repository].find(
					(g) => g.key === `pr-${prNumber}`
				);

				if (existingGroup) {
					// If this is a PR/issue itself, make it primary
					if (contrib.type === 'pr' || contrib.type === 'issue') {
						existingGroup.related.push(existingGroup.primary);
						existingGroup.primary = contrib;
					} else {
						existingGroup.related.push(contrib);
					}
					existingGroup.totalHours += contrib.hours || 0;
				} else {
					// Create new group
					repoGroups[contrib.repository].push({
						key: `pr-${prNumber}`,
						primary: contrib,
						related: [],
						totalHours: contrib.hours || 0
					});
				}
			} else {
				// Standalone item
				repoGroups[contrib.repository].push({
					key: contrib.id,
					primary: contrib,
					related: [],
					totalHours: contrib.hours || 0
				});
			}
		}

		// Sort groups by primary date
		for (const repo in repoGroups) {
			repoGroups[repo].sort(
				(a, b) => new Date(a.primary.date).getTime() - new Date(b.primary.date).getTime()
			);
			// Sort related items within each group
			for (const group of repoGroups[repo]) {
				group.related.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
			}
		}

		return repoGroups;
	});

	const totalHours = $derived(contributions.reduce((sum, c) => sum + (c.hours || 0), 0));

	const selectedCount = $derived(contributions.filter((c) => (c.hours ?? 0) > 0).length);

	function getTypeIcon(type: GitHubContribution['type']) {
		const icons = {
			pr: GitPullRequest,
			// TODO: why is the icon deprecated?
			commit: GitCommit,
			issue: Bug,
			review: Eye,
			discussion: MessageCircle
		};
		return icons[type];
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="space-y-4">
	<!-- Summary -->
	<div class="flex items-center justify-between rounded bg-gray-50 p-3 text-sm text-gray-600">
		<span>{contributions.length} contributions found</span>
		<span>{selectedCount} selected • {totalHours}h entered</span>
	</div>

	<!-- Grouped contributions -->
	{#each Object.entries(grouped()) as [repo, groups] (repo)}
		<div class="overflow-hidden rounded-lg border">
			<div class="border-b bg-gray-50 px-4 py-2">
				<h4 class="flex items-center gap-1.5 text-sm font-semibold"><Package size={16} />{repo}</h4>
				<p class="text-xs text-gray-600">
					{groups.reduce((sum, g) => sum + 1 + g.related.length, 0)} items •
					{groups.reduce((sum, g) => sum + g.totalHours, 0)}h
				</p>
			</div>

			<div class="divide-y">
				{#each groups as group (group.key)}
					{@const IconComponent = getTypeIcon(group.primary.type)}
					{@const hasRelated = group.related.length > 0}

					<!-- Primary item -->
					{#if hasRelated}
						<details class="group">
							<summary
								class="flex cursor-pointer list-none items-start gap-3 p-3 transition-colors hover:bg-gray-50 [&::-webkit-details-marker]:hidden"
							>
								<IconComponent size={20} class="mt-0.5 shrink-0" />

								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-2">
										<div class="flex-1">
											<div class="flex items-center gap-2">
												<ChevronRight
													size={16}
													class="shrink-0 text-gray-500 transition-transform group-open:rotate-90"
												/>
												<p class="text-sm font-medium">{group.primary.title}</p>
											</div>
											<div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
												<span>{formatDate(group.primary.date)}</span>
												<span>•</span>
												<span>{group.related.length} related</span>
												<span>•</span>
												<a
													href={group.primary.url}
													target="_blank"
													rel="noopener noreferrer"
													class="text-blue-600 hover:underline"
													onclick={(e) => e.stopPropagation()}
												>
													View on GitHub
												</a>
											</div>
										</div>

										<div class="flex items-center gap-2">
											<label for="hours-{group.primary.id}" class="text-xs text-gray-600"
												>Hours:</label
											>
											<input
												id="hours-{group.primary.id}"
												type="number"
												value={group.primary.hours || ''}
												oninput={(e) => {
													const value = parseFloat(e.currentTarget.value) || 0;
													onUpdateHours(group.primary.id, value);
												}}
												onclick={(e) => e.stopPropagation()}
												min="0"
												step="0.5"
												placeholder="0"
												class="w-20 rounded border px-2 py-1 text-sm"
											/>
										</div>
									</div>
								</div>
							</summary>

							<!-- Related items -->
							<div class="border-t bg-gray-50/50">
								{#each group.related as related (related.id)}
									{@const RelatedIcon = getTypeIcon(related.type)}
									<div class="flex items-start gap-3 p-3 pl-12">
										<RelatedIcon size={16} class="mt-0.5 shrink-0 text-gray-500" />

										<div class="min-w-0 flex-1">
											<div class="flex items-start justify-between gap-2">
												<div class="flex-1">
													<p class="text-sm">{related.title}</p>
													<div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
														<span>{formatDate(related.date)}</span>
														<span>•</span>
														<a
															href={related.url}
															target="_blank"
															rel="noopener noreferrer"
															class="text-blue-600 hover:underline"
														>
															View
														</a>
													</div>
												</div>

												<div class="flex items-center gap-2">
													<label for="hours-{related.id}" class="text-xs text-gray-600"
														>Hours:</label
													>
													<input
														id="hours-{related.id}"
														type="number"
														value={related.hours || ''}
														oninput={(e) => {
															const value = parseFloat(e.currentTarget.value) || 0;
															onUpdateHours(related.id, value);
														}}
														min="0"
														step="0.5"
														placeholder="0"
														class="w-20 rounded border px-2 py-1 text-sm"
													/>
												</div>
											</div>
										</div>
									</div>
								{/each}
							</div>
						</details>
					{:else}
						<div class="transition-colors hover:bg-gray-50">
							<div class="flex items-start gap-3 p-3">
								<IconComponent size={20} class="mt-0.5 shrink-0" />

								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-2">
										<div class="flex-1">
											<p class="text-sm font-medium">{group.primary.title}</p>
											<div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
												<span>{formatDate(group.primary.date)}</span>
												<span>•</span>
												<a
													href={group.primary.url}
													target="_blank"
													rel="noopener noreferrer"
													class="text-blue-600 hover:underline"
												>
													View on GitHub
												</a>
											</div>
										</div>

										<div class="flex items-center gap-2">
											<label for="hours-{group.primary.id}" class="text-xs text-gray-600"
												>Hours:</label
											>
											<input
												id="hours-{group.primary.id}"
												type="number"
												value={group.primary.hours || ''}
												oninput={(e) => {
													const value = parseFloat(e.currentTarget.value) || 0;
													onUpdateHours(group.primary.id, value);
												}}
												min="0"
												step="0.5"
												placeholder="0"
												class="w-20 rounded border px-2 py-1 text-sm"
											/>
										</div>
									</div>
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/each}

	{#if contributions.length === 0}
		<div class="py-8 text-center text-gray-500">
			<p>No contributions found for this period.</p>
			<p class="mt-1 text-sm">Try fetching from GitHub or check your date range.</p>
		</div>
	{/if}
</div>
