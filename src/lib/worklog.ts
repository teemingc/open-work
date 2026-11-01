/**
 * The work log: who you worked for, when, on what, and how that compares with the hours a
 * month expects. Pure helpers and the stored shape; storage lives in `worklog-store.svelte.ts`.
 */

import * as v from 'valibot';
import { addDays, formatDMY, parseIsoDate, toIsoDate } from './format';

/* ---------------------------------- Shape ---------------------------------- */

const IsoDate = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));
const Time = v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/));
const Currency = v.pipe(v.string(), v.regex(/^[A-Z]{3}$/, 'Use a three-letter code like USD'));

const WorkRefSchema = v.variant('kind', [
	v.object({
		kind: v.picklist(['pr', 'issue']),
		owner: v.string(),
		repo: v.string(),
		number: v.number()
	}),
	v.object({ kind: v.literal('advisory'), owner: v.string(), repo: v.string(), id: v.string() }),
	v.object({ kind: v.literal('task'), text: v.string() })
]);

/** What you worked on: something on GitHub, or a task like a meeting. */
export type WorkRef = v.InferOutput<typeof WorkRefSchema>;

const Rate = v.pipe(v.number(), v.minValue(0));

const RateChangeSchema = v.object({ from: IsoDate, rate: Rate });

/** A rate that applies from a date until the next change. */
export type RateChange = v.InferOutput<typeof RateChangeSchema>;

/** When a record last changed, so two copies of the log can merge record by record. */
const UpdatedAt = v.optional(v.string());

const FrequencySchema = v.picklist(['monthly', 'twice-monthly']);

/** How often a client is invoiced: once a month, or for the 1st–15th and the 16th–end. */
export type InvoiceFrequency = v.InferOutput<typeof FrequencySchema>;

const AddressSchema = v.object({
	street: v.optional(v.string(), ''),
	/** A second line, like a floor or building. */
	extra: v.optional(v.string(), ''),
	city: v.optional(v.string(), ''),
	postcode: v.optional(v.string(), ''),
	/** A state or province, where the address needs one. */
	region: v.optional(v.string(), ''),
	/** A two-letter country code, like MY or US. */
	country: v.optional(v.string(), '')
});

/** A postal address, in the parts an e-invoice asks for. */
export type Address = v.InferOutput<typeof AddressSchema>;

const TaxCategorySchema = v.picklist(['outside-scope', 'reverse-charge', 'standard']);

/**
 * How an invoice is taxed: outside the scope of VAT (as for work done for a client in another
 * country), reverse charge (the client accounts for VAT), or VAT added at a rate.
 */
export type TaxCategory = v.InferOutput<typeof TaxCategorySchema>;

const TaxSchema = v.object({
	category: TaxCategorySchema,
	/** The VAT rate in percent, for `standard`. */
	rate: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100)))
});

export type Tax = v.InferOutput<typeof TaxSchema>;

const ClientSchema = v.object({
	id: v.string(),
	updatedAt: UpdatedAt,
	name: v.pipe(v.string(), v.trim(), v.nonEmpty('Give the client a name')),
	/** The rate today, and on any date before the first rate change. */
	rate: Rate,
	/** Rate changes in date order, so past work earns what it was billed at. */
	rates: v.optional(v.array(RateChangeSchema)),
	currency: Currency,
	/** Invoiced through Open Collective, so new invoices take their hours from this client. */
	openCollective: v.optional(v.boolean(), false),
	/** Unset for clients from before it could be chosen; see `invoiceFrequency`. */
	frequency: v.optional(FrequencySchema),
	/** The percentage of each month's expected hours meant for this client. */
	targetShare: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100))),
	/** Kept for the time logged for it, but no longer offered for new work or invoices. */
	archived: v.optional(v.boolean()),
	/** For clients invoiced by email: where the invoice goes. */
	email: v.optional(v.string()),
	/** The client's legal name on the invoice, when it differs from the name you use. */
	legalName: v.optional(v.string()),
	address: v.optional(AddressSchema),
	/** The client's VAT number, for reverse-charge invoices. */
	vatId: v.optional(v.string()),
	/** How the invoice is taxed. Unset is outside the scope of VAT, as for most clients abroad. */
	tax: v.optional(TaxSchema),
	/** Days the client has to pay. */
	paymentDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	/** The invoice's one line item, like "Maintenance and development". */
	lineItem: v.optional(v.string()),
	/** The email's subject and message. `{period}` and `{number}` are filled in. */
	emailSubject: v.optional(v.string()),
	emailMessage: v.optional(v.string())
});

export type Client = v.InferOutput<typeof ClientSchema>;

const EntrySchema = v.object({
	id: v.string(),
	updatedAt: UpdatedAt,
	date: IsoDate,
	clientId: v.string(),
	/** Set both or neither. */
	start: v.optional(Time),
	end: v.optional(Time),
	/** Hours worked when you did not note the times. Ignored when there are times. */
	hours: v.optional(v.pipe(v.number(), v.minValue(0))),
	/** Pay an hour for this block, when it differs from the client's rate on the day. */
	rate: v.optional(Rate),
	/** Everything worked on in this block of time. */
	items: v.array(WorkRefSchema)
});

/** One block of time for one client, and the things worked on in it. */
export type WorkLogEntry = v.InferOutput<typeof EntrySchema>;

const DayOffSchema = v.object({ date: IsoDate, name: v.string(), updatedAt: UpdatedAt });

/** A public holiday or a day of leave. */
export type DayOff = v.InferOutput<typeof DayOffSchema>;

const InvoiceStatusSchema = v.picklist(['draft', 'sent', 'paid']);

/** Where an invoice you send yourself is at: being written, sent, or paid. */
export type InvoiceStatus = v.InferOutput<typeof InvoiceStatusSchema>;

const InvoiceSchema = v.object({
	id: v.string(),
	updatedAt: UpdatedAt,
	clientId: v.string(),
	/** Like ZENOS-2026-09. */
	number: v.optional(v.string()),
	startDate: IsoDate,
	endDate: IsoDate,
	hours: v.pipe(v.number(), v.minValue(0)),
	/** Per hour: the one rate billed, or the average when the hours were billed at several. */
	rate: Rate,
	amount: v.pipe(v.number(), v.minValue(0)),
	currency: Currency,
	status: InvoiceStatusSchema,
	/** Also the invoice's date of issue. */
	sentOn: v.optional(IsoDate),
	/** Set when it is sent, from the client's payment days then. */
	dueOn: v.optional(IsoDate),
	paidOn: v.optional(IsoDate)
});

/**
 * An invoice for a client you invoice by email. Open Collective keeps its own, so those are
 * read from there instead.
 */
export type Invoice = v.InferOutput<typeof InvoiceSchema>;

const InvoicingSchema = v.object({
	/** Your name, or your business's, as the invoice is from. */
	name: v.optional(v.string(), ''),
	address: v.optional(AddressSchema, {
		street: '',
		extra: '',
		city: '',
		postcode: '',
		region: '',
		country: ''
	}),
	email: v.optional(v.string(), ''),
	/** A tax number from where you live, like a Malaysian income tax number. */
	taxId: v.optional(v.string(), ''),
	/** Your VAT number, if you have one. */
	vatId: v.optional(v.string(), ''),
	/** The bank account you are paid into. */
	accountName: v.optional(v.string(), ''),
	/** An IBAN, or an account number where there is none. */
	accountNumber: v.optional(v.string(), ''),
	/** The bank's BIC or SWIFT code. */
	bic: v.optional(v.string(), ''),
	/** Anything else needed to pay you, like the bank's name and a routing number. */
	payment: v.optional(v.string(), ''),
	/** Anything else every invoice says, like your tax status. */
	notes: v.optional(v.string(), '')
});

/** What every invoice you email says about you. */
export type Invoicing = v.InferOutput<typeof InvoicingSchema>;

/** Invoice details with nothing filled in yet. */
export function emptyInvoicing(): Invoicing {
	return v.parse(InvoicingSchema, {});
}

const TombstoneSchema = v.object({
	kind: v.picklist(['entry', 'client', 'holiday', 'leave', 'invoice']),
	/** The entry's or client's id, or the day off's date. */
	id: v.string(),
	at: v.string()
});

/** A deleted record, remembered so syncing does not resurrect it. */
export type Tombstone = v.InferOutput<typeof TombstoneSchema>;

export const WorkLogSchema = v.object({
	version: v.literal(1),
	clients: v.array(ClientSchema),
	entries: v.array(EntrySchema),
	holidays: v.array(DayOffSchema),
	leave: v.array(DayOffSchema),
	invoices: v.optional(v.array(InvoiceSchema), []),
	hoursPerDay: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(24)), 8),
	/** Shows totals in a second currency, like USD earnings in MYR. */
	exchange: v.optional(
		v.object({ from: Currency, to: Currency, rate: v.pipe(v.number(), v.minValue(0)) })
	),
	/** When the log last changed. */
	updatedAt: v.optional(v.string()),
	/** When the hours per day or the exchange rate last changed. */
	scheduleUpdatedAt: v.optional(v.string()),
	invoicing: v.optional(InvoicingSchema),
	/** When your invoice details last changed. */
	invoicingUpdatedAt: v.optional(v.string()),
	/** Records deleted here, so a copy that still has them does not bring them back. */
	deleted: v.optional(v.array(TombstoneSchema), [])
});

export type WorkLogData = v.InferOutput<typeof WorkLogSchema>;

export function emptyWorkLog(): WorkLogData {
	return {
		version: 1,
		clients: [],
		entries: [],
		holidays: [],
		leave: [],
		invoices: [],
		hoursPerDay: 8,
		deleted: []
	};
}

/* ---------------------------------- Items ---------------------------------- */

export const WORK_LOG_HEADER = 'Date | Repository | Issue/PR';

/**
 * `owner/repo/pull/1`, `repo/issues/2` (the owner defaults to your organization),
 * `owner/repo/security/advisories/GHSA-…`, each optionally as a full GitHub URL.
 */
const GITHUB_REF =
	/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?(?:([\w.-]+)\/)?([\w.-]+)\/(pull|issues|security\/advisories|advisories)\/([\w-]+)\/?(?:[?#].*)?$/i;

/** Read what you typed into the item field. Anything that is not a GitHub path is a task. */
export function parseRef({
	input,
	organization
}: {
	input: string;
	organization?: string;
}): WorkRef | undefined {
	const text = input.trim();
	if (!text) return undefined;

	const match = GITHUB_REF.exec(text);
	const owner = match?.[1] ?? organization?.trim();
	if (!match || !owner) return { kind: 'task', text };

	const [, , repo, type, id] = match;
	if (type.toLowerCase().endsWith('advisories')) {
		return /^GHSA-/i.test(id) ? { kind: 'advisory', owner, repo, id: id.toUpperCase() } : undefined;
	}
	if (!/^\d+$/.test(id)) return undefined;
	return { kind: type.toLowerCase() === 'pull' ? 'pr' : 'issue', owner, repo, number: Number(id) };
}

/** "Pull request #17363 in sveltejs/kit", for showing what the item field understood. */
export function describeRef(ref: WorkRef): string {
	switch (ref.kind) {
		case 'pr':
			return `Pull request #${ref.number} in ${ref.owner}/${ref.repo}`;
		case 'issue':
			return `Issue #${ref.number} in ${ref.owner}/${ref.repo}`;
		case 'advisory':
			return `Security advisory ${ref.id} in ${ref.owner}/${ref.repo}`;
		case 'task':
			return ref.text;
	}
}

export function refUrl(ref: WorkRef): string | undefined {
	switch (ref.kind) {
		case 'pr':
			return `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`;
		case 'issue':
			return `https://github.com/${ref.owner}/${ref.repo}/issues/${ref.number}`;
		case 'advisory':
			return `https://github.com/${ref.owner}/${ref.repo}/security/advisories/${ref.id}`;
		case 'task':
			return undefined;
	}
}

/** The repository and item columns of a log line. Repositories in your organization drop the owner. */
export function refCells({
	ref,
	organization
}: {
	ref: WorkRef;
	organization?: string;
}): [repository: string, item: string] {
	if (ref.kind === 'task') return ['—', ref.text];
	const sameOrg = ref.owner.toLowerCase() === organization?.trim().toLowerCase();
	const repository = sameOrg ? ref.repo : `${ref.owner}/${ref.repo}`;
	switch (ref.kind) {
		case 'pr':
			return [repository, `PR #${ref.number}`];
		case 'issue':
			return [repository, `Issue #${ref.number}`];
		case 'advisory':
			return [repository, `Advisory ${ref.id}`];
	}
}

export function refKey(ref: WorkRef): string {
	switch (ref.kind) {
		case 'pr':
		case 'issue':
			return `${ref.kind}:${ref.owner}/${ref.repo}#${ref.number}`.toLowerCase();
		case 'advisory':
			return `advisory:${ref.owner}/${ref.repo}#${ref.id}`.toLowerCase();
		case 'task':
			return `task:${ref.text.trim().toLowerCase()}`;
	}
}

/* ---------------------------------- Hours ---------------------------------- */

function minutes(time: string): number {
	const [hours, mins] = time.split(':').map(Number);
	return hours * 60 + mins;
}

/** Hours in a block: from its times (an end before the start runs past midnight), else as typed. */
export function entryHours(entry: Pick<WorkLogEntry, 'start' | 'end' | 'hours'>): number {
	if (entry.start && entry.end) {
		let span = minutes(entry.end) - minutes(entry.start);
		if (span < 0) span += 24 * 60;
		return span / 60;
	}
	return entry.hours ?? 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function totalHours(entries: Pick<WorkLogEntry, 'start' | 'end' | 'hours'>[]): number {
	return round2(entries.reduce((sum, entry) => sum + entryHours(entry), 0));
}

/** Where an entry goes to keep the log in date and start-time order. */
export function insertionIndex({
	entries,
	entry
}: {
	entries: WorkLogEntry[];
	entry: Pick<WorkLogEntry, 'date' | 'start'>;
}): number {
	const key = `${entry.date} ${entry.start ?? '99:99'}`;
	const index = entries.findIndex((other) => `${other.date} ${other.start ?? '99:99'}` > key);
	return index === -1 ? entries.length : index;
}

/** Entries for a client within a period, in log order. */
export function entriesFor({
	entries,
	clientId,
	startDate,
	endDate
}: {
	entries: WorkLogEntry[];
	clientId?: string;
	startDate: string;
	endDate: string;
}): WorkLogEntry[] {
	return entries.filter(
		(entry) =>
			entry.date >= startDate &&
			entry.date <= endDate &&
			(clientId === undefined || entry.clientId === clientId)
	);
}

/** Found items not yet logged on their day, each once. */
export function unloggedItems<T extends { date: string; ref: WorkRef }>({
	entries,
	found
}: {
	entries: WorkLogEntry[];
	found: T[];
}): T[] {
	const logged = new Set(
		entries.flatMap((entry) => entry.items.map((item) => `${entry.date} ${refKey(item)}`))
	);
	return found.filter(({ date, ref }) => {
		const key = `${date} ${refKey(ref)}`;
		if (logged.has(key)) return false;
		logged.add(key);
		return true;
	});
}

/** The log as plain text, one line per item, each item once a day. Sent as the expense notes. */
export function workLogText({
	entries,
	organization
}: {
	entries: WorkLogEntry[];
	organization?: string;
}): string {
	const seen = new Set<string>();
	const lines: string[] = [];
	for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
		for (const ref of entry.items) {
			const key = `${entry.date} ${refKey(ref)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			lines.push([formatDMY(entry.date), ...refCells({ ref, organization })].join(' | '));
		}
	}
	return lines.length === 0 ? '' : [WORK_LOG_HEADER, ...lines].join('\n');
}

/* ---------------------------------- Rates ---------------------------------- */

/** The rate that applied on a date: the latest change on or before it, else the client's rate. */
export function rateOn(client: Pick<Client, 'rate' | 'rates'>, date: string): number {
	let rate = client.rate;
	let since = '';
	for (const change of client.rates ?? []) {
		if (change.from <= date && change.from >= since) {
			rate = change.rate;
			since = change.from;
		}
	}
	return rate;
}

/** Pay an hour for an entry: its own rate, else the client's rate on its date. */
export function entryRate({
	client,
	entry
}: {
	client: Pick<Client, 'rate' | 'rates'>;
	entry: Pick<WorkLogEntry, 'date' | 'rate'>;
}): number {
	return entry.rate ?? rateOn(client, entry.date);
}

/**
 * What a client's entries earn, each at its own rate. `rate` is that rate when they share one,
 * else the average, and `mixedRates` says which.
 */
export function earnings({
	client,
	entries
}: {
	client: Pick<Client, 'rate' | 'rates'>;
	entries: WorkLogEntry[];
}): { hours: number; amount: number; rate: number; mixedRates: boolean } {
	const paid = entries.filter((entry) => entryHours(entry) > 0);
	const rates = new Set(paid.map((entry) => entryRate({ client, entry })));
	const hours = totalHours(paid);
	const amount = round2(
		paid.reduce((sum, entry) => sum + entryHours(entry) * entryRate({ client, entry }), 0)
	);
	const rate = rates.size === 1 ? [...rates][0] : hours > 0 ? round2(amount / hours) : 0;
	return { hours, amount, rate, mixedRates: rates.size > 1 };
}

/**
 * The client with new rate changes, sorted. Its own rate stays the one for dates before the
 * first change, so adding a change never reprices earlier work.
 */
export function withRates({ client, rates }: { client: Client; rates: RateChange[] }): Client {
	const sorted = rates.toSorted((a, b) => a.from.localeCompare(b.from));
	return { ...client, rates: sorted.length > 0 ? sorted : undefined };
}

/**
 * The client with today's rate changed: the rate change that applies today, else, before any
 * change applies, the client's own rate.
 */
export function withCurrentRate({
	client,
	rate,
	today
}: {
	client: Client;
	rate: number;
	today: string;
}): Client {
	const current = (client.rates ?? []).findLast((change) => change.from <= today);
	if (!current) return { ...client, rate };
	return {
		...client,
		rates: client.rates?.map((change) => (change === current ? { ...change, rate } : change))
	};
}

/* ---------------------------------- Clients ---------------------------------- */

/** Open Collective clients used to always be invoiced twice a month, so they keep that. */
export function invoiceFrequency(
	client: Pick<Client, 'frequency' | 'openCollective'>
): InvoiceFrequency {
	return client.frequency ?? (client.openCollective ? 'twice-monthly' : 'monthly');
}

/** The clients you can log new work for and invoice. */
export function activeClients(clients: Client[]): Client[] {
	return clients.filter((client) => !client.archived);
}

/** The client a new invoice bills: the one invoiced through Open Collective, or the only one. */
export function defaultClient(clients: Client[]): Client | undefined {
	const active = activeClients(clients);
	return (
		active.find((client) => client.openCollective) ?? (active.length === 1 ? active[0] : undefined)
	);
}

/** The clients to choose from for an entry: the active ones, and the entry's own if archived. */
export function clientChoices({
	clients,
	clientId
}: {
	clients: Client[];
	clientId?: string;
}): Client[] {
	return clients.filter((client) => !client.archived || client.id === clientId);
}

/* ---------------------------------- Invoices ---------------------------------- */

/** The end of the latest period a client was sent an invoice for. Drafts are not sent yet. */
export function lastInvoicedEnd({
	invoices,
	clientId
}: {
	invoices: Invoice[];
	clientId: string;
}): string | undefined {
	let latest: string | undefined;
	for (const invoice of invoices) {
		if (invoice.clientId !== clientId || invoice.status === 'draft') continue;
		if (!latest || invoice.endDate > latest) latest = invoice.endDate;
	}
	return latest;
}

/** A first suggestion for an invoice's number, like ZENOS-2026-09 for September's. */
export function suggestedInvoiceNumber({
	client,
	startDate
}: {
	client: Pick<Client, 'name'>;
	startDate: string;
}): string {
	const prefix = client.name
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	return `${prefix || 'INVOICE'}-${startDate.slice(0, 7)}`;
}

/* ---------------------------------- Invoices by email ---------------------------------- */

export const DEFAULT_LINE_ITEM = 'Maintenance and development';
export const DEFAULT_EMAIL_SUBJECT = 'Invoice for {period}';
export const DEFAULT_EMAIL_MESSAGE =
	"Hi,\n\nI've attached the invoice for {period}.\n\nKind regards,";

/** "September 2026" for a whole month, else "16/10/2026 – 31/10/2026". */
export function periodLabel({
	startDate,
	endDate
}: Pick<Invoice, 'startDate' | 'endDate'>): string {
	const start = parseIsoDate(startDate);
	const wholeMonth =
		startDate.endsWith('-01') &&
		monthOf(startDate) === monthOf(endDate) &&
		addDays(endDate, 1).endsWith('-01');
	return wholeMonth
		? start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
		: `${formatDMY(startDate)} – ${formatDMY(endDate)}`;
}

export const DEFAULT_PAYMENT_DAYS = 14;

/** The invoice's date of issue and due date: when it was sent, or today for one not sent yet. */
export function invoiceDates({
	invoice,
	client,
	today
}: {
	invoice: Pick<Invoice, 'sentOn' | 'dueOn'>;
	client: Pick<Client, 'paymentDays'>;
	today: string;
}): { issuedOn: string; dueOn: string } {
	const issuedOn = invoice.sentOn ?? today;
	return {
		issuedOn,
		dueOn: invoice.dueOn ?? addDays(issuedOn, client.paymentDays ?? DEFAULT_PAYMENT_DAYS)
	};
}

/** Whether an address has the parts every e-invoice needs: a city and a two-letter country. */
export function addressComplete(address: Address | undefined): boolean {
	return !!address?.city.trim() && /^[A-Z]{2}$/.test(address.country.trim());
}

/** What the invoice still needs before it can be made, said as things to add. */
export function invoiceMissing({
	invoicing,
	client
}: {
	invoicing: Invoicing | undefined;
	client: Client;
}): string[] {
	return [
		...(invoicing?.name.trim() ? [] : ['your name']),
		...(addressComplete(invoicing?.address) ? [] : ['your city and country']),
		...(invoicing?.accountNumber.trim() ? [] : ['your bank account']),
		...(addressComplete(client.address) ? [] : [`${client.name}’s city and country`]),
		...(client.tax?.category === 'reverse-charge' && !client.vatId?.trim()
			? [`${client.name}’s VAT number`]
			: []),
		...(client.tax?.category === 'reverse-charge' && !invoicing?.vatId.trim()
			? ['your VAT number']
			: [])
	];
}

/** A subject or message with the invoice's `{period}` and `{number}` filled in. */
export function fillTemplate({
	template,
	invoice
}: {
	template: string;
	invoice: Pick<Invoice, 'startDate' | 'endDate' | 'number'>;
}): string {
	return template
		.replaceAll('{period}', periodLabel(invoice))
		.replaceAll('{number}', invoice.number ?? '');
}

/** A link that opens your mail app with the invoice's email written. The PDF is attached by hand. */
export function invoiceEmailHref({
	client,
	invoice
}: {
	client: Pick<Client, 'email' | 'emailSubject' | 'emailMessage'>;
	invoice: Pick<Invoice, 'startDate' | 'endDate' | 'number'>;
}): string {
	const subject = fillTemplate({ template: client.emailSubject || DEFAULT_EMAIL_SUBJECT, invoice });
	const body = fillTemplate({ template: client.emailMessage || DEFAULT_EMAIL_MESSAGE, invoice });
	const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	return `mailto:${encodeURIComponent(client.email?.trim() ?? '').replaceAll('%40', '@')}?${query}`;
}

/** "Zenos_Invoice_2026_09", the PDF's name. A second invoice in a month adds its first day. */
export function invoiceFileName({
	client,
	invoice
}: {
	client: Pick<Client, 'name'>;
	invoice: Pick<Invoice, 'startDate'>;
}): string {
	const name = client.name
		.trim()
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_|_$/g, '');
	const [year, month, day] = invoice.startDate.split('-');
	return [name || 'Invoice', 'Invoice', year, month, ...(day === '01' ? [] : [day])].join('_');
}

/**
 * The work log as the invoice lists it, like "02/09/2026 – web pull/8", each item once a day.
 * When everything is in one organization, its name is left out.
 */
export function invoiceLogLines(entries: WorkLogEntry[]): string[] {
	const owners = new Set(
		entries.flatMap((entry) =>
			entry.items.flatMap((ref) => (ref.kind === 'task' ? [] : [ref.owner.toLowerCase()]))
		)
	);
	const repository = (ref: Exclude<WorkRef, { kind: 'task' }>) =>
		owners.size === 1 ? ref.repo : `${ref.owner}/${ref.repo}`;
	const seen = new Set<string>();
	const lines: string[] = [];
	for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
		for (const ref of entry.items) {
			const key = `${entry.date} ${refKey(ref)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const item =
				ref.kind === 'task'
					? ref.text
					: ref.kind === 'advisory'
						? `${repository(ref)} advisory ${ref.id}`
						: `${repository(ref)} ${ref.kind === 'pr' ? 'pull' : 'issues'}/${ref.number}`;
			lines.push(`${formatDMY(entry.date)} – ${item}`);
		}
	}
	return lines;
}

/* ---------------------------------- Calendar ---------------------------------- */

/** "2026-10" → every date in October 2026. */
export function monthDates(month: string): string[] {
	const [year, monthIndex] = month.split('-').map(Number);
	const days = new Date(year, monthIndex, 0).getDate();
	return Array.from({ length: days }, (_, i) => toIsoDate(new Date(year, monthIndex - 1, i + 1)));
}

export function monthOf(date: string): string {
	return date.slice(0, 7);
}

export function addMonths(month: string, count: number): string {
	const [year, monthIndex] = month.split('-').map(Number);
	return toIsoDate(new Date(year, monthIndex - 1 + count, 1)).slice(0, 7);
}

export function isWeekday(date: string): boolean {
	const day = parseIsoDate(date).getDay();
	return day !== 0 && day !== 6;
}

export type DayKind = 'work' | 'weekend' | 'holiday' | 'leave';

export interface DaySummary {
	date: string;
	kind: DayKind;
	/** The holiday's or leave's name. */
	name?: string;
	expected: number;
	logged: number;
	/** Hours per client id. */
	byClient: Record<string, number>;
	cumulativeExpected: number;
	cumulativeLogged: number;
}

export interface ClientTotal {
	client: Client;
	hours: number;
	amount: number;
	/** Earned per hour: the one rate used, or the average when entries used several. */
	rate: number;
	mixedRates: boolean;
	/** The client's share of the month's expected hours, when it has one. */
	target?: number;
}

export interface MonthSummary {
	month: string;
	days: DaySummary[];
	weekdays: number;
	holidays: number;
	leave: number;
	workingDays: number;
	expected: number;
	logged: number;
	/** Expected by the end of `today`, or the whole month once it is over. */
	expectedSoFar: number;
	/** Logged minus expected so far: positive when ahead. */
	pace: number;
	/** Working days left, counting today. */
	workingDaysLeft: number;
	/** Hours still to log this month. */
	remaining: number;
	/** Hours a working day to finish the month on target. */
	neededPerDay: number;
	clients: ClientTotal[];
	/** Earnings per currency. */
	amounts: Record<string, number>;
}

export function summarizeMonth({
	data,
	month,
	today
}: {
	data: WorkLogData;
	month: string;
	today: string;
}): MonthSummary {
	const holidays = new Map(data.holidays.map((day) => [day.date, day.name]));
	const leave = new Map(data.leave.map((day) => [day.date, day.name]));
	const entries = data.entries.filter((entry) => monthOf(entry.date) === month);

	let cumulativeExpected = 0;
	let cumulativeLogged = 0;
	const days = monthDates(month).map((date): DaySummary => {
		const kind: DayKind = !isWeekday(date)
			? 'weekend'
			: holidays.has(date)
				? 'holiday'
				: leave.has(date)
					? 'leave'
					: 'work';
		const byClient: Record<string, number> = {};
		for (const entry of entries) {
			if (entry.date !== date) continue;
			byClient[entry.clientId] = round2((byClient[entry.clientId] ?? 0) + entryHours(entry));
		}
		const logged = round2(Object.values(byClient).reduce((sum, hours) => sum + hours, 0));
		const expected = kind === 'work' ? data.hoursPerDay : 0;
		cumulativeExpected += expected;
		cumulativeLogged = round2(cumulativeLogged + logged);
		return {
			date,
			kind,
			name: holidays.get(date) ?? leave.get(date),
			expected,
			logged,
			byClient,
			cumulativeExpected,
			cumulativeLogged
		};
	});

	const weekdays = days.filter((day) => day.kind !== 'weekend').length;
	const workingDays = days.filter((day) => day.kind === 'work').length;
	const expected = workingDays * data.hoursPerDay;
	const logged = days.at(-1)?.cumulativeLogged ?? 0;
	const past = days.filter((day) => day.date <= today);
	const expectedSoFar = past.at(-1)?.cumulativeExpected ?? 0;
	const workingDaysLeft = days.filter((day) => day.kind === 'work' && day.date >= today).length;
	const remaining = Math.max(0, round2(expected - logged));

	const clients = data.clients
		.map((client): ClientTotal => {
			const own = entries.filter((entry) => entry.clientId === client.id);
			const target =
				client.targetShare === undefined || client.archived
					? undefined
					: round2((expected * client.targetShare) / 100);
			return { client, ...earnings({ client, entries: own }), target };
		})
		.filter((total) => total.hours > 0 || total.target !== undefined);
	const amounts: Record<string, number> = {};
	for (const { client, amount } of clients) {
		amounts[client.currency] = round2((amounts[client.currency] ?? 0) + amount);
	}

	return {
		month,
		days,
		weekdays,
		holidays: days.filter((day) => day.kind === 'holiday').length,
		leave: days.filter((day) => day.kind === 'leave').length,
		workingDays,
		expected,
		logged,
		expectedSoFar,
		pace: round2(logged - expectedSoFar),
		workingDaysLeft,
		remaining,
		neededPerDay: workingDaysLeft > 0 ? round2(remaining / workingDaysLeft) : remaining,
		clients,
		amounts
	};
}

/** An amount in the exchange currency, when the work log has a rate for it. */
export function converted({
	data,
	amounts
}: {
	data: WorkLogData;
	amounts: Record<string, number>;
}): number | undefined {
	const exchange = data.exchange;
	if (!exchange) return undefined;
	let total = 0;
	for (const [currency, amount] of Object.entries(amounts)) {
		if (currency === exchange.to) total += amount;
		else if (currency === exchange.from) total += amount * exchange.rate;
		else return undefined;
	}
	return round2(total);
}

/* ---------------------------------- Holidays ---------------------------------- */

const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

function readDate(text: string): string | undefined {
	const value = text.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	const match = DMY.exec(value);
	if (!match) return undefined;
	const [, day, month, year] = match;
	return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function splitRow(line: string): string[] {
	const separator = line.includes('\t') ? '\t' : ',';
	const cells: string[] = [];
	let cell = '';
	let quoted = false;
	for (const char of line) {
		if (char === '"') quoted = !quoted;
		else if (char === separator && !quoted) {
			cells.push(cell);
			cell = '';
		} else cell += char;
	}
	cells.push(cell);
	return cells.map((value) => value.trim());
}

/**
 * Days off from CSV or rows pasted from a spreadsheet: a date (YYYY-MM-DD or DD/MM/YYYY) and a
 * name, in either order. A header row and blank lines are skipped.
 */
export function parseDaysOff(text: string): { days: DayOff[]; skipped: string[] } {
	const days: DayOff[] = [];
	const skipped: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const cells = splitRow(line);
		const dateIndex = cells.findIndex((cell) => readDate(cell));
		if (dateIndex === -1) {
			skipped.push(line);
			continue;
		}
		const name = cells.filter((_, index) => index !== dateIndex).find(Boolean) ?? '';
		days.push({ date: readDate(cells[dateIndex])!, name });
	}
	return { days, skipped };
}

/** Every weekday from `from` to `to`, both included. */
export function weekdaysBetween({ from, to }: { from: string; to: string }): string[] {
	const dates: string[] = [];
	const day = parseIsoDate(from <= to ? from : to);
	const last = from <= to ? to : from;
	while (toIsoDate(day) <= last) {
		const date = toIsoDate(day);
		if (isWeekday(date)) dates.push(date);
		day.setDate(day.getDate() + 1);
	}
	return dates;
}

export interface DayOffRange {
	from: string;
	to: string;
	name: string;
	dates: string[];
}

/**
 * Days off that follow each other with the same name, as one range. A weekend in between does
 * not break a range, so a Thursday to the next Tuesday is one stretch of leave.
 */
export function groupDaysOff(days: DayOff[]): DayOffRange[] {
	const ranges: DayOffRange[] = [];
	for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
		const last = ranges.at(-1);
		const next = last && weekdaysBetween({ from: last.to, to: day.date });
		// Joined when nothing but the weekend sits between the two days.
		if (last && last.name === day.name && next && next.length <= 2 && next[0] === last.to) {
			last.to = day.date;
			last.dates.push(day.date);
		} else {
			ranges.push({ from: day.date, to: day.date, name: day.name, dates: [day.date] });
		}
	}
	return ranges;
}

/** Add days off, replacing any on the same date, kept in date order. */
export function mergeDaysOff({ list, days }: { list: DayOff[]; days: DayOff[] }): number {
	let added = 0;
	for (const day of days) {
		const existing = list.findIndex((other) => other.date === day.date);
		if (existing !== -1) {
			list[existing] = day;
			continue;
		}
		const index = list.findIndex((other) => other.date > day.date);
		list.splice(index === -1 ? list.length : index, 0, day);
		added++;
	}
	return added;
}

/* ---------------------------------- Sync ---------------------------------- */

export function nowIso(): string {
	return new Date().toISOString();
}
