<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { toIsoDate } from '#lib/format.js';
	import { fetchActivity, GitHubError } from '#lib/github.js';
	import DriveSyncStatus from '#lib/components/DriveSyncStatus.svelte';
	import { driveSync } from '#lib/drive-sync.svelte.js';
	import { addMonths, monthDates, monthOf, summarizeMonth, unloggedItems } from '#lib/worklog.js';
	import {
		ChevronLeft,
		ChevronRight,
		CircleAlert,
		GitPullRequest,
		Settings2
	} from '@lucide/svelte';
	import type { Settings } from '#lib/settings.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { untrack } from 'svelte';
	import DayList from './DayList.svelte';
	import EntryForm from './EntryForm.svelte';
	import MonthCharts from './MonthCharts.svelte';
	import MonthPicker from './MonthPicker.svelte';
	import MonthStats from './MonthStats.svelte';
	import YearOverview from './YearOverview.svelte';

	let { data }: { data: { settings: Settings; store: WorkLogStore } } = $props();

	const settings = $derived(data.settings);
	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => data.store);
	const sync = driveSync(store);

	const today = toIsoDate(new Date());
	const month = $derived.by(() => {
		const requested = page.url.searchParams.get('month');
		return requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : monthOf(today);
	});
	const summary = $derived(summarizeMonth({ data: store.data, month, today }));
	const current = $derived(month === monthOf(today));
	const monthName = $derived(
		new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(
			new Date(`${month}-01T00:00:00`)
		)
	);
	/** New entries default to today in this month, else its first day. */
	const defaultDate = $derived(current ? today : `${month}-01`);
	const githubClient = $derived(
		store.data.clients.find((client) => client.openCollective) ?? store.data.clients[0]
	);

	let fetching = $state(false);
	let message = $state<{ tone: 'ok' | 'warn' | 'error'; text: string } | undefined>();

	async function importFromGitHub() {
		if (!settings.githubUsername || !githubClient) return;
		fetching = true;
		message = undefined;
		try {
			const dates = monthDates(month);
			const { entries, coversPeriod } = await fetchActivity({
				username: settings.githubUsername,
				token: settings.githubToken,
				organization: settings.organization,
				repositories: settings.repositories,
				startDate: dates[0],
				endDate: dates.at(-1)!
			});

			const added = unloggedItems({ entries: store.data.entries, found: entries });
			for (const { date, ref } of added) {
				store.addItems({ date, clientId: githubClient.id, items: [ref] });
			}

			const summaryText =
				added.length === 0
					? 'Everything GitHub found is already logged.'
					: `Added ${added.length} ${added.length === 1 ? 'item' : 'items'} for ${githubClient.name}, without times. Edit an entry to add its hours.`;
			message = coversPeriod
				? { tone: 'ok', text: summaryText }
				: {
						tone: 'warn',
						text: `${summaryText} GitHub only keeps your latest 300 events, so the start of the month may be missing.`
					};
		} catch (error) {
			message = {
				tone: 'error',
				text: error instanceof GitHubError ? error.message : 'Could not reach GitHub.'
			};
		} finally {
			fetching = false;
		}
	}
</script>

<div class="space-y-6">
	<header class="space-y-2">
		<!-- The month controls sit at the right edge, so they stay put as the month name changes length. -->
		<div class="flex items-center justify-between gap-3">
			<MonthPicker {month} current={monthOf(today)} label={monthName} />
			<nav aria-label="Month" class="flex shrink-0 items-center rounded-md border bg-card">
				<Button
					variant="ghost"
					size="icon"
					class="rounded-r-none"
					href="{resolve('/worklog')}?month={addMonths(month, -1)}"
					aria-label="Previous month"
				>
					<ChevronLeft />
				</Button>
				{#if current}
					<Button variant="ghost" size="sm" class="rounded-none border-x" disabled>Today</Button>
				{:else}
					<Button
						variant="ghost"
						size="sm"
						class="rounded-none border-x"
						href={resolve('/worklog')}
					>
						Today
					</Button>
				{/if}
				<Button
					variant="ghost"
					size="icon"
					class="rounded-l-none"
					href="{resolve('/worklog')}?month={addMonths(month, 1)}"
					aria-label="Next month"
				>
					<ChevronRight />
				</Button>
			</nav>
		</div>
		<div class="flex items-center justify-between gap-2">
			<DriveSyncStatus {sync} />
			<!-- Labels hide on narrow screens; the icons and their accessible names stay. -->
			<div class="flex shrink-0 gap-2">
				<Button
					variant="outline"
					size="sm"
					onclick={importFromGitHub}
					disabled={fetching || !settings.githubUsername || !githubClient}
					title={settings.githubUsername
						? 'Add from GitHub'
						: 'Add your GitHub username in settings first'}
				>
					{#if fetching}<Spinner />{:else}<GitPullRequest />{/if}
					<span class="max-sm:sr-only">Add from GitHub</span>
				</Button>
				<Button
					variant="outline"
					size="sm"
					href={resolve('/worklog/setup')}
					title="Clients and days off"
				>
					<Settings2 /> <span class="max-sm:sr-only">Clients and days off</span>
				</Button>
			</div>
		</div>
	</header>

	{#if store.saveError}
		<Alert.Root variant="destructive">
			<CircleAlert />
			<Alert.Title>Your latest change was not saved</Alert.Title>
			<Alert.Description>
				{store.saveError} Download a backup from Clients and days off before closing this tab.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if message}
		<p
			role={message.tone === 'error' ? 'alert' : 'status'}
			class="flex items-start gap-1.5 text-sm {message.tone === 'error'
				? 'text-destructive'
				: message.tone === 'warn'
					? 'text-warning'
					: 'text-status-paid'}"
		>
			{#if message.tone !== 'ok'}<CircleAlert size={15} class="mt-0.5 shrink-0" />{/if}
			{message.text}
		</p>
	{/if}

	<section aria-label="Summary">
		<MonthStats {summary} data={store.data} {current} />
	</section>

	<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
		<section class="space-y-3" aria-labelledby="entries-heading">
			<h2 id="entries-heading" class="text-lg">Entries</h2>
			{#if store.data.clients.length === 0}
				<p class="text-sm text-muted-foreground">
					Add a client in
					<a href={resolve('/worklog/setup')} class="font-medium text-foreground underline"
						>Clients and days off</a
					>
					to start logging.
				</p>
			{:else}
				<Card.Root>
					<Card.Content>
						{#key month}
							<EntryForm
								clients={store.data.clients}
								organization={settings.organization}
								date={defaultDate}
								clientId={githubClient?.id}
								onsave={(entry) => store.addEntry(entry)}
							/>
						{/key}
					</Card.Content>
				</Card.Root>
			{/if}
			<DayList {store} {summary} organization={settings.organization} />
		</section>

		<section class="space-y-6" aria-label="Charts">
			<MonthCharts {summary} clients={store.data.clients} {today} />
			<YearOverview data={store.data} year={Number(month.slice(0, 4))} {today} />
		</section>
	</div>
</div>
