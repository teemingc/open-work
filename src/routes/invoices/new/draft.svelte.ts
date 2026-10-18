import { invoiceTitle, lineItemDescription, totalCents } from '#lib/format.js';
import type { WorkLogStore } from '#lib/worklog-store.svelte.js';
import { entriesFor, rateOn, totalHours } from '#lib/worklog.js';

export interface DraftData {
	startDate: string;
	endDate: string;
	clientId?: string;
	hoursOverride?: number;
	rate: number;
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
	rate = $state(0);
	currency = $state('USD');
	/** Set when you edit the generated title or line item text. */
	titleOverride = $state<string | undefined>();
	descriptionOverride = $state<string | undefined>();

	#store: WorkLogStore;

	/** The client's work log entries in this period. Sent as the expense notes. */
	entries = $derived.by(() =>
		entriesFor({
			entries: this.#store.data.entries,
			clientId: this.clientId,
			startDate: this.startDate,
			endDate: this.endDate
		})
	);
	loggedHours = $derived(totalHours(this.entries));
	hours = $derived(this.hoursOverride ?? this.loggedHours);

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
				endDate: this.endDate
			})
	);
	cents = $derived(totalCents({ hours: this.hours, rate: this.rate }));

	constructor({
		store,
		startDate,
		endDate,
		fallback
	}: {
		store: WorkLogStore;
		startDate: string;
		endDate: string;
		/** Rate and currency when no work log client is invoiced through Open Collective. */
		fallback: { rate: number; currency: string };
	}) {
		this.#store = store;
		this.startDate = startDate;
		this.endDate = endDate;
		const client = store.data.clients.find((other) => other.openCollective);
		this.clientId = client?.id;
		this.rate = client ? rateOn(client, endDate) : fallback.rate;
		this.currency = client?.currency ?? fallback.currency;
	}

	/** Bill another client, at its rate at the end of the period. */
	chooseClient(id: string) {
		const client = this.#store.client(id);
		if (!client) return;
		this.clientId = id;
		this.rate = rateOn(client, this.endDate);
		this.currency = client.currency;
	}

	/** Whether anything typed here would be lost by leaving the page. The log keeps itself. */
	get hasWork(): boolean {
		return (
			this.hoursOverride !== undefined ||
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
			rate: this.rate,
			currency: this.currency,
			titleOverride: this.titleOverride,
			descriptionOverride: this.descriptionOverride
		};
	}

	restore(data: DraftData): void {
		Object.assign(this, data);
	}
}
