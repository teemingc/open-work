import { forgetMovedSettings, getSettings } from '#lib/settings.remote.js';
import type { Settings } from '#lib/settings.js';
import { openWorkLog, type WorkLogStore } from '#lib/worklog-store.svelte.js';
import { emptyInvoicing } from '#lib/worklog.js';

/** How earlier versions put the tax number in the invoice note. */
const TAX_NOTE = /^tax income number:\s*(\S.*)$/i;

/**
 * Your address and invoice note, which settings kept for Open Collective until emailed invoices
 * gave the work log its own, moved there. Fills only what is empty, then forgets them in settings.
 */
async function moveToWorkLog({ settings, store }: { settings: Settings; store: WorkLogStore }) {
	const { invoiceNote, payeeAddress, payeeCountry } = settings;
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
	await forgetMovedSettings();
}

/** Your settings, and the work log, which starts from them the first time it is opened. */
export async function openWorkLogWithSettings(): Promise<{
	settings: Settings;
	store: WorkLogStore;
}> {
	const settings = await getSettings();
	const store = await openWorkLog({
		rate: settings.hourlyRate,
		currency: settings.currency,
		collective: settings.collectiveSlug
	});
	await moveToWorkLog({ settings, store });
	return { settings, store };
}
