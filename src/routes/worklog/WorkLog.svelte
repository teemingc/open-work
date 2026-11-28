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
		monthProjection,
		summarizeMonth,
		taskNames,
		unloggedItems
	} from '#lib/worklog.js';
	import { CircleAlert, CircleCheck, GitPullRequest, TriangleAlert } from '@lucide/svelte';
	import type { Settings } from '#lib/settings.js';
	import { keepReloadScroll } from '#lib/reload-scroll.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { onMount, tick, untrack } from 'svelte';
	import { today as currentDay } from './today.js';
	import DayList from './DayList.svelte';
	import MonthCharts from './MonthCharts.svelte';
	import MonthPace from './MonthPace.svelte';
	import TakeHome from './TakeHome.svelte';
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
	/** Whether the month has a take-home card to sit beside its pace. */
	const hasTakeHome = $derived(monthProjection({ data: store.data, summary, today }) !== undefined);
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

	onMount(() => {
		const scroll = keepReloadScroll();
		// The scroll kept over a reload goes back once the whole month is drawn.
		const frame = requestAnimationFrame(async () => {
			drawnDays = Infinity;
			await tick();
			scroll.restore();
		});
		return () => {
			cancelAnimationFrame(frame);
			scroll.stop();
		};
	});
</script>

<div class="flex flex-col gap-4 md:gap-6">
	<!--
		The month control sits at the right edge of the title's row. Where the row is too narrow or the
		text too large for both, it wraps under the title and fills the row: the title takes all the
		spare room while they share a row, and the control takes it once it has a row to itself.
	-->
	<header class="flex flex-wrap items-center gap-x-3 gap-y-2">
		<h1 class="grow-9999">Work log</h1>
		<div class="flex grow">
			<MonthPicker path="/worklog" {month} current={monthOf(today)} label={monthName} />
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

	{#if clients.length > 0}
		<MonthPace {summary} data={store.data} {today} {current} />
	{/if}

	<!--
		Logging comes first, so the form is in reach as the page opens, with what you log showing up just
		below it. Where there is room the form takes a column of its own beside the days and stays in
		view while they scroll. The month's pace sits above both, short enough to stay in view with the
		form on a folded phone.
	-->
	<div
		class="grid grid-cols-1 items-start gap-4 md:gap-6 @4xl/main:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] @5xl/main:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
	>
		{#if clients.length === 0}
			<p class="text-sm text-muted-foreground @4xl/main:col-span-2">
				Add a client in
				<a href={resolve('/settings/clients')} class="font-medium text-foreground underline">
					Clients settings
				</a>
				to start logging.
			</p>
		{:else}
			<Card.Root
				class="@4xl/main:sticky @4xl/main:top-20 @4xl/main:max-h-[calc(100svh-6rem)] @4xl/main:overflow-y-auto"
			>
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
		>
			{#snippet status()}
				<DriveSyncStatus {sync} />
			{/snippet}
			{#snippet actions()}
				<!--
					Without a username there is nothing to add from; it is set in Settings, under Connections.
					Left off phones, where it would be a bare icon.
				-->
				{#if settings.githubUsername}
					<Button
						variant="outline"
						size="sm"
						class="max-sm:hidden"
						onclick={importFromGitHub}
						disabled={fetching || !githubClient}
					>
						{#if fetching}<Spinner />{:else}<GitPullRequest />{/if}
						Add from GitHub
					</Button>
				{/if}
			{/snippet}
		</DayList>
	</div>

	<!--
		Pace and take-home share a row, so their cards end level. The hours each day take the full
		width, which their thirty bars need, with each client's share under the chart.
	-->
	{#if summary.logged > 0}
		<div
			class={['grid grid-cols-1 gap-4 md:gap-6', hasTakeHome && '@4xl/main:grid-cols-[3fr_2fr]']}
		>
			<MonthCharts chart="pace" {summary} clients={store.data.clients} {today} />
			<TakeHome data={store.data} {summary} {today} />
		</div>
		<MonthCharts chart="daily" {summary} clients={store.data.clients} {today} />
	{/if}
</div>
