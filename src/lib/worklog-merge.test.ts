import { describe, expect, it } from 'vitest';
import { emptyWorkLog, type WorkLogData, type WorkLogEntry } from './worklog';
import { mergeWorkLogs, removedBy, sameWorkLog } from './worklog-merge';

const now = new Date('2026-10-18T12:00:00Z');
const at = (hour: number) => `2026-10-18T${String(hour).padStart(2, '0')}:00:00.000Z`;

function entry(id: string, updatedAt: string, partial: Partial<WorkLogEntry> = {}): WorkLogEntry {
	return { id, date: '2026-10-15', clientId: 'svelte', items: [], updatedAt, ...partial };
}

function log(partial: Partial<WorkLogData>): WorkLogData {
	return { ...emptyWorkLog(), ...partial };
}

describe('mergeWorkLogs', () => {
	it('keeps entries added on either device', () => {
		const merged = mergeWorkLogs({
			ours: log({ entries: [entry('laptop', at(9), { date: '2026-10-16' })] }),
			theirs: log({ entries: [entry('phone', at(10), { date: '2026-10-14' })] }),
			now
		});
		// In date order, whichever device added them.
		expect(merged.entries.map((e) => e.id)).toEqual(['phone', 'laptop']);
	});

	it('keeps the version of a record that changed last', () => {
		const merged = mergeWorkLogs({
			ours: log({ entries: [entry('a', at(9), { hours: 2 })] }),
			theirs: log({ entries: [entry('a', at(11), { hours: 3 })] }),
			now
		});
		expect(merged.entries).toEqual([entry('a', at(11), { hours: 3 })]);
	});

	it('lets a deletion win over older edits, but not newer ones', () => {
		const deleted = log({
			deleted: [
				{ kind: 'entry', id: 'old-edit', at: at(10) },
				{ kind: 'entry', id: 'new-edit', at: at(10) }
			]
		});
		const edited = log({
			entries: [entry('old-edit', at(9)), entry('new-edit', at(11))]
		});
		for (const [ours, theirs] of [
			[deleted, edited],
			[edited, deleted]
		]) {
			const merged = mergeWorkLogs({ ours, theirs, now });
			expect(merged.entries.map((e) => e.id)).toEqual(['new-edit']);
			expect(merged.deleted).toHaveLength(2);
		}
	});

	it('merges days off by date and the schedule by when it changed', () => {
		const merged = mergeWorkLogs({
			ours: log({
				holidays: [{ date: '2026-07-07', name: 'Heritage Day', updatedAt: at(9) }],
				hoursPerDay: 8,
				scheduleUpdatedAt: at(9)
			}),
			theirs: log({
				holidays: [
					{ date: '2026-07-07', name: 'George Town Heritage Day', updatedAt: at(10) },
					{ date: '2026-01-01', name: "New Year's Day", updatedAt: at(10) }
				],
				hoursPerDay: 7,
				exchange: { from: 'USD', to: 'MYR', rate: 4 },
				scheduleUpdatedAt: at(10)
			}),
			now
		});
		expect(merged.holidays.map((day) => day.name)).toEqual([
			"New Year's Day",
			'George Town Heritage Day'
		]);
		expect(merged.hoursPerDay).toBe(7);
		expect(merged.exchange).toEqual({ from: 'USD', to: 'MYR', rate: 4 });
	});

	it('gives the same result whichever copy is ours', () => {
		const a = log({
			entries: [entry('x', at(9), { hours: 1 }), entry('y', at(9))],
			clients: [{ id: 'svelte', name: 'svelte', rate: 40, currency: 'USD', openCollective: true }]
		});
		const b = log({
			// Same timestamp, different content: a tie both devices must break the same way.
			entries: [entry('x', at(9), { hours: 2 })],
			clients: [{ id: 'svelte', name: 'svelte', rate: 40, currency: 'USD', openCollective: true }]
		});
		const ab = mergeWorkLogs({ ours: a, theirs: b, now });
		const ba = mergeWorkLogs({ ours: b, theirs: a, now });
		expect(ab.entries).toEqual(ba.entries);
		expect(sameWorkLog(mergeWorkLogs({ ours: ab, theirs: ba, now }), ab)).toBe(true);
	});

	it('forgets deletions after six months', () => {
		const merged = mergeWorkLogs({
			ours: log({ deleted: [{ kind: 'client', id: 'gone', at: '2026-01-01T00:00:00.000Z' }] }),
			theirs: log({}),
			now
		});
		expect(merged.deleted).toEqual([]);
	});

	it('remembers what a restored backup no longer has', () => {
		const current = log({
			entries: [entry('kept', at(9)), entry('dropped', at(9))],
			leave: [{ date: '2026-07-20', name: '' }]
		});
		const backup = log({ entries: [entry('kept', at(8))] });
		expect(removedBy({ current, next: backup, at: at(12) })).toEqual([
			{ kind: 'entry', id: 'dropped', at: at(12) },
			{ kind: 'leave', id: '2026-07-20', at: at(12) }
		]);
	});
});
