<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { getMe } from '#lib/opencollective.remote.js';
	import { getSettings } from '#lib/settings.remote.js';
	import { missingForSubmit } from '#lib/settings.js';
	import { ChartLine, Clock, FileText, Settings } from '@lucide/svelte';

	// Read without `await` so the header never waits on Open Collective.
	const me = $derived(getMe().current);
	const settings = $derived(getSettings().current);
	const needsSetup = $derived(
		me !== undefined &&
			settings !== undefined &&
			missingForSubmit({ settings, connected: me !== null }).length > 0
	);

	function isCurrent(path: '/' | '/worklog' | '/collective' | '/settings'): boolean {
		return path === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(path);
	}
</script>

<header class="border-b bg-card">
	<div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
		<a href={resolve('/')} class="flex items-center gap-2 font-semibold tracking-tight">
			Open Work
		</a>

		<nav aria-label="Main" class="flex items-center gap-1 text-sm">
			<a
				href={resolve('/')}
				aria-current={isCurrent('/') ? 'page' : undefined}
				class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground"
			>
				<FileText size={15} />
				<span class="max-sm:sr-only">Invoices</span>
			</a>
			<a
				href={resolve('/worklog')}
				aria-current={isCurrent('/worklog') ? 'page' : undefined}
				class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground"
			>
				<Clock size={15} />
				<span class="max-sm:sr-only">Work log</span>
			</a>
			<a
				href={resolve('collective')}
				aria-current={isCurrent('/collective') ? 'page' : undefined}
				class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground"
			>
				<ChartLine size={15} />
				<span class="max-sm:sr-only">Collective</span>
			</a>
			<a
				href={resolve('settings')}
				aria-current={isCurrent('/settings') ? 'page' : undefined}
				class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground"
			>
				<Settings size={15} />
				<span class="max-sm:sr-only">Settings</span>
				<!-- Always takes its space, so the nav does not move when it appears. -->
				<span
					class={['size-1.5 rounded-full bg-primary', !needsSetup && 'invisible']}
					title={needsSetup ? 'Setup unfinished' : undefined}
				></span>
			</a>
		</nav>
	</div>
</header>
