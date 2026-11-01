import { invoiceTitle, lineItemDescription, totalCents } from '#lib/format.js';
import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
import {
	activeClients,
	defaultClient,
	earnings,
	entriesFor,
	rateOn,
	suggestedInvoiceNumber,
	type Invoice,
	type InvoiceStatus
} from '#lib/worklog.js';

export interface DraftData {
	startDate: string;
	endDate: string;
	clientId?: string;
	hoursOverride?: number;
	rateOverride?: number;
	currency: string;
	titleOverride?: string;
	descriptionOverride?: string;
	invoiceId?: string;
	numberOverride?: string;
}

/**
 * An invoice being written. Its hours and notes come from the work log. Once submitted, Open
 * Collective holds the expense; an invoice sent by email is kept in the work log.
 */
export class Draft {
	startDate = $state('');
	endDate = $state('');
	/** The work log client this invoice bills. */
	clientId = $state<string | undefined>();
	/** Set when you type the hours instead of using the ones in the work log. */
	hoursOverride = $state<number | undefined>();
	/** Set when you type the rate instead of using the ones in the work log. */
	rateOverride = $state<number | undefined>();
	currency = $state('USD');
	/** Set when you edit the generated title or line item text. */
	titleOverride = $state<string | undefined>();
	descriptionOverride = $state<string | undefined>();
	/** The saved invoice this edits, for clients invoiced by email. */
	invoiceId = $state<string | undefined>();
	/** Set when you edit the suggested invoice number. */
	numberOverride = $state<string | undefined>();

	#store: WorkLogStore;
	#fallbackRate: number;
	/** The saved invoice as it was picked up, so leaving it unchanged loses nothing. */
	#saved: string | undefined;

	client = $derived.by(() => (this.clientId ? this.#store.client(this.clientId) : undefined));
	/** Invoiced by email, so saved in the work log rather than submitted to Open Collective. */
	byEmail = $derived.by(() => this.client !== undefined && !this.client.openCollective);
	number = $derived.by(
		() =>
			this.numberOverride ??
			(this.client
				? suggestedInvoiceNumber({ client: this.client, startDate: this.startDate })
				: '')
	);
	/** The client has to be chosen before its work can be billed. */
	needsClient = $derived.by(
		() => this.client === undefined && activeClients(this.#store.data.clients).length > 0
	);

	/** The client's work log entries in this period. Sent as the expense notes. */
	entries = $derived.by(() =>
		this.client
			? entriesFor({
					entries: this.#store.data.entries,
					clientId: this.client.id,
					startDate: this.startDate,
					endDate: this.endDate
				})
			: []
	);
	/** The logged entries, each billed at its own rate. */
	logged = $derived.by(() => {
		if (!this.client) {
			return { hours: 0, amount: 0, rate: this.#fallbackRate, mixedRates: false };
		}
		const logged = earnings({ client: this.client, entries: this.entries });
		// Before anything is logged, show the rate the period would be billed at.
		return logged.hours > 0 ? logged : { ...logged, rate: rateOn(this.client, this.endDate) };
	});
	loggedHours = $derived(this.logged.hours);
	hours = $derived(this.hoursOverride ?? this.loggedHours);
	rate = $derived(this.rateOverride ?? this.logged.rate);
	/** The logged hours were billed at more than one rate, and `rate` is their average. */
	averagedRate = $derived(this.rateOverride === undefined && this.logged.mixedRates);

	title = $derived(
		this.titleOverride ?? invoiceTitle({ startDate: this.startDate, endDate: this.endDate })
	);
	itemDescription = $derived(
		this.descriptionOverride ??
			lineItemDescription({
				hours: this.hours,
				rate: this.rate,
				currency: this.currency,
				startDate: this.startDate,
				endDate: this.endDate,
				averaged: this.averagedRate
			})
	);
	cents = $derived(
		this.hoursOverride === undefined && this.rateOverride === undefined && this.client
			? Math.round(this.logged.amount * 100)
			: totalCents({ hours: this.hours, rate: this.rate })
	);

	constructor({
		store,
		startDate,
		endDate,
		clientId,
		invoice,
		fallback
	}: {
		store: WorkLogStore;
		startDate: string;
		endDate: string;
		/** The client chosen before the invoice started, else the usual one. */
		clientId?: string;
		/** A saved invoice to carry on with. */
		invoice?: Invoice;
		/** Rate and currency when the work log has no clients. */
		fallback: { rate: number; currency: string };
	}) {
		this.#store = store;
		this.#fallbackRate = fallback.rate;
		if (invoice) {
			this.edit(invoice);
			return;
		}
		this.startDate = startDate;
		this.endDate = endDate;
		const chosen = clientId ? store.client(clientId) : undefined;
		const client = chosen && !chosen.archived ? chosen : defaultClient(store.data.clients);
		this.clientId = client?.id;
		this.currency = client?.currency ?? fallback.currency;
	}

	/** Pick up a saved invoice, keeping what it billed where that differs from the log now. */
	edit(invoice: Invoice) {
		this.invoiceId = invoice.id;
		this.clientId = invoice.clientId;
		this.startDate = invoice.startDate;
		this.endDate = invoice.endDate;
		this.currency = invoice.currency;
		this.numberOverride = invoice.number;
		if (invoice.hours !== this.loggedHours) this.hoursOverride = invoice.hours;
		if (invoice.rate !== this.logged.rate) this.rateOverride = invoice.rate;
		this.#saved = JSON.stringify(this.toJSON());
	}

	/** The invoice to keep in the work log. `today` is when it counts as sent, if it is now. */
	toInvoice({
		status,
		today
	}: {
		status: InvoiceStatus;
		today: string;
	}): Omit<Invoice, 'id' | 'updatedAt'> & { id?: string } {
		const saved = this.invoiceId ? this.#store.invoice(this.invoiceId) : undefined;
		return {
			id: this.invoiceId,
			clientId: this.clientId ?? '',
			number: this.number.trim() || undefined,
			startDate: this.startDate,
			endDate: this.endDate,
			hours: this.hours,
			rate: this.rate,
			amount: this.cents / 100,
			currency: this.currency,
			status,
			sentOn: status === 'draft' ? undefined : (saved?.sentOn ?? today),
			dueOn: status === 'draft' ? undefined : saved?.dueOn,
			paidOn: status === 'paid' ? saved?.paidOn : undefined
		};
	}

	/** Bill another client, at its own rates. */
	chooseClient(id: string) {
		const client = this.#store.client(id);
		if (!client) return;
		this.clientId = id;
		this.rateOverride = undefined;
		this.currency = client.currency;
	}

	/** Whether anything typed here would be lost by leaving the page. The log keeps itself. */
	get hasWork(): boolean {
		if (this.#saved !== undefined) return JSON.stringify(this.toJSON()) !== this.#saved;
		return (
			this.hoursOverride !== undefined ||
			this.rateOverride !== undefined ||
			this.titleOverride !== undefined ||
			this.descriptionOverride !== undefined ||
			this.numberOverride !== undefined
		);
	}

	toJSON(): DraftData {
		return {
			startDate: this.startDate,
			endDate: this.endDate,
			clientId: this.clientId,
			hoursOverride: this.hoursOverride,
			rateOverride: this.rateOverride,
			currency: this.currency,
			titleOverride: this.titleOverride,
			descriptionOverride: this.descriptionOverride,
			invoiceId: this.invoiceId,
			numberOverride: this.numberOverride
		};
	}

	restore(data: DraftData): void {
		this.startDate = data.startDate;
		this.endDate = data.endDate;
		this.clientId = data.clientId;
		this.hoursOverride = data.hoursOverride;
		this.rateOverride = data.rateOverride;
		this.currency = data.currency;
		this.titleOverride = data.titleOverride;
		this.descriptionOverride = data.descriptionOverride;
		this.invoiceId = data.invoiceId;
		this.numberOverride = data.numberOverride;
	}
}
