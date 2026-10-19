import { invoiceTitle, lineItemDescription, totalCents } from '#lib/format.js';
import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
import { earnings, entriesFor, rateOn } from '#lib/worklog.js';

export interface DraftData {
	startDate: string;
	endDate: string;
	clientId?: string;
	hoursOverride?: number;
	rateOverride?: number;
	currency: string;
	titleOverride?: string;
	descriptionOverride?: string;
}

/**
 * An invoice being written. Its hours and notes come from the work log; it only lives on this
 * page, and once submitted, Open Collective holds the expense.
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

	#store: WorkLogStore;
	#fallbackRate: number;

	client = $derived.by(() => (this.clientId ? this.#store.client(this.clientId) : undefined));
	/** The client has to be chosen before its work can be billed. */
	needsClient = $derived.by(() => this.client === undefined && this.#store.data.clients.length > 0);

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
		fallback
	}: {
		store: WorkLogStore;
		startDate: string;
		endDate: string;
		/** Rate and currency when the work log has no clients. */
		fallback: { rate: number; currency: string };
	}) {
		this.#store = store;
		this.#fallbackRate = fallback.rate;
		this.startDate = startDate;
		this.endDate = endDate;
		const { clients } = store.data;
		// The client invoiced through Open Collective, or the only one there is.
		const client =
			clients.find((other) => other.openCollective) ??
			(clients.length === 1 ? clients[0] : undefined);
		this.clientId = client?.id;
		this.currency = client?.currency ?? fallback.currency;
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
		return (
			this.hoursOverride !== undefined ||
			this.rateOverride !== undefined ||
			this.titleOverride !== undefined ||
			this.descriptionOverride !== undefined
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
			descriptionOverride: this.descriptionOverride
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
	}
}
