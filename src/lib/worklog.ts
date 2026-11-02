/**
 * The work log: who you worked for, when, on what, and how that compares with the hours a
 * month expects. Pure helpers and the stored shape; storage lives in `worklog-store.svelte.ts`.
 */

import * as v from 'valibot';
import { addDays, formatDMY, parseIsoDate, toIsoDate } from './format';
import { SettingsSchema } from './settings';

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

/** When each field of a group of settings last changed, so devices merge them field by field. */
const FieldStamps = v.record(v.string(), v.string());

export type FieldStamps = v.InferOutput<typeof FieldStamps>;

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
	/** The client's Open Collective account, like "svelte", where its logo and colour can come from. */
	collective: v.optional(v.string()),
	/** A hex colour like "#ff5119". Unset takes the colour of the client's place in the list. */
	color: v.optional(v.pipe(v.string(), v.hexColor())),
	/** The client's website, like "zenos.com", where its logo and colour come from otherwise. */
	website: v.optional(v.string()),
	/** The client's logo: an Open Collective address, or an image from its website kept whole. */
	logo: v.optional(v.pipe(v.string(), v.url())),
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
	/** The email's subject and message, with the invoice filled in; see `fillTemplate`. */
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

/** A public holiday. */
export type DayOff = v.InferOutput<typeof DayOffSchema>;

const InvoiceStatusSchema = v.picklist(['draft', 'sent', 'paid']);

/** Where an invoice you send yourself is at: being written, sent, or paid. */
export type InvoiceStatus = v.InferOutput<typeof InvoiceStatusSchema>;

const AdjustmentSchema = v.object({
	/** Why, like "Hosting" or "Discount". */
	description: v.string(),
	/** Taken off the invoice, or added to it. */
	kind: v.picklist(['take-off', 'add']),
	amount: v.pipe(v.number(), v.minValue(0))
});

/** An amount added to or taken off an invoice, with its reason. */
export type Adjustment = v.InferOutput<typeof AdjustmentSchema>;

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
	adjustments: v.optional(v.array(AdjustmentSchema)),
	/** Credit from the client's earlier overpayments, used up on this invoice. */
	credit: v.optional(v.pipe(v.number(), v.minValue(0))),
	status: InvoiceStatusSchema,
	/** Also the invoice's date of issue. */
	sentOn: v.optional(IsoDate),
	/** Set when it is sent, from the client's payment days then. */
	dueOn: v.optional(IsoDate),
	paidOn: v.optional(IsoDate),
	/** What the client paid. More than was due leaves them credit for later invoices. */
	paidAmount: v.optional(v.pipe(v.number(), v.minValue(0)))
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
	phone: v.optional(v.string(), ''),
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

/** The address on one line without its country, as an Open Collective expense takes it. */
export function addressLine(address: Address): string {
	return [
		address.street,
		address.extra,
		[address.postcode, address.city].map((part) => part.trim()).join(' '),
		address.region
	]
		.map((part) => part.trim())
		.filter(Boolean)
		.join(', ');
}

/** Your notes, and your tax number unless the notes already give it. Said on every invoice. */
export function invoicingNotes(invoicing: Invoicing): string {
	const taxId = invoicing.taxId.trim();
	return [
		invoicing.notes.trim(),
		...(taxId && !invoicing.notes.includes(taxId) ? [`Income tax number: ${taxId}`] : [])
	]
		.filter(Boolean)
		.join('\n');
}

const BandSchema = v.object({
	/** The top of the band; unset for the last band, which has no top. */
	upTo: v.optional(v.pipe(v.number(), v.minValue(0))),
	/** Percent taken of the income within the band. */
	rate: v.pipe(v.number(), v.minValue(0), v.maxValue(100))
});

/** One band of a progressive scale, like an income tax's. */
export type Band = v.InferOutput<typeof BandSchema>;

const DeductionKindSchema = v.picklist(['percent', 'fixed', 'bands']);

/** A percentage of the income, a fixed amount, or a progressive scale of bands. */
export type DeductionKind = v.InferOutput<typeof DeductionKindSchema>;

const DeductionSchema = v.object({
	id: v.string(),
	updatedAt: UpdatedAt,
	name: v.string(),
	kind: DeductionKindSchema,
	/** Percent, for `percent`. */
	rate: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100))),
	/** Taken each month, for `fixed`. */
	amount: v.optional(v.pipe(v.number(), v.minValue(0))),
	/** In order, for `bands`. */
	bands: v.optional(v.array(BandSchema)),
	/** For `bands`: the scale is for a year's income, so a month pays a twelfth of a year's. */
	yearly: v.optional(v.boolean()),
	/** Worked out on gross pay, or on what the deductions before it leave. */
	base: v.optional(v.picklist(['gross', 'remaining']), 'gross'),
	/** Where it comes among the deductions, lowest first. */
	order: v.optional(v.number(), 0)
});

/**
 * Something taken from what you earn, in your home currency, like income tax, a pension
 * contribution or a tithe. Anyone can define their own.
 */
export type Deduction = v.InferOutput<typeof DeductionSchema>;

const AllowanceSchema = v.object({
	/** Days off a year. */
	days: v.pipe(v.number(), v.minValue(0)),
	/** Whether public holidays come out of the allowance too. */
	holidays: v.optional(v.boolean(), false)
});

/** How many days off a year you allow yourself. */
export type Allowance = v.InferOutput<typeof AllowanceSchema>;

const TombstoneSchema = v.object({
	// 'leave' is from when days of leave were recorded, kept so older logs still read.
	kind: v.picklist(['entry', 'client', 'holiday', 'leave', 'invoice', 'deduction']),
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
	/** When each of your invoice details last changed. Replaces `invoicingUpdatedAt`. */
	invoicingFieldsUpdatedAt: v.optional(FieldStamps),
	deductions: v.optional(v.array(DeductionSchema), []),
	allowance: v.optional(AllowanceSchema),
	/** When the days-off allowance last changed. */
	allowanceUpdatedAt: v.optional(v.string()),
	/** Whether a public holiday on a weekend gives the next working day off instead. */
	replaceHolidays: v.optional(v.boolean(), true),
	/** When `replaceHolidays` last changed. */
	replaceHolidaysUpdatedAt: v.optional(v.string()),
	/** Your settings, kept with the work log so they sync with it. */
	settings: v.optional(SettingsSchema),
	/** When each of your settings last changed. */
	settingsUpdatedAt: v.optional(FieldStamps),
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
		invoices: [],
		deductions: [],
		hoursPerDay: 8,
		replaceHolidays: true,
		deleted: []
	};
}

/* ---------------------------------- Items ---------------------------------- */

export const WORK_LOG_HEADER = 'Date | Work';

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

/** What was worked on, in a few words: "kit PR #17292", or a task as written. */
export function workLabel({ ref, organization }: { ref: WorkRef; organization?: string }): string {
	if (ref.kind === 'task') return ref.text;
	return refCells({ ref, organization }).join(' ');
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

/** Task names logged before, each once, the most recently logged first. */
export function taskNames(entries: WorkLogEntry[]): string[] {
	const latest = new Map<string, string>();
	for (const entry of entries) {
		for (const item of entry.items) {
			if (item.kind !== 'task') continue;
			const date = latest.get(item.text);
			if (!date || entry.date > date) latest.set(item.text, entry.date);
		}
	}
	return [...latest].sort(([, a], [, b]) => b.localeCompare(a)).map(([text]) => text);
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
			lines.push(`${formatDMY(entry.date)} | ${workLabel({ ref, organization })}`);
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

/** The rate of the client invoiced through Open Collective, or 0 when there is none. */
export function openCollectiveRate(clients: Client[]): number {
	return defaultClient(clients.filter((client) => client.openCollective))?.rate ?? 0;
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

/** What an invoice comes to, step by step, in whole cents so the parts always add up. */
export function invoiceTotals({
	invoice,
	client
}: {
	invoice: Pick<Invoice, 'amount' | 'adjustments' | 'credit'>;
	client: Pick<Client, 'tax'>;
}): {
	/** The hours at their rates. */
	lines: number;
	/** Taken off and added by the adjustments, each as a positive amount. */
	allowances: number;
	charges: number;
	/** What tax is worked out on. */
	net: number;
	tax: number;
	total: number;
	/** The credit used, never more than the total. */
	credit: number;
	due: number;
	rate: number;
	category: TaxCategory;
} {
	const cents = (amount: number) => Math.round(amount * 100);
	const category = client.tax?.category ?? 'outside-scope';
	const rate = category === 'standard' ? (client.tax?.rate ?? 0) : 0;
	const lines = cents(invoice.amount);
	let allowances = 0;
	let charges = 0;
	for (const { kind, amount } of invoice.adjustments ?? []) {
		if (kind === 'take-off') allowances += cents(amount);
		else charges += cents(amount);
	}
	const net = lines - allowances + charges;
	const tax = Math.round((net * rate) / 100);
	const total = net + tax;
	const credit = Math.min(cents(invoice.credit ?? 0), Math.max(0, total));
	return {
		lines: lines / 100,
		allowances: allowances / 100,
		charges: charges / 100,
		net: net / 100,
		tax: tax / 100,
		total: total / 100,
		credit: credit / 100,
		due: (total - credit) / 100,
		rate,
		category
	};
}

/**
 * The credit a client has left: what they overpaid on paid invoices, less what other invoices
 * have used. `exceptId` leaves out the invoice being written, so its own credit is not counted.
 */
export function availableCredit({
	invoices,
	client,
	exceptId
}: {
	invoices: Invoice[];
	client: Pick<Client, 'id' | 'tax'>;
	exceptId?: string;
}): number {
	let cents = 0;
	for (const invoice of invoices) {
		if (invoice.clientId !== client.id || invoice.id === exceptId) continue;
		if (invoice.status === 'paid' && invoice.paidAmount !== undefined) {
			const { due } = invoiceTotals({ invoice, client });
			cents += Math.max(0, Math.round(invoice.paidAmount * 100) - Math.round(due * 100));
		}
		cents -= Math.round((invoice.credit ?? 0) * 100);
	}
	return Math.max(0, cents) / 100;
}

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

/**
 * A subject or message with the invoice filled in: `{period}`, `{number}`, `{amount}` (what is
 * due, like $1,785.00 USD) and `{name}` (yours).
 */
export function fillTemplate({
	template,
	invoice,
	amount,
	name
}: {
	template: string;
	invoice: Pick<Invoice, 'startDate' | 'endDate' | 'number'>;
	amount: string;
	name: string;
}): string {
	return template
		.replaceAll('{period}', periodLabel(invoice))
		.replaceAll('{number}', invoice.number ?? '')
		.replaceAll('{amount}', amount)
		.replaceAll('{name}', name)
		.trim();
}

/** A link that opens your mail app with the invoice's email written. The PDF is attached by hand. */
export function invoiceEmailHref({
	client,
	invoice,
	invoicing
}: {
	client: Pick<Client, 'email' | 'emailSubject' | 'emailMessage' | 'tax' | 'currency'>;
	invoice: Pick<
		Invoice,
		'startDate' | 'endDate' | 'number' | 'amount' | 'adjustments' | 'credit' | 'currency'
	>;
	invoicing: Pick<Invoicing, 'name'> | undefined;
}): string {
	const { due } = invoiceTotals({ invoice, client });
	const values = {
		invoice,
		amount: `${new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(due)} ${invoice.currency}`,
		name: invoicing?.name.trim() ?? ''
	};
	const subject = fillTemplate({
		template: client.emailSubject || DEFAULT_EMAIL_SUBJECT,
		...values
	});
	const body = fillTemplate({ template: client.emailMessage || DEFAULT_EMAIL_MESSAGE, ...values });
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

/** One line of an invoice's work log: the day and what was worked on. */
export interface LogLine {
	/** Like 02/09/2026. */
	date: string;
	/** Like "web PR #8", or a task as written. */
	work: string;
}

/**
 * The work log as the invoice lists it, each item once a day. When everything is in one
 * organization, its name is left out.
 */
export function invoiceLogLines(entries: WorkLogEntry[]): LogLine[] {
	const owners = new Set(
		entries.flatMap((entry) =>
			entry.items.flatMap((ref) => (ref.kind === 'task' ? [] : [ref.owner.toLowerCase()]))
		)
	);
	const seen = new Set<string>();
	const lines: LogLine[] = [];
	for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
		for (const ref of entry.items) {
			const key = `${entry.date} ${refKey(ref)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const organization = owners.size === 1 ? [...owners][0] : undefined;
			lines.push({ date: formatDMY(entry.date), work: workLabel({ ref, organization }) });
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

export type DayKind = 'work' | 'weekend' | 'holiday';

export interface DaySummary {
	date: string;
	kind: DayKind;
	/** The holiday's name. */
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
	const holidays = observedHolidays(data).dates;
	const entries = data.entries.filter((entry) => monthOf(entry.date) === month);

	let cumulativeExpected = 0;
	let cumulativeLogged = 0;
	const days = monthDates(month).map((date): DaySummary => {
		const kind: DayKind = !isWeekday(date) ? 'weekend' : holidays.has(date) ? 'holiday' : 'work';
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
			name: holidays.get(date),
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

/**
 * Public holidays by the date they are taken off. With `replaceHolidays`, one on a weekend also
 * gives a weekday that is not already a holiday: the one before for a Saturday, as most employers in
 * Malaysia give the Friday, and the one after for a Sunday. `replacedOn` maps each such holiday to
 * that weekday.
 */
export function observedHolidays(data: Pick<WorkLogData, 'holidays' | 'replaceHolidays'>): {
	dates: Map<string, string>;
	replacedOn: Map<string, string>;
} {
	const sorted = [...data.holidays].sort((a, b) => a.date.localeCompare(b.date));
	const dates = new Map(
		sorted.filter((day) => isWeekday(day.date)).map((day) => [day.date, day.name])
	);
	const replacedOn = new Map<string, string>();
	if (!data.replaceHolidays) return { dates, replacedOn };
	for (const day of sorted) {
		if (isWeekday(day.date)) continue;
		const step = parseIsoDate(day.date).getDay() === 6 ? -1 : 1;
		let next = addDays(day.date, step);
		while (!isWeekday(next) || dates.has(next)) next = addDays(next, step);
		dates.set(next, day.name ? `${day.name} (replacement)` : 'Replacement holiday');
		replacedOn.set(day.date, next);
	}
	return { dates, replacedOn };
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

/* ---------------------------------- Take-home ---------------------------------- */

/** An amount in your home currency: the exchange's, else the one currency you are paid in. */
export function homeAmount({
	data,
	amounts
}: {
	data: WorkLogData;
	amounts: Record<string, number>;
}): { amount: number; currency: string } | undefined {
	if (data.exchange) {
		const amount = converted({ data, amounts });
		return amount === undefined ? undefined : { amount, currency: data.exchange.to };
	}
	const currencies = Object.keys(amounts);
	const currency = currencies[0] ?? activeClients(data.clients)[0]?.currency;
	if (currencies.length > 1 || !currency) return undefined;
	return { amount: round2(amounts[currency] ?? 0), currency };
}

/** What a progressive scale takes from `income`: each band's rate on the part within it. */
export function bandsTax({ income, bands }: { income: number; bands: Band[] }): number {
	const sorted = [...bands].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
	let tax = 0;
	let floor = 0;
	for (const band of sorted) {
		const top = band.upTo ?? Infinity;
		if (income > floor) tax += ((Math.min(income, top) - floor) * band.rate) / 100;
		floor = top;
	}
	return round2(tax);
}

/** Your deductions in the order they are taken. */
export function orderedDeductions(deductions: Deduction[]): Deduction[] {
	return [...deductions].sort((a, b) => a.order - b.order);
}

/** What each deduction takes from a month's gross pay, in order, and what is left. */
export function takeHome({ gross, deductions }: { gross: number; deductions: Deduction[] }): {
	lines: { deduction: Deduction; amount: number }[];
	net: number;
} {
	let left = gross;
	const lines = orderedDeductions(deductions).map((deduction) => {
		const base = deduction.base === 'remaining' ? left : gross;
		const raw =
			deduction.kind === 'percent'
				? (base * (deduction.rate ?? 0)) / 100
				: deduction.kind === 'fixed'
					? (deduction.amount ?? 0)
					: deduction.yearly
						? bandsTax({ income: base * 12, bands: deduction.bands ?? [] }) / 12
						: bandsTax({ income: base, bands: deduction.bands ?? [] });
		const amount = round2(Math.max(0, raw));
		left = round2(left - amount);
		return { deduction, amount };
	});
	return { lines, net: left };
}

/**
 * The month's earnings so far, and where they could end if the hours still expected are worked:
 * at each client's share of the hours (average), all at the lowest rate, or all at the highest.
 * In your home currency, or `undefined` when the clients' currencies cannot be added up.
 */
export function monthProjection({
	data,
	summary
}: {
	data: WorkLogData;
	summary: MonthSummary;
}): { earned: number; low: number; average: number; high: number; currency: string } | undefined {
	const earned = homeAmount({ data, amounts: summary.amounts });
	if (!earned) return undefined;
	const lastDay = monthDates(summary.month).at(-1)!;
	const clients = activeClients(data.clients).flatMap((client) => {
		const home = homeAmount({ data, amounts: { [client.currency]: rateOn(client, lastDay) } });
		return home && home.currency === earned.currency ? [{ client, rate: home.amount }] : [];
	});
	if (clients.length === 0)
		return {
			...earned,
			earned: earned.amount,
			low: earned.amount,
			average: earned.amount,
			high: earned.amount
		};
	const rates = clients.map(({ rate }) => rate);
	const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
	// Hours each client still has toward its share, then the rest at the clients' average rate.
	let assigned = 0;
	let byShare = 0;
	for (const { client, rate } of clients) {
		const total = summary.clients.find((other) => other.client.id === client.id);
		if (total?.target === undefined) continue;
		const left = Math.min(Math.max(0, total.target - total.hours), summary.remaining - assigned);
		assigned += left;
		byShare += left * rate;
	}
	const rest = Math.max(0, summary.remaining - assigned);
	return {
		currency: earned.currency,
		earned: earned.amount,
		low: round2(earned.amount + summary.remaining * Math.min(...rates)),
		average: round2(earned.amount + byShare + rest * mean),
		high: round2(earned.amount + summary.remaining * Math.max(...rates))
	};
}

/**
 * Your days off this year against your allowance: hours short of what you expected, as days at
 * your hours a day, from the month you first logged, and public holidays if you count them. Hours
 * over give days back. This month counts only up to today.
 */
export function daysOffBudget({
	data,
	year,
	today
}: {
	data: WorkLogData;
	year: number;
	today: string;
}):
	| {
			allowance: number;
			holidays: number;
			short: number;
			used: number;
			left: number;
	  }
	| undefined {
	const allowance = data.allowance;
	if (!allowance) return undefined;
	const prefix = String(year);
	const holidays = allowance.holidays
		? [...observedHolidays(data).dates.keys()].filter((date) => date.startsWith(prefix)).length
		: 0;
	const lastMonth = today.startsWith(prefix) ? Number(today.slice(5, 7)) : 12;
	const firstMonth = data.entries.reduce(
		(first, entry) => (monthOf(entry.date) < first ? monthOf(entry.date) : first),
		'9999-12'
	);
	let shortHours = 0;
	for (let index = 1; index <= lastMonth; index++) {
		const month = `${prefix}-${String(index).padStart(2, '0')}`;
		if (month < firstMonth) continue;
		const summary = summarizeMonth({ data, month, today });
		shortHours += summary.expectedSoFar - summary.logged;
	}
	const short = data.hoursPerDay > 0 ? Math.round((shortHours / data.hoursPerDay) * 10) / 10 : 0;
	const used = Math.round((holidays + short) * 10) / 10;
	return {
		allowance: allowance.days,
		holidays,
		short,
		used,
		left: Math.round((allowance.days - used) * 10) / 10
	};
}
