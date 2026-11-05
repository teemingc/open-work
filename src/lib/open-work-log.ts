import { driveSync } from '#lib/drive-sync.svelte.js';
import { forgetLegacySettings, getLegacySettings } from '#lib/settings.remote.js';
import { DEFAULT_SETTINGS, LEGACY_STORAGE_KEY, parseBackup, type Settings } from '#lib/settings.js';
import { openWorkLog, type WorkLogStore } from '#lib/worklog-store.svelte.js';
import { emptyInvoicing } from '#lib/worklog.js';

/** How earlier versions put the tax number in the invoice note. */
const TAX_NOTE = /^tax income number:\s*(\S.*)$/i;

/**
 * Your address and invoice note, which settings kept for Open Collective until emailed invoices
 * gave the work log its own, moved there. Fills only what is empty, then forgets them in settings.
 */
function moveToInvoicing(store: WorkLogStore) {
	const { invoiceNote, payeeAddress, payeeCountry } = store.settings;
	if (!invoiceNote && !payeeAddress && !payeeCountry) return;

	const current = store.data.invoicing ?? emptyInvoicing();
	const invoicing = { ...current, address: { ...current.address } };
	const { address } = invoicing;
	if (payeeAddress && !address.street && !address.city && !address.postcode) {
		address.street = payeeAddress;
	}
	if (payeeCountry && !address.country) address.country = payeeCountry.toUpperCase();
	const taxId = invoiceNote?.match(TAX_NOTE)?.[1].trim();
	if (taxId) {
		invoicing.taxId ||= taxId;
	} else if (invoiceNote) {
		invoicing.notes ||= invoiceNote;
	}

	if (JSON.stringify(invoicing) !== JSON.stringify(current)) store.setInvoicing(invoicing);
	store.setSettings({
		...store.settings,
		invoiceNote: undefined,
		payeeAddress: undefined,
		payeeCountry: undefined
	});
}

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
		// Offline, the log starts from the defaults.
		const settings = (await legacySettings().catch(() => null)) ?? DEFAULT_SETTINGS;
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
		if (!store.data.settings) {
			// Offline, the move waits for a visit online, as nothing has been adopted yet.
			await moveLegacySettings(store).catch((error) => {
				console.error('Saved settings could not be moved', error);
			});
		}
		moveCollective(store);
	}
	moveToInvoicing(store);
	driveSync(store);
	return { settings: store.settings, store };
}
