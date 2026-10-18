/**
 * The work log: who you worked for, when, on what, and how that compares with the hours a
 * month expects. Pure helpers and the stored shape; storage lives in `worklog-store.svelte.ts`.
 */

import * as v from 'valibot';
import { formatDMY, parseIsoDate, toIsoDate } from './format';

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
	openCollective: v.optional(v.boolean(), false)
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

const TombstoneSchema = v.object({
	kind: v.picklist(['entry', 'client', 'holiday', 'leave']),
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
	hoursPerDay: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(24)), 8),
	/** Shows totals in a second currency, like USD earnings in MYR. */
	exchange: v.optional(
		v.object({ from: Currency, to: Currency, rate: v.pipe(v.number(), v.minValue(0)) })
	),
	/** When the log last changed. */
	updatedAt: v.optional(v.string()),
	/** When the hours per day or the exchange rate last changed. */
	scheduleUpdatedAt: v.optional(v.string()),
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

/** The client with new rate changes, sorted, and its rate set to the one that applies today. */
export function withRates({
	client,
	rates,
	today
}: {
	client: Client;
	rates: RateChange[];
	today: string;
}): Client {
	const sorted = rates.toSorted((a, b) => a.from.localeCompare(b.from));
	const updated = { ...client, rates: sorted.length > 0 ? sorted : undefined };
	return { ...updated, rate: rateOn(updated, today) };
}

/** The client with today's rate changed, including the rate change that applies today. */
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
	return {
		...client,
		rate,
		rates: client.rates?.map((change) => (change === current ? { ...change, rate } : change))
	};
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
		.map((client) => {
			const own = entries.filter((entry) => entry.clientId === client.id && entryHours(entry) > 0);
			const rates = new Set(own.map((entry) => entryRate({ client, entry })));
			const hours = totalHours(own);
			const amount = round2(
				own.reduce((sum, entry) => sum + entryHours(entry) * entryRate({ client, entry }), 0)
			);
			const rate = rates.size === 1 ? [...rates][0] : hours > 0 ? round2(amount / hours) : 0;
			return { client, hours, amount, rate, mixedRates: rates.size > 1 };
		})
		.filter((total) => total.hours > 0);
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
