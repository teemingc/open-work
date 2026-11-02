<script lang="ts">
	import { saveSettings } from '#lib/settings.remote.js';
	import type { Settings } from '#lib/settings.js';
	import { settingsStatus } from '#lib/settings-status.svelte.js';
	import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
	import { tick, untrack, type Snippet } from 'svelte';

	let {
		settings,
		store,
		shown,
		children
	}: {
		settings: Settings;
		/** The work log, which keeps a copy of the settings so they sync. */
		store: WorkLogStore;
		/** The settings this page shows. The others are kept as they are when it saves. */
		shown: (keyof Settings)[];
		children: Snippet<[{ save: () => Promise<void> }]>;
	} = $props();

	const fields = saveSettings.fields;
	// The form starts from the saved settings and then owns its values.
	fields.set(untrack(() => ({ ...settings, shown })));

	let formElement = $state<HTMLFormElement>();

	/** Save after a change made in code rather than by typing, once the inputs show it. */
	async function save() {
		await tick();
		formElement?.requestSubmit();
	}

	let savedTimer: ReturnType<typeof setTimeout> | undefined;

	const enhanced = saveSettings.enhance(async ({ submit }) => {
		// No reset: the inputs already show what was saved.
		await submit();
		if (!saveSettings.result?.saved) return;
		store.setSettings({ ...store.settings, ...saveSettings.result.settings });
		settingsStatus.justSaved = true;
		clearTimeout(savedTimer);
		savedTimer = setTimeout(() => (settingsStatus.justSaved = false), 2000);
	});
</script>

<form
	{...enhanced}
	{@attach (node) => {
		formElement = node;
	}}
	onchange={(event) => event.currentTarget.requestSubmit()}
>
	{#each shown as key, index (key)}
		<input {...fields.shown[index].as('hidden', key)} />
	{/each}
	{@render children({ save })}
</form>
