import * as v from 'valibot';
import {
	emptyWorkLog,
	insertionIndex,
	mergeDaysOff,
	nowIso,
	WorkLogSchema,
	type Client,
	type DayOff,
	type Tombstone,
	type WorkLogData,
	type WorkLogEntry
} from './worklog';
import { mergeWorkLogs, removedBy, sameWorkLog } from './worklog-merge';

/** Where this browser keeps the work log. */
export interface WorkLogBackend {
	load(): Promise<WorkLogData | undefined>;
	save(data: WorkLogData): Promise<void>;
	/** Calls back when another tab saves the log. Returns a cleanup function. */
	watch?(onChange: () => void): () => void;
}

/** Where earlier versions kept the log. Read once, to move it into IndexedDB. */
const LEGACY_STORAGE_KEY = 'invoicer:worklog';
const DB_NAME = 'open-work';
const DB_STORE = 'worklog';
const DB_KEY = 'log';
const CHANNEL = 'open-work:worklog';

export class WorkLogParseError extends Error {}

/** Read a backup or stored log, filling in fields added since it was written. */
export function parseWorkLog(json: string): WorkLogData {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		throw new WorkLogParseError('That file is not JSON.');
	}
	return validate(raw);
}

function validate(raw: unknown): WorkLogData {
	const result = v.safeParse(WorkLogSchema, raw);
	if (!result.success) {
		const issue = result.issues[0];
		const path = issue.path?.map((item) => item.key).join('.');
		throw new WorkLogParseError(
			`That is not a work log backup${path ? ` (${path}: ${issue.message})` : ''}.`
		);
	}
	return result.output;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

let database: Promise<IDBDatabase> | undefined;
let channel: BroadcastChannel | undefined;

/**
 * One channel for telling other tabs about saves and hearing theirs. A channel never receives its
 * own messages, so a tab does not reload its own save over edits made since.
 */
function tabs(): BroadcastChannel {
	channel ??= new BroadcastChannel(CHANNEL);
	return channel;
}

function openDatabase(): Promise<IDBDatabase> {
	database ??= new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
	return database;
}

/**
 * IndexedDB: no 5MB cap like localStorage, and reads and writes never block the page. The
 * whole log is one record; a year of work is a few hundred kilobytes.
 */
export const indexedDbBackend: WorkLogBackend = {
	async load() {
		const db = await openDatabase();
		const stored = await request(db.transaction(DB_STORE).objectStore(DB_STORE).get(DB_KEY));
		if (stored !== undefined) return validate(stored);

		// Move a log from an earlier version, which kept it in localStorage.
		let legacy: string | null = null;
		try {
			legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
		} catch {
			// Storage blocked: nothing to move.
		}
		if (!legacy) return undefined;
		const data = parseWorkLog(legacy);
		await this.save(data);
		localStorage.removeItem(LEGACY_STORAGE_KEY);
		return data;
	},
	async save(data) {
		const db = await openDatabase();
		const transaction = db.transaction(DB_STORE, 'readwrite');
		transaction.objectStore(DB_STORE).put(data, DB_KEY);
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () => reject(transaction.error);
		});
		tabs().postMessage('saved');
	},
	watch(onChange) {
		const channel = tabs();
		const listener = () => onChange();
		channel.addEventListener('message', listener);
		return () => channel.removeEventListener('message', listener);
	}
};

export interface WorkLogDefaults {
	rate: number;
	currency: string;
	/** The collective you invoice, from settings. */
	collective?: string;
}

/** Starts you off with the collective you invoice as a client, if settings name one. */
function starterLog({ rate, currency, collective }: WorkLogDefaults): WorkLogData {
	if (!collective) return emptyWorkLog();
	return {
		...emptyWorkLog(),
		clients: [
			{
				id: crypto.randomUUID(),
				name: collective,
				rate,
				currency,
				openCollective: true,
				updatedAt: nowIso()
			}
		]
	};
}

type DayOffKind = 'holidays' | 'leave';
const TOMBSTONE_KIND = { holidays: 'holiday', leave: 'leave' } as const;

/**
 * The work log, saved after every change. Mutate it only through these methods: each one
 * stamps what it changed, and deletions are remembered, so copies on other devices merge.
 */
export class WorkLogStore {
	data: WorkLogData = $state(emptyWorkLog());
	/** Set when the log could not be saved, for example because storage is full. */
	saveError = $state<string | undefined>();
	#backend: WorkLogBackend;
	#listeners: (() => void)[] = [];
	/** Saves in the order they were made, so an older one never lands after a newer one. */
	#writes: Promise<void> = Promise.resolve();

	constructor({ backend, data }: { backend: WorkLogBackend; data: WorkLogData }) {
		this.#backend = backend;
		this.data = data;
		// Another tab saved. Merge rather than replace, so an edit made here at the same moment
		// survives, and save the result if it differs, so that tab picks this one's edit up too.
		backend.watch?.(async () => {
			const latest = await backend.load().catch(() => undefined);
			if (!latest) return;
			const merged = mergeWorkLogs({ ours: $state.snapshot(this.data), theirs: latest });
			this.data = merged;
			if (!sameWorkLog(merged, latest)) this.#write();
		});
	}

	/** Calls back after every change you make, for example to sync it elsewhere. */
	onChange(listener: () => void): () => void {
		this.#listeners.push(listener);
		return () => {
			this.#listeners = this.#listeners.filter((other) => other !== listener);
		};
	}

	#save() {
		this.data.updatedAt = nowIso();
		this.#write();
		for (const listener of this.#listeners) listener();
	}

	/** Keep in this browser without counting as a change of yours. */
	#write() {
		const snapshot = $state.snapshot(this.data);
		this.#writes = this.#writes
			.then(() => this.#backend.save(snapshot))
			.then(
				() => (this.saveError = undefined),
				(error: unknown) => {
					this.saveError =
						error instanceof Error ? error.message : 'Could not save the work log in this browser.';
				}
			);
	}

	#bury(kind: Tombstone['kind'], id: string) {
		this.data.deleted.push({ kind, id, at: nowIso() });
	}

	client(id: string): Client | undefined {
		return this.data.clients.find((client) => client.id === id);
	}

	/* Entries */

	addEntry(entry: Omit<WorkLogEntry, 'id' | 'updatedAt'>): WorkLogEntry {
		const created = { ...entry, id: crypto.randomUUID(), updatedAt: nowIso() };
		this.data.entries.splice(
			insertionIndex({ entries: this.data.entries, entry: created }),
			0,
			created
		);
		this.#save();
		return created;
	}

	updateEntry(entry: WorkLogEntry) {
		const index = this.data.entries.findIndex((other) => other.id === entry.id);
		if (index === -1) return;
		const updated = { ...entry, updatedAt: nowIso() };
		this.data.entries.splice(index, 1);
		this.data.entries.splice(
			insertionIndex({ entries: this.data.entries, entry: updated }),
			0,
			updated
		);
		this.#save();
	}

	removeEntry(id: string) {
		const index = this.data.entries.findIndex((entry) => entry.id === id);
		if (index === -1) return;
		this.data.entries.splice(index, 1);
		this.#bury('entry', id);
		this.#save();
	}

	/** Add items to that day's untimed entry for the client, creating it if needed. */
	addItems({ date, clientId, items }: Pick<WorkLogEntry, 'date' | 'clientId' | 'items'>): void {
		const existing = this.data.entries.find(
			(other) => other.date === date && other.clientId === clientId && !other.start && !other.hours
		);
		if (existing) {
			existing.items.push(...items);
			existing.updatedAt = nowIso();
		} else {
			const entry = { id: crypto.randomUUID(), date, clientId, items, updatedAt: nowIso() };
			this.data.entries.splice(insertionIndex({ entries: this.data.entries, entry }), 0, entry);
		}
		this.#save();
	}

	/* Clients */

	addClient(client: Omit<Client, 'id' | 'updatedAt'>): Client {
		const created = { ...client, id: crypto.randomUUID(), updatedAt: nowIso() };
		this.data.clients.push(created);
		this.#save();
		return created;
	}

	updateClient(client: Client) {
		const index = this.data.clients.findIndex((other) => other.id === client.id);
		if (index === -1) return;
		this.data.clients[index] = { ...client, updatedAt: nowIso() };
		this.#save();
	}

	/** Only clients without logged time can go, so no entry loses its client. */
	removeClient(id: string): boolean {
		if (this.data.entries.some((entry) => entry.clientId === id)) return false;
		const index = this.data.clients.findIndex((client) => client.id === id);
		if (index !== -1) {
			this.data.clients.splice(index, 1);
			this.#bury('client', id);
		}
		this.#save();
		return true;
	}

	/* Schedule */

	setSchedule({ hoursPerDay, exchange }: Pick<WorkLogData, 'hoursPerDay' | 'exchange'>) {
		this.data.hoursPerDay = hoursPerDay;
		this.data.exchange = exchange;
		this.data.scheduleUpdatedAt = nowIso();
		this.#save();
	}

	#stampDays(days: DayOff[]): DayOff[] {
		const updatedAt = nowIso();
		return days.map((day) => ({ ...day, updatedAt }));
	}

	addDaysOff({ kind, days }: { kind: DayOffKind; days: DayOff[] }): number {
		const added = mergeDaysOff({ list: this.data[kind], days: this.#stampDays(days) });
		this.#save();
		return added;
	}

	updateDayOff({ kind, index, day }: { kind: DayOffKind; index: number; day: DayOff }) {
		const list = this.data[kind];
		const [previous] = list.splice(index, 1);
		if (previous && previous.date !== day.date) this.#bury(TOMBSTONE_KIND[kind], previous.date);
		mergeDaysOff({ list, days: this.#stampDays([day]) });
		this.#save();
	}

	removeDayOff({ kind, date }: { kind: DayOffKind; date: string }) {
		const index = this.data[kind].findIndex((day) => day.date === date);
		if (index === -1) return;
		this.data[kind].splice(index, 1);
		this.#bury(TOMBSTONE_KIND[kind], date);
		this.#save();
	}

	/** Swap a set of days for others in one save, like moving or deleting a stretch of leave. */
	replaceDaysOff({ kind, dates, days }: { kind: DayOffKind; dates: string[]; days: DayOff[] }) {
		const list = this.data[kind];
		const kept = days.map((day) => day.date);
		for (const date of dates) {
			const index = list.findIndex((day) => day.date === date);
			if (index !== -1) list.splice(index, 1);
			if (!kept.includes(date)) this.#bury(TOMBSTONE_KIND[kind], date);
		}
		mergeDaysOff({ list, days: this.#stampDays(days) });
		this.#save();
	}

	/* Backups and sync */

	exportJson(): string {
		return JSON.stringify($state.snapshot(this.data), null, '\t');
	}

	/** Take a copy merged with another device's, without counting it as a change of yours. */
	adopt(data: WorkLogData) {
		this.data = data;
		this.#write();
	}

	/**
	 * Replace everything with a backup. Throws `WorkLogParseError` for anything else. The backup
	 * counts as the newest change, so it also replaces what other devices have when they sync.
	 */
	importJson(json: string) {
		const backup = parseWorkLog(json);
		const at = nowIso();
		const stamp = <T extends object>(record: T): T => ({ ...record, updatedAt: at });
		const gone = removedBy({ current: $state.snapshot(this.data), next: backup, at });
		this.data = {
			...backup,
			entries: backup.entries.map(stamp),
			clients: backup.clients.map(stamp),
			holidays: backup.holidays.map(stamp),
			leave: backup.leave.map(stamp),
			scheduleUpdatedAt: at,
			deleted: [...backup.deleted, ...gone]
		};
		this.#save();
	}
}

let opening: Promise<WorkLogStore> | undefined;

/**
 * The one work log for this browser, opened on first use. Pages open it in their `load`, so
 * it is ready before anything renders and no edit can land before the saved log is read.
 */
export function openWorkLog(defaults: WorkLogDefaults): Promise<WorkLogStore> {
	opening ??= (async () => {
		// Ask the browser not to clear the log to free space.
		void navigator.storage?.persist?.();
		let data: WorkLogData | undefined;
		try {
			data = await indexedDbBackend.load();
		} catch (error) {
			console.error('Could not read the saved work log', error);
		}
		const store = new WorkLogStore({
			backend: indexedDbBackend,
			data: data ?? starterLog(defaults)
		});
		if (!data) store.adopt(store.data);
		return store;
	})();
	return opening;
}
