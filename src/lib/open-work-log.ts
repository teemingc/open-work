import { driveSync } from '#lib/drive-sync.svelte.js';
import { forgetLegacySettings, getLegacySettings } from '#lib/settings.remote.js';
import { DEFAULT_SETTINGS, LEGACY_STORAGE_KEY, parseBackup, type Settings } from '#lib/settings.js';
import { openWorkLog, type WorkLogStore } from '#lib/worklog-store.svelte.js';

/** Settings that earlier versions kept in localStorage, and later in a cookie. */
async function legacySettings(): Promise<Settings | null> {
	try {
		const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
		if (stored) return parseBackup(stored);
	} catch (error) {
		console.error('Saved settings could not be read', error);
	}
	return getLegacySettings();
}

/** Move settings from where earlier versions kept them into the work log, then delete them there. */
async function moveLegacySettings(store: WorkLogStore): Promise<void> {
	const legacy = await legacySettings();
	// Never changed, so any setting changed on another device wins over them.
	store.adopt({ ...store.data, settings: legacy ?? DEFAULT_SETTINGS });
	if (!legacy) return;
	await store.saved();
	if (store.saveError) return;
	try {
		localStorage.removeItem(LEGACY_STORAGE_KEY);
	} catch {
		// Storage blocked: nothing could have been kept there.
	}
	await forgetLegacySettings();
}

/**
 * Give the one collective settings named for every invoice, before each client had its own, to
 * the Open Collective clients without one, then forget it, so a collective you clear stays cleared.
 */
function moveCollective(store: WorkLogStore): void {
	const slug = store.settings.collectiveSlug;
	if (!slug) return;
	store.adoptCollective(slug);
	store.setSettings({ ...store.settings, collectiveSlug: '' });
}

let started: WorkLogStore | undefined;

/**
 * Your settings, and the work log that keeps them, which starts from them the first time it is
 * opened. Starts syncing it with Google Drive, so a change on any page reaches Drive.
 */
export async function openWorkLogWithSettings(): Promise<{
	settings: Settings;
	store: WorkLogStore;
}> {
	const store = await openWorkLog(async () => {
		const settings = (await legacySettings()) ?? DEFAULT_SETTINGS;
		return {
			rate: settings.hourlyRate,
			currency: settings.currency,
			collective: settings.collectiveSlug
		};
	});
	if (started !== store) {
		started = store;
		// Settings from another device, or a backup, can still name one.
		store.onReplace(() => moveCollective(store));
		if (!store.data.settings) await moveLegacySettings(store);
		moveCollective(store);
	}
	driveSync(store);
	return { settings: store.settings, store };
}
