<script lang="ts">
	import { invoiceStore } from '$lib/invoice.svelte';
	import { resolve } from '$app/paths';
	import type { InvoiceStatus } from '$lib/invoice.svelte';
	import { fetchContributionsForMonth, type ProgressUpdate } from './github';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import * as Alert from '$lib/components/ui/alert';
	import * as Dialog from '$lib/components/ui/dialog';
	import ContributionsList from './ContributionsList.svelte';
	import ManualWorkForm from './ManualWorkForm.svelte';
	import ManualWorkList from './ManualWorkList.svelte';
	import ExpensePreview from './ExpensePreview.svelte';
	import ProgressStats from '$lib/components/ProgressStats.svelte';
	import {
		calculateTotalHours,
		filterContributionsByDateRange,
		filterManualWorkByDateRange
	} from './formatter';
	import { page } from '$app/state';
	import { RangeCalendar } from '$lib/components/ui/range-calendar';
	import * as Popover from '$lib/components/ui/popover';
	import { CalendarDate } from '@internationalized/date';
	import type { DateRange as BitsUIDateRange } from 'bits-ui';
	import {
		Download,
		Trash2,
		Loader2,
		Plus,
		ChevronRight,
		AlertCircle,
		Lightbulb
	} from 'lucide-svelte';

	const invoiceId = page.url.pathname.split('/').pop() || '';
	const invoice = $derived(invoiceStore.state.invoices[invoiceId]);
	const settings = $derived(invoiceStore.state.settings);

	// Filter contributions and manual work by date range
	const filteredContributions = $derived(
		invoice ? filterContributionsByDateRange(invoice, invoice.githubContributions) : []
	);
	const filteredManualItems = $derived(
		invoice ? filterManualWorkByDateRange(invoice, invoice.manualItems) : []
	);

	let isFetching = $state(false);
	let fetchError = $state('');
	let rateLimitResetTime = $state<string | null>(null);
	let fetchProgress = $state<ProgressUpdate | null>(null);
	let showManualWorkDialog = $state(false);
	let showDateRangePicker = $state(false);

	// Date range for calendar
	let dateRange = $state<BitsUIDateRange | undefined>(undefined);

	// Convert invoice dates to CalendarDate format
	function toCalendarDate(dateStr: string | undefined, defaultDate: Date): CalendarDate {
		if (dateStr) {
			const d = new Date(dateStr);
			return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
		}
		return new CalendarDate(defaultDate.getFullYear(), defaultDate.getMonth() + 1, defaultDate.getDate());
	}

	// Initialize date range when invoice loads
	$effect(() => {
		if (invoice) {
			const defaultStart = new Date(invoice.year, invoice.month - 1, 1);
			const defaultEnd = new Date(invoice.year, invoice.month, 0);
			dateRange = {
				start: toCalendarDate(invoice.customStartDate, defaultStart),
				end: toCalendarDate(invoice.customEndDate, defaultEnd)
			};
		}
	});

	// Update invoice when date range changes
	function handleDateRangeChange(range: BitsUIDateRange | undefined) {
		if (!invoice || !range || !range.start || !range.end) return;
		
		const startStr = `${range.start.year}-${String(range.start.month).padStart(2, '0')}-${String(range.start.day).padStart(2, '0')}`;
		const endStr = `${range.end.year}-${String(range.end.month).padStart(2, '0')}-${String(range.end.day).padStart(2, '0')}`;
		
		invoiceStore.updateDateRange(invoice.id, startStr, endStr);
		showDateRangePicker = false;
	}

	// Check if this is the current month
	const now = new Date();
	const isCurrentMonth = $derived(
		invoice && invoice.year === now.getFullYear() && invoice.month === now.getMonth() + 1
	);

	// Get previous month invoice for comparison
	const previousInvoice = $derived(() => {
		if (!invoice) return undefined;
		const prevMonth = invoice.month === 1 ? 12 : invoice.month - 1;
		const prevYear = invoice.month === 1 ? invoice.year - 1 : invoice.year;
		const prevId = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
		return invoiceStore.state.invoices[prevId];
	});

	async function fetchFromGitHub() {
		if (!invoice || !settings.githubUsername) {
			alert('Please configure GitHub username in settings first');
			return;
		}

		if (settings.repositories.length === 0) {
			alert('Please select at least one repository to track');
			return;
		}

		isFetching = true;
		fetchError = '';
		rateLimitResetTime = null;
		fetchProgress = null;

		try {
			const response = await fetchContributionsForMonth({
				username: settings.githubUsername,
				token: settings.githubToken,
				repositories: settings.repositories,
				year: invoice.year,
				month: invoice.month,
				customStartDate: invoice.customStartDate,
				customEndDate: invoice.customEndDate,
				onProgress: (progress) => {
					fetchProgress = progress;
				}
			});

			invoiceStore.addGitHubContributions(invoice.id, response.contributions);
		} catch (error) {
			if (error instanceof Error) {
				if (error.message === 'RATE_LIMIT_EXCEEDED') {
					rateLimitResetTime = (error as { resetTime?: string }).resetTime || null;
					fetchError = 'RATE_LIMIT_EXCEEDED';
				} else {
					fetchError = error.message;
				}
			} else {
				fetchError = 'Failed to fetch contributions';
			}
		} finally {
			isFetching = false;
			fetchProgress = null;
		}
	}

	function updateStatus(status: InvoiceStatus) {
		if (invoice) {
			invoiceStore.updateInvoiceStatus(invoice.id, status);
		}
	}

	function handleDelete() {
		if (invoice && confirm('Are you sure you want to delete this invoice?')) {
			invoiceStore.deleteInvoice(invoice.id);
			window.location.href = '/invoices';
		}
	}

	function handleExport() {
		if (!invoice) return;

		const data = JSON.stringify(invoice, null, 2);
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `invoice-${invoice.id}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

{#if !invoice}
	<div class="mx-auto max-w-4xl p-6">
		<div class="py-12 text-center">
			<p class="text-lg text-gray-600">Invoice not found</p>
			<a href={resolve('/invoices')} class="mt-4 inline-block text-blue-600 hover:underline">
				← Back to invoices
			</a>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-450 px-6 py-4">
		<!-- Compact Header Bar -->
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-4">
				<a
					href={resolve('/invoices')}
					class="flex items-center gap-1.5 text-sm text-gray-600 transition-colors hover:text-gray-900"
				>
					← Back
				</a>
				<div class="h-4 w-px bg-gray-300"></div>
				<h1 class="text-xl font-semibold">
					{new Date(invoice.year, invoice.month - 1).toLocaleDateString('en-US', {
						month: 'long',
						year: 'numeric'
					})}
				</h1>
				<div class="flex items-center gap-3 text-sm text-gray-600">
					<span class="font-medium">{calculateTotalHours(invoice)}h tracked</span>
					{#if invoice.totalAmount}
						<span>• ${invoice.totalAmount.toFixed(2)}</span>
					{/if}
				</div>
			</div>
			<div class="flex items-center gap-3">
				<Button type="button" onclick={handleExport} variant="outline" size="sm"
					><Download size={14} />Export</Button
				>
				<Button type="button" onclick={handleDelete} variant="destructive" size="sm"
					><Trash2 size={14} />Delete</Button
				>
				<Select.Root
					type="single"
					value={invoice.status}
					onValueChange={(value) => {
						if (value) {
							updateStatus(value as InvoiceStatus);
						}
					}}
				>
					<Select.Trigger class="w-35">
						{invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="draft">Draft</Select.Item>
						<Select.Item value="submitted">Submitted</Select.Item>
						<Select.Item value="approved">Approved</Select.Item>
						<Select.Item value="paid">Paid</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
		</div>

		<!-- Custom Date Range -->
		<div class="mb-4 flex items-center gap-3">
			<span class="text-xs text-gray-600">Date range:</span>
			<Popover.Root bind:open={showDateRangePicker}>
				<Popover.Trigger>
					<Button variant="outline" size="sm" class="justify-start text-left font-normal">
						{#if invoice.customStartDate || invoice.customEndDate}
							{new Date(invoice.customStartDate || invoice.year + '-' + String(invoice.month).padStart(2, '0') + '-01').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
							-
							{new Date(invoice.customEndDate || new Date(invoice.year, invoice.month, 0).toISOString()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
						{:else}
							Full month
						{/if}
					</Button>
				</Popover.Trigger>
				<Popover.Content class="w-auto p-0">
					<RangeCalendar
						bind:value={dateRange}
						onValueChange={handleDateRangeChange}
					/>
				</Popover.Content>
			</Popover.Root>
			{#if invoice.customStartDate || invoice.customEndDate}
				<button
					type="button"
					onclick={() => {
						invoiceStore.updateDateRange(invoice.id, undefined, undefined);
						const defaultStart = new Date(invoice.year, invoice.month - 1, 1);
						const defaultEnd = new Date(invoice.year, invoice.month, 0);
						dateRange = {
							start: toCalendarDate(undefined, defaultStart),
							end: toCalendarDate(undefined, defaultEnd)
						};
					}}
					class="text-xs text-blue-600 hover:text-blue-800"
				>
					Reset to full month
				</button>
			{/if}
		</div>

		<!-- Two Column Layout -->
		<div class="grid gap-6 lg:grid-cols-[1fr_480px]">
			<!-- Left Column: Work Tracking -->
			<div class="space-y-6">
				<!-- Progress Section -->
				{#if isCurrentMonth}
					<details open class="group">
						<summary
							class="mb-3 flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
						>
							<ChevronRight class="h-4 w-4 transition-transform group-open:rotate-90" />
							Progress
						</summary>
						<div class="mb-3">
							<ProgressStats {invoice} {settings} previousInvoice={previousInvoice()} />
						</div>
					</details>
				{/if}

				<!-- GitHub Contributions -->
				<section>
					<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
						<div class="flex items-center justify-between border-b bg-gray-50/50 px-5 py-3.5">
							<h2 class="text-base font-semibold">GitHub Contributions</h2>
							<div class="flex gap-2">
							<Button
								type="button"
								onclick={() => (showManualWorkDialog = true)}
								variant="outline"
								size="sm"
							>
								<Plus size={14} class="mr-1.5" />
								Add Manual Work
							</Button>
							<Button type="button" onclick={fetchFromGitHub} disabled={isFetching} size="sm">
								{#if isFetching}
									<Loader2 class="mr-2 h-3.5 w-3.5 animate-spin" />
									Fetching...
								{:else}
									Fetch from GitHub
								{/if}
							</Button>
						</div>
					</div>

					<div class="p-5">
						{#if isFetching && fetchProgress}
								<div class="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
									<div class="mb-2 flex items-center justify-between text-sm">
										<span class="font-medium text-blue-900">
											{#if fetchProgress.type === 'repo-complete'}
												Processing repositories...
											{:else if fetchProgress.type === 'discussions-complete'}
												Fetching discussions...
											{:else}
												Complete!
											{/if}
										</span>
										<span class="text-blue-700">
											{fetchProgress.completedRepos}/{fetchProgress.totalRepos} repos
										</span>
									</div>
									<div class="mb-2 h-1.5 overflow-hidden rounded-full bg-blue-200">
										<div
											class="h-full bg-blue-600 transition-all duration-300"
											style="width: {(fetchProgress.completedRepos / fetchProgress.totalRepos) *
												100}%"
										></div>
									</div>
									{#if fetchProgress.repo}
										<div class="text-xs text-blue-700">
											{fetchProgress.repo}: {fetchProgress.contributionsFound} contribution{fetchProgress.contributionsFound ===
											1
												? ''
												: 's'} found
										</div>
									{/if}
								</div>
							{/if}

							{#if fetchError}
								<div class="mb-4">
									{#if fetchError === 'RATE_LIMIT_EXCEEDED'}
										<Alert.Alert variant="destructive">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="24"
												height="24"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											>
												<circle cx="12" cy="12" r="10" />
												<path d="M12 6v6l4 2" />
											</svg>
											<Alert.AlertTitle>GitHub API Rate Limit Exceeded</Alert.AlertTitle>
											<Alert.AlertDescription>
												<p class="mb-2">
													You've exceeded the GitHub API rate limit. This typically happens when
													making many requests in a short period.
												</p>
												{#if rateLimitResetTime}
													<p class="font-medium">
														Rate limit will reset at: <span class="font-semibold"
															>{rateLimitResetTime}</span
														>
													</p>
												{/if}
												<p class="mt-2 flex items-start gap-2 text-sm">
													<Lightbulb class="mt-0.5 h-4 w-4 shrink-0" />
													<span
														><strong>Solution:</strong> Add a GitHub personal access token
														{#if settings.githubToken}
															or wait until the rate limit resets.
														{:else}
															in
															<a
																href="{resolve('/settings')}#github-token"
																class="font-medium underline">Settings</a
															>
															for higher rate limits (5,000/hour vs 60/hour).
														{/if}</span
													>
												</p>
											</Alert.AlertDescription>
										</Alert.Alert>
									{:else}
										<Alert.Alert variant="destructive">
											<AlertCircle class="h-4 w-4" />
											<Alert.AlertTitle>Error Fetching GitHub Data</Alert.AlertTitle>
											<Alert.AlertDescription>{fetchError}</Alert.AlertDescription>
										</Alert.Alert>
									{/if}
								</div>
							{/if}

							{#if invoice.lastGitHubFetch}
								<p class="mb-4 text-xs text-gray-500">
									Last fetched: {new Date(invoice.lastGitHubFetch).toLocaleString()}
								</p>
							{/if}

							<ContributionsList
							contributions={filteredContributions}
							onUpdateHours={(id, hours) => {
								invoiceStore.updateContributionHours(invoice.id, id, hours);
							}}
						/>
					</div>
				</div>
			</section>

			<!-- Manual Work -->
			{#if filteredManualItems.length > 0}
				<section>
					<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
						<div class="flex items-center justify-between border-b bg-gray-50/50 px-5 py-3.5">
							<h2 class="text-base font-semibold">Manual Work</h2>
							<Button size="sm" onclick={() => (showManualWorkDialog = true)}>
								<Plus size={14} class="mr-1.5" />
								Add Item
							</Button>
						</div>

						<div class="p-5">
							<ManualWorkList
								items={filteredManualItems}
									onDelete={(id) => {
										invoiceStore.deleteManualItem(invoice.id, id);
									}}
								/>
							</div>
						</div>
					</section>
				{/if}
			</div>

			<!-- Right Column: Sticky Expense Preview -->
			<div class="lg:sticky lg:top-4 lg:h-fit">
				<ExpensePreview {invoice} {settings} />
			</div>
		</div>

		<!-- Add Manual Work Dialog -->
		<Dialog.Root bind:open={showManualWorkDialog}>
			<Dialog.Content class="max-w-2xl">
				<Dialog.Header>
					<Dialog.Title>Add Manual Work</Dialog.Title>
					<Dialog.Description>
						Add work items that aren't tracked through GitHub contributions.
					</Dialog.Description>
				</Dialog.Header>
				<ManualWorkForm
					onAdd={(item) => {
						invoiceStore.addManualItem(invoice.id, item);
						showManualWorkDialog = false;
					}}
				/>
			</Dialog.Content>
		</Dialog.Root>
	</div>
{/if}
