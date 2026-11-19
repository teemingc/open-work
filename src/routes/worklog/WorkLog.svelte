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
		monthDates,
		monthOf,
		summarizeMonth,
		taskNames,
		unloggedItems
	} from '#lib/worklog.js';
	import { CircleAlert, CircleCheck, GitPullRequest, TriangleAlert } from '@lucide/svelte';
	import type { Settings } from '#lib/settings.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { onMount, tick, untrack } from 'svelte';
	import { today as currentDay } from './today.js';
	import DayList from './DayList.svelte';
	import EntryForm from '#lib/components/EntryForm.svelte';
	import MonthPicker from '#lib/components/MonthPicker.svelte';

	let { data }: { data: { settings: Settings; store: WorkLogStore } } = $props();

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

	/**
	 * Days drawn as the page opens. Each entry has its own drag handle, checkbox and menu, so a full
	 * month of them held up the click on Work log for a moment; these fill the screen under the form,
	 * and the rest of the month follows on the next frame.
	 */
	let drawnDays = $state(3);

	// SvelteKit puts the scroll back on a reload before the log arrives from IndexedDB, while the
	// shorter skeleton is showing, so the page can't reach it. Keep it as the page unloads and put it
	// back once the whole month is drawn. Read once, so later visits in the same tab start at the top.
	const SCROLL_KEY = 'worklog:scroll';

	onMount(() => {
		const saved = sessionStorage.getItem(SCROLL_KEY);
		sessionStorage.removeItem(SCROLL_KEY);
		const [navigation] = performance.getEntriesByType(
			'navigation'
		) as PerformanceNavigationTiming[];

		const frame = requestAnimationFrame(async () => {
			drawnDays = Infinity;
			await tick();
			if (saved && navigation?.type !== 'navigate') {
				const { href, x, y } = JSON.parse(saved);
				if (href === location.href) scrollTo(x, y);
			}
		});

		function save() {
			sessionStorage.setItem(
				SCROLL_KEY,
				JSON.stringify({ href: location.href, x: scrollX, y: scrollY })
			);
		}
		addEventListener('pagehide', save);
		return () => {
			cancelAnimationFrame(frame);
			removeEventListener('pagehide', save);
		};
	});
</script>

<div class="flex flex-col gap-4 md:gap-6">
	<!--
		The month control sits at the right edge of the title's row, and wraps under it only when the text
		is too large for both. The GitHub button is left off phones, where it would be a bare icon.
	-->
	<header class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
			<h1>Work log</h1>
			<div class="ml-auto">
				<MonthPicker path="/worklog" {month} current={monthOf(today)} label={monthName} />
			</div>
		</div>
		<div class="flex items-center justify-between gap-2">
			<DriveSyncStatus {sync} />
			<div class="ml-auto hidden shrink-0 gap-2 sm:flex">
				<!-- Without a username there is nothing to add from; it is set in Settings, under Connections. -->
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
				{/if}
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

	<!--
		Logging comes first, so the form is in reach as the page opens, with what you log showing up just
		below it. The month's figures and charts are on the overview.
	-->
	<div class="flex flex-col gap-4 md:gap-6">
		{#if clients.length === 0}
			<p class="text-sm text-muted-foreground">
				Add a client in
				<a href={resolve('/settings/clients')} class="font-medium text-foreground underline">
					Clients settings
				</a>
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
						tasks={taskNames(store.data)}
						onhidetask={(text) => store.hideTask(text)}
						entries={store.data.entries}
						date={defaultDate}
						clientId={githubClient?.id}
						onsave={(entry) => (justAdded = store.addEntry(entry).id)}
					/>
				</Card.Content>
			</Card.Root>
		{/if}
		<DayList
			{store}
			{summary}
			{today}
			organization={settings.organization}
			limit={drawnDays}
			bind:justAdded
		/>
	</div>
</div>
