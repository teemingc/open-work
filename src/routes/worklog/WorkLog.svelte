<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { fetchActivity, GitHubError } from '#lib/github.js';
	import DriveSyncStatus from '#lib/components/DriveSyncStatus.svelte';
	import { driveSync } from '#lib/drive-sync.svelte.js';
	import {
		activeClients,
		addMonths,
		monthDates,
		monthOf,
		summarizeMonth,
		taskNames,
		unloggedItems
	} from '#lib/worklog.js';
	import {
		ChevronLeft,
		ChevronRight,
		CircleAlert,
		CircleCheck,
		GitPullRequest,
		Settings2,
		TriangleAlert
	} from '@lucide/svelte';
	import type { Settings } from '#lib/settings.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { onMount, untrack } from 'svelte';
	import { today as currentDay } from './today.js';
	import DayList from './DayList.svelte';
	import EntryForm from '#lib/components/EntryForm.svelte';
	import MonthCharts from './MonthCharts.svelte';
	import MonthPicker from './MonthPicker.svelte';
	import MonthStats from './MonthStats.svelte';
	import TakeHome from './TakeHome.svelte';

	let { data }: { data: { settings: Settings; store: WorkLogStore } } = $props();
	const uid = $props.id();

	const settings = $derived(data.settings);
	// The same store for the page's whole life, so it is read once, not tracked.
	const store = untrack(() => data.store);
	const sync = driveSync(store);

	const today = $derived(currentDay());
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
	const clients = $derived(activeClients(store.data.clients));
	const githubClient = $derived(clients.find((client) => client.openCollective) ?? clients[0]);

	/** The entry just saved from the form, which the list tints until the tint fades. */
	let justAdded = $state<string>();

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

	// SvelteKit puts the scroll back on a reload before the log arrives from IndexedDB, while the
	// shorter skeleton is showing, so the page can't reach it. Keep it as the page unloads and put it
	// back once the log is drawn. Read once, so later visits in the same tab start at the top.
	const SCROLL_KEY = 'worklog:scroll';

	onMount(() => {
		const saved = sessionStorage.getItem(SCROLL_KEY);
		sessionStorage.removeItem(SCROLL_KEY);
		const [navigation] = performance.getEntriesByType(
			'navigation'
		) as PerformanceNavigationTiming[];
		if (saved && navigation?.type !== 'navigate') {
			const { href, x, y } = JSON.parse(saved);
			if (href === location.href) scrollTo(x, y);
		}

		function save() {
			sessionStorage.setItem(
				SCROLL_KEY,
				JSON.stringify({ href: location.href, x: scrollX, y: scrollY })
			);
		}
		addEventListener('pagehide', save);
		return () => removeEventListener('pagehide', save);
	});
</script>

<div class="flex flex-col gap-4 md:gap-6">
	<!--
		The month controls sit at the right edge of the month's row, so they stay put as the month name
		changes length, and wrap under it only when the text is too large for both. The GitHub and
		settings buttons are left off phones, where they would be bare icons; settings stay in the tabs.
	-->
	<header class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
			<MonthPicker {month} current={monthOf(today)} label={monthName} />
			<nav
				aria-labelledby="{uid}-month"
				class="ml-auto flex shrink-0 items-center rounded-md border bg-card"
			>
				<h2 id="{uid}-month" class="sr-only">Month</h2>
				<Button
					variant="ghost"
					size="icon"
					class="rounded-r-none"
					href="{resolve('/worklog')}?month={addMonths(month, -1)}"
				>
					<ChevronLeft /><span class="sr-only">Previous month</span>
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
				>
					<ChevronRight /><span class="sr-only">Next month</span>
				</Button>
			</nav>
		</div>
		<div class="flex items-center justify-between gap-2">
			<DriveSyncStatus {sync} />
			<div class="ml-auto hidden shrink-0 gap-2 sm:flex">
				<!-- Without a username there is nothing to add from, so it leads to where you set one. -->
				{#if settings.githubUsername}
					<Button
						variant="outline"
						size="sm"
						onclick={importFromGitHub}
						disabled={fetching || !githubClient}
					>
						{#if fetching}<Spinner />{:else}<GitPullRequest />{/if}
						Add from GitHub
					</Button>
				{:else}
					<Button variant="outline" size="sm" href={resolve('/settings/connections')}>
						<GitPullRequest />
						Connect GitHub
					</Button>
				{/if}
				<Button variant="outline" size="sm" href={resolve('/settings/hours')}>
					<Settings2 /> Settings
				</Button>
			</div>
		</div>
	</header>

	{#if store.saveError}
		<Alert.Root variant="destructive">
			<CircleAlert />
			<Alert.Title>Your latest change was not saved</Alert.Title>
			<Alert.Description>
				{store.saveError} Download a backup from Settings, under Data, before closing this tab.
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
			{#if message.tone === 'error'}<CircleAlert
					size={15}
					class="mt-0.5 shrink-0"
				/>{:else if message.tone === 'warn'}<TriangleAlert
					size={15}
					class="mt-0.5 shrink-0"
				/>{:else}<CircleCheck size={15} class="mt-0.5 shrink-0" />{/if}
			{message.text}
		</p>
	{/if}

	<section aria-labelledby="{uid}-summary" class="flex flex-col gap-4 md:gap-6">
		<h2 id="{uid}-summary" class="sr-only">Summary</h2>
		<MonthStats {summary} data={store.data} {current} />
		<TakeHome data={store.data} {summary} />
	</section>

	<!--
		In rows rather than columns, so the entry form sits beside the month's pace and the days logged
		beside the hours each day. Each card keeps its own height rather than stretching to its neighbour.
	-->
	<div class="grid grid-cols-1 items-start gap-4 md:gap-6 @6xl/main:grid-cols-2">
		{#if clients.length === 0}
			<p class="text-sm text-muted-foreground">
				Add a client in
				<a href={resolve('/settings/clients')} class="font-medium text-foreground underline"
					>Clients settings</a
				>
				to start logging.
			</p>
		{:else}
			<Card.Root>
				<Card.Header>
					<Card.Title>Log time</Card.Title>
				</Card.Header>
				<Card.Content>
					<EntryForm
						{clients}
						organization={settings.organization}
						tasks={taskNames(store.data.entries)}
						entries={store.data.entries}
						date={defaultDate}
						clientId={githubClient?.id}
						onsave={(entry) => (justAdded = store.addEntry(entry).id)}
					/>
				</Card.Content>
			</Card.Root>
		{/if}
		<MonthCharts chart="pace" {summary} clients={store.data.clients} {today} />
		<MonthCharts chart="daily" {summary} clients={store.data.clients} {today} />
		<!--
			In one column the list goes last, so a long month never pushes a chart out of reach. In two it
			sits beside the hours each day, which comes after it in the second column.
		-->
		<div class="@6xl/main:col-start-1 @6xl/main:row-start-2">
			<DayList {store} {summary} {today} organization={settings.organization} bind:justAdded />
		</div>
	</div>
</div>
