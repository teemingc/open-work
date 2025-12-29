<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu';
	import { navigationMenuTriggerStyle } from '$lib/components/ui/navigation-menu/navigation-menu-trigger.svelte';

	const navItems = [
		{ href: '/', label: 'Home' },
		{ href: '/invoices', label: 'Invoices' },
		{ href: '/settings', label: 'Settings' }
	] as const;

	function isActive(href: string): boolean {
		const pathname = page.url.pathname;
		if (href === '/') {
			return pathname === '/';
		}
		return pathname.startsWith(href);
	}
</script>

<nav class="border-b border-gray-200 bg-white">
	<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
		<div class="flex h-16 items-center">
			<NavigationMenu.Root>
				<NavigationMenu.List>
					{#each navItems as item (item.href)}
						<NavigationMenu.Item>
							<NavigationMenu.Link active={isActive(item.href)}>
								{#snippet child()}
									<a href={resolve(item.href)} class={navigationMenuTriggerStyle()}>
										{item.label}
									</a>
								{/snippet}
							</NavigationMenu.Link>
						</NavigationMenu.Item>
					{/each}
				</NavigationMenu.List>
			</NavigationMenu.Root>
		</div>
	</div>
</nav>
