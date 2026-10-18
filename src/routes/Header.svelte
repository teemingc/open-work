<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getMe } from '#lib/opencollective.remote.js';
	import { getSettings } from '#lib/settings.remote.js';
	import { missingForSubmit } from '#lib/settings.js';
	import logo from '#lib/assets/favicon.svg';
	import { ChartLine, Clock, FileText, Settings } from '@lucide/svelte';

	// Read without `await` so the header never waits on Open Collective.
	const me = $derived(getMe().current);
	const settings = $derived(getSettings().current);
	const needsSetup = $derived(
		me !== undefined &&
			settings !== undefined &&
			missingForSubmit({ settings, connected: me !== null }).length > 0
	);

	/** The home page is the collective page too. */
	function isCurrent(path: '/collective' | '/invoices' | '/worklog' | '/settings'): boolean {
		const { pathname } = page.url;
		return pathname.startsWith(path) || (path === '/collective' && pathname === '/');
	}
</script>

<!-- A double rule closes the masthead, like the head of a ledger page. -->
<header class="border-b-[3px] border-double border-rule bg-card">
	<div class="mx-auto flex h-16 max-w-6xl items-stretch justify-between gap-4 px-4 sm:px-6">
		<a
			href={resolve('/')}
			class="flex items-center gap-2.5 font-display text-xl font-semibold text-primary"
		>
			<img src={logo} alt="" class="size-7" />
			Open Work
		</a>

		<nav aria-label="Main" class="flex items-stretch gap-1 text-sm sm:gap-2">
			<a
				href={resolve('/')}
				aria-current={isCurrent('/collective') ? 'page' : undefined}
				class="-mb-[3px] flex items-center gap-1.5 border-b-2 border-transparent px-2 text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-foreground sm:px-3"
			>
				<ChartLine size={15} />
				<span class="max-sm:sr-only">Collective</span>
			</a>
			<a
				href={resolve('/worklog')}
				aria-current={isCurrent('/worklog') ? 'page' : undefined}
				class="-mb-[3px] flex items-center gap-1.5 border-b-2 border-transparent px-2 text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-foreground sm:px-3"
			>
				<Clock size={15} />
				<span class="max-sm:sr-only">Work log</span>
			</a>
			<a
				href={resolve('/invoices')}
				aria-current={isCurrent('/invoices') ? 'page' : undefined}
				class="-mb-[3px] flex items-center gap-1.5 border-b-2 border-transparent px-2 text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-foreground sm:px-3"
			>
				<FileText size={15} />
				<span class="max-sm:sr-only">Invoices</span>
			</a>
			<a
				href={resolve('settings')}
				aria-current={isCurrent('/settings') ? 'page' : undefined}
				class="-mb-[3px] flex items-center gap-1.5 border-b-2 border-transparent px-2 text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-foreground sm:px-3"
			>
				<Settings size={15} />
				<span class="max-sm:sr-only">Settings</span>
				<!-- Always takes its space, so the nav does not move when it appears. -->
				<span
					class={['size-1.5 rounded-full bg-attention', !needsSetup && 'invisible']}
					title={needsSetup ? 'Setup unfinished' : undefined}
				></span>
			</a>
		</nav>
	</div>
</header>
