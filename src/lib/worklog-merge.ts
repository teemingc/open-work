/**
 * Merging two copies of the work log, such as this browser's and the one in Google Drive, so
 * edits made on different devices all survive. Each record keeps whichever version changed
 * last; a deletion wins over any edit made before it.
 */

import type { DayOff, Tombstone, WorkLogData, WorkLogEntry } from './worklog';

/** How long a deletion is remembered. A device offline for longer could bring a record back. */
const TOMBSTONE_DAYS = 180;

type Kind = Tombstone['kind'];

/**
 * The version that changed last. A tie, such as two copies of the same old record without
 * timestamps, is broken by content so every device picks the same one.
 */
function newer<T extends { updatedAt?: string }>(a: T, b: T): T {
	const left = a.updatedAt ?? '';
	const right = b.updatedAt ?? '';
	if (left !== right) return left > right ? a : b;
	return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

function mergeRecords<T extends { updatedAt?: string }>({
	ours,
	theirs,
	key,
	deletedAt
}: {
	ours: T[];
	theirs: T[];
	key: (record: T) => string;
	deletedAt: (key: string) => string | undefined;
}): T[] {
	// A Map keeps our order, with records only they have added after.
	const merged = new Map<string, T>();
	for (const record of ours) merged.set(key(record), record);
	for (const record of theirs) {
		const existing = merged.get(key(record));
		merged.set(key(record), existing ? newer(existing, record) : record);
	}
	return [...merged.values()].filter((record) => {
		const deleted = deletedAt(key(record));
		// Edited after it was deleted elsewhere: the edit wins and the record stays.
		return !deleted || (record.updatedAt ?? '') > deleted;
	});
}

function byDateAndStart(a: WorkLogEntry, b: WorkLogEntry): number {
	return `${a.date} ${a.start ?? '99:99'}`.localeCompare(`${b.date} ${b.start ?? '99:99'}`);
}

function byDate(a: DayOff, b: DayOff): number {
	return a.date.localeCompare(b.date);
}

/** Combine two copies of the log into one that has every change from both. */
export function mergeWorkLogs({
	ours,
	theirs,
	now = new Date()
}: {
	ours: WorkLogData;
	theirs: WorkLogData;
	now?: Date;
}): WorkLogData {
	const oldest = new Date(now.getTime() - TOMBSTONE_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const tombstones = new Map<string, Tombstone>();
	for (const tombstone of [...ours.deleted, ...theirs.deleted]) {
		if (tombstone.at < oldest) continue;
		const id = `${tombstone.kind}:${tombstone.id}`;
		const existing = tombstones.get(id);
		if (!existing || tombstone.at > existing.at) tombstones.set(id, tombstone);
	}
	const deletedAt = (kind: Kind) => (id: string) => tombstones.get(`${kind}:${id}`)?.at;

	const schedule =
		(theirs.scheduleUpdatedAt ?? '') > (ours.scheduleUpdatedAt ?? '') ? theirs : ours;

	return {
		version: 1,
		clients: mergeRecords({
			ours: ours.clients,
			theirs: theirs.clients,
			key: (client) => client.id,
			deletedAt: deletedAt('client')
		}),
		entries: mergeRecords({
			ours: ours.entries,
			theirs: theirs.entries,
			key: (entry) => entry.id,
			deletedAt: deletedAt('entry')
		}).sort(byDateAndStart),
		holidays: mergeRecords({
			ours: ours.holidays,
			theirs: theirs.holidays,
			key: (day) => day.date,
			deletedAt: deletedAt('holiday')
		}).sort(byDate),
		leave: mergeRecords({
			ours: ours.leave,
			theirs: theirs.leave,
			key: (day) => day.date,
			deletedAt: deletedAt('leave')
		}).sort(byDate),
		hoursPerDay: schedule.hoursPerDay,
		exchange: schedule.exchange,
		scheduleUpdatedAt: schedule.scheduleUpdatedAt,
		updatedAt: newer({ updatedAt: ours.updatedAt }, { updatedAt: theirs.updatedAt }).updatedAt,
		deleted: [...tombstones.values()]
	};
}

/** Whether two copies hold the same log, so syncing can skip a save or an upload. */
export function sameWorkLog(a: WorkLogData, b: WorkLogData): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** Tombstones for every record in `current` that `next` no longer has, as when restoring a backup. */
export function removedBy({
	current,
	next,
	at
}: {
	current: WorkLogData;
	next: WorkLogData;
	at: string;
}): Tombstone[] {
	const missing = <T>(
		kind: Kind,
		records: T[],
		others: T[],
		key: (record: T) => string
	): Tombstone[] => {
		const kept = new Set(others.map(key));
		return records
			.filter((record) => !kept.has(key(record)))
			.map((record) => ({ kind, id: key(record), at }));
	};
	return [
		...missing('entry', current.entries, next.entries, (entry) => entry.id),
		...missing('client', current.clients, next.clients, (client) => client.id),
		...missing('holiday', current.holidays, next.holidays, (day) => day.date),
		...missing('leave', current.leave, next.leave, (day) => day.date)
	];
}
