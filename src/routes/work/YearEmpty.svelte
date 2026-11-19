<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { formatHours, formatMoney } from '#lib/format.js';
	import { activeClients, monthOf, type WorkLogData } from '#lib/worklog.js';
	import { CircleCheck, NotebookPen } from '@lucide/svelte';

	let { data, year, today }: { data: WorkLogData; year: number; today: string } = $props();

	interface Step {
		title: string;
		/** Why it is worth doing, while it isn't done. */
		why: string;
		/** What was set, once it is done. */
		set?: string;
		action: string;
		/** What the Change button changes, for screen readers. */
		topic: string;
		href: string;
		optional?: boolean;
	}

	const clients = $derived(activeClients(data.clients));
	const github = $derived(data.settings?.githubUsername);

	/** Each step is done once its setting is, so the list follows what is already in the log. */
	const steps = $derived.by((): Step[] => {
		const [first, ...more] = clients;
		const holidays = data.holidays.filter((day) => day.date.startsWith(`${year}-`)).length;
		const timeOff = [
			data.allowance && `${formatHours(data.allowance.days)} days off a year`,
			holidays > 0 && `${holidays} public ${holidays === 1 ? 'holiday' : 'holidays'} in ${year}`
		].filter(Boolean);
		return [
			{
				title: 'Add a client',
				why: 'Who you work for and what an hour costs them, so your hours count towards earnings.',
				set:
					first &&
					`${first.name} at ${formatMoney(first.rate, first.currency)} an hour${more.length > 0 ? `, and ${more.length} more` : ''}`,
				action: 'Add a client',
				topic: 'clients',
				href: resolve('/settings/clients')
			},
			{
				title: 'Set your time off',
				why: 'Public holidays and days off come out of the hours each month expects of you.',
				set: timeOff.length > 0 ? timeOff.join(' and ') : undefined,
				action: 'Set time off',
				topic: 'time off',
				href: resolve('/settings/time-off')
			},
			{
				title: 'Connect GitHub',
				why: 'Add the pull requests and issues you worked on to the log in one go.',
				set: github && `As ${github}`,
				action: 'Connect GitHub',
				topic: 'GitHub connection',
				href: resolve('/settings/connections'),
				optional: true
			},
			{
				title: 'Log your first hours',
				why: 'Your pace, earnings and take-home fill this page in from the first entry.',
				action: 'Log time',
				topic: 'entries',
				href: resolve('/worklog')
			}
		];
	});
	const done = $derived(steps.filter((step) => step.set).length);
	/** The first step left is the one to do next, and the only one drawn as the main action. */
	const next = $derived(steps.findIndex((step) => !step.set));

	const thisYear = $derived(Number(monthOf(today).slice(0, 4)));
	/** Where logging for this year starts: today in this year, else its first month. */
	const logHref = $derived(
		year === thisYear ? resolve('/worklog') : `${resolve('/worklog')}?month=${year}-01`
	);
</script>

{#if data.entries.length > 0}
	<!-- Set up already, with time logged in other years: nothing to walk through, just this year empty. -->
	<Card.Root>
		<Empty.Root class="p-6 md:p-10">
			<Empty.Header>
				<Empty.Media variant="icon" class="size-12 bg-accent text-accent-foreground">
					<NotebookPen class="size-6" aria-hidden="true" />
				</Empty.Media>
				<h2 class="font-display text-2xl font-medium text-(--heading)">Nothing logged in {year}</h2>
				<Empty.Description>
					{year < thisYear
						? 'Time logged for this year would show here.'
						: 'Your figures for the year start from its first entry.'}
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query string -->
				<Button href={logHref}>Log time</Button>
			</Empty.Content>
		</Empty.Root>
	</Card.Root>
{:else}
	<!--
		A first visit reads as a short ledger of what to set up, each line ticked off as its setting is
		made. Done steps keep their row, showing what was set, so the list doesn't jump about.
	-->
	<Card.Root>
		<Card.Header>
			<Card.Title class="font-display text-2xl font-medium text-(--heading)">Get started</Card.Title
			>
			<Card.Description>A few settings, then your first hours fill in this page.</Card.Description>
			<Card.Action>
				<span class="text-sm text-muted-foreground tabular-nums">{done} of {steps.length} done</span
				>
			</Card.Action>
		</Card.Header>
		<Card.Content class="px-0">
			<!--
				The rows share the list's columns, so every button is as wide as the widest. Narrow, each
				button goes under its step's text, as wide as the text.
			-->
			<div class="@container/steps">
				<ol
					class="ledger-rows grid grid-cols-[auto_minmax(0,1fr)] border-y @lg/steps:grid-cols-[auto_minmax(0,1fr)_auto]"
				>
					{#each steps as step, index (step.title)}
						<li
							class="col-span-full grid grid-cols-subgrid items-start gap-x-4 gap-y-3 px-(--card-padding) py-4 @lg/steps:items-center"
						>
							<!-- A tick or the step's number: the shape says which, not only the colour. -->
							{#if step.set}
								<CircleCheck class="size-7 text-status-paid" aria-hidden="true" />
							{:else}
								<span
									class="grid size-7 place-items-center rounded-full border font-display text-sm tabular-nums"
									aria-hidden="true">{index + 1}</span
								>
							{/if}
							<div class="min-w-0">
								<h3
									class={[
										'flex flex-wrap items-center gap-2 text-base',
										step.set && 'font-medium text-muted-foreground'
									]}
								>
									{#if step.set}<span class="sr-only">Done:</span>{/if}
									{step.title}
									{#if step.optional && !step.set}<Badge variant="outline">Optional</Badge>{/if}
								</h3>
								<p class="text-sm text-muted-foreground">{step.set ?? step.why}</p>
							</div>
							<Button
								href={step.href}
								variant={index === next ? 'default' : 'outline'}
								size="sm"
								class="col-start-2 @lg/steps:col-start-3"
							>
								{step.set ? 'Change' : step.action}
								{#if step.set}<span class="sr-only">{step.topic}</span>{/if}
							</Button>
						</li>
					{/each}
				</ol>
			</div>
		</Card.Content>
		<Card.Footer class="text-sm text-muted-foreground">
			<p>
				Each working day expects {formatHours(data.hoursPerDay)} h.
				<a href={resolve('/settings/hours')} class="text-foreground underline">Change hours</a>
			</p>
		</Card.Footer>
	</Card.Root>
{/if}
