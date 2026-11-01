import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
	activeClients,
	addMonths,
	clientChoices,
	converted,
	describeRef,
	emptyWorkLog,
	entriesFor,
	entryHours,
	groupDaysOff,
	entryRate,
	insertionIndex,
	invoiceEmailHref,
	invoiceFileName,
	invoiceFrequency,
	invoiceLogLines,
	periodLabel,
	lastInvoicedEnd,
	suggestedInvoiceNumber,
	mergeDaysOff,
	parseDaysOff,
	parseRef,
	rateOn,
	refUrl,
	summarizeMonth,
	totalHours,
	WORK_LOG_HEADER,
	WorkLogSchema,
	unloggedItems,
	withCurrentRate,
	withRates,
	weekdaysBetween,
	workLogText,
	type Client,
	type DayOff,
	type WorkLogData,
	type WorkLogEntry,
	type WorkRef
} from './worklog';

const organization = 'sveltejs';

describe('parseRef', () => {
	it('reads owner/repo/pull/number as a pull request', () => {
		const ref = parseRef({ input: 'sveltejs/kit/pull/17363', organization });
		expect(ref).toEqual({ kind: 'pr', owner: 'sveltejs', repo: 'kit', number: 17363 });
		expect(describeRef(ref!)).toBe('Pull request #17363 in sveltejs/kit');
	});

	it('uses your organization when the owner is left out', () => {
		expect(parseRef({ input: 'kit/issues/15011', organization })).toEqual({
			kind: 'issue',
			owner: 'sveltejs',
			repo: 'kit',
			number: 15011
		});
	});

	it('accepts full GitHub URLs, with or without a trailing anchor', () => {
		expect(
			parseRef({ input: 'https://github.com/vitejs/vite/pull/22379#issuecomment-1', organization })
		).toEqual({ kind: 'pr', owner: 'vitejs', repo: 'vite', number: 22379 });
	});

	it('reads security advisories', () => {
		const ref = parseRef({
			input: 'sveltejs/kit/security/advisories/ghsa-rcwv-4xq7-qj3m',
			organization
		});
		expect(ref).toEqual({
			kind: 'advisory',
			owner: 'sveltejs',
			repo: 'kit',
			id: 'GHSA-RCWV-4XQ7-QJ3M'
		});
		expect(refUrl(ref!)).toBe(
			'https://github.com/sveltejs/kit/security/advisories/GHSA-RCWV-4XQ7-QJ3M'
		);
	});

	it('treats anything else as a task', () => {
		expect(parseRef({ input: ' Thu full-time maintainers meeting ', organization })).toEqual({
			kind: 'task',
			text: 'Thu full-time maintainers meeting'
		});
		// Without an organization, a path missing its owner cannot point at GitHub.
		expect(parseRef({ input: 'kit/pull/1' })).toEqual({ kind: 'task', text: 'kit/pull/1' });
	});

	it('rejects GitHub paths it cannot use, and empty input', () => {
		expect(parseRef({ input: 'kit/pull/abc', organization })).toBeUndefined();
		expect(parseRef({ input: '   ', organization })).toBeUndefined();
	});
});

describe('hours', () => {
	it('counts the time between start and end, past midnight too', () => {
		expect(entryHours({ start: '13:30', end: '14:00' })).toBe(0.5);
		expect(entryHours({ start: '22:00', end: '05:00' })).toBe(7);
		expect(entryHours({ hours: 1.5 })).toBe(1.5);
		expect(entryHours({ start: '10:00', end: '11:00', hours: 5 })).toBe(1);
		expect(entryHours({})).toBe(0);
	});

	it('adds up blocks', () => {
		expect(
			totalHours([{ start: '14:30', end: '17:30' }, {}, { start: '21:30', end: '22:00' }])
		).toBe(3.5);
	});
});

const pr = (number: number, owner = 'sveltejs'): WorkRef => ({
	kind: 'pr',
	owner,
	repo: 'kit',
	number
});

const svelte: Client = {
	id: 'svelte',
	name: 'svelte',
	rate: 40,
	currency: 'USD',
	openCollective: true
};
const zenos: Client = {
	id: 'zenos',
	name: 'zenos',
	rate: 42,
	currency: 'USD',
	openCollective: false
};

function entry(partial: Partial<WorkLogEntry> & Pick<WorkLogEntry, 'date'>): WorkLogEntry {
	return { id: crypto.randomUUID(), clientId: 'svelte', items: [], ...partial };
}

describe('notes', () => {
	it('lists each item once a day, dropping the owner inside your organization', () => {
		const entries = [
			entry({
				date: '2026-10-01',
				start: '22:00',
				end: '05:00',
				items: [pr(17292), pr(3, 'vitejs')]
			}),
			entry({ date: '2026-10-01', items: [pr(17292), { kind: 'task', text: 'Thu meeting' }] })
		];
		expect(workLogText({ entries, organization }).split('\n')).toEqual([
			WORK_LOG_HEADER,
			'01/10/2026 | kit | PR #17292',
			'01/10/2026 | vitejs/kit | PR #3',
			'01/10/2026 | — | Thu meeting'
		]);
		expect(workLogText({ entries: [], organization })).toBe('');
	});

	it('picks a client and period', () => {
		const entries = [
			entry({ date: '2026-10-15' }),
			entry({ date: '2026-10-16' }),
			entry({ date: '2026-10-02', clientId: 'zenos' })
		];
		expect(
			entriesFor({ entries, clientId: 'svelte', startDate: '2026-10-01', endDate: '2026-10-15' })
		).toEqual([entries[0]]);
	});

	it('skips found items already logged that day', () => {
		const entries = [entry({ date: '2026-10-01', items: [pr(1)] })];
		const found = [
			{ date: '2026-10-01', ref: pr(1) },
			{ date: '2026-10-02', ref: pr(1) },
			{ date: '2026-10-02', ref: pr(1) }
		];
		expect(unloggedItems({ entries, found })).toEqual([found[1]]);
	});

	it('keeps entries in date and start order', () => {
		const entries = [
			entry({ date: '2026-10-01', start: '09:00', end: '10:00' }),
			entry({ date: '2026-10-01' }),
			entry({ date: '2026-10-03' })
		];
		expect(insertionIndex({ entries, entry: { date: '2026-10-01', start: '12:00' } })).toBe(1);
		expect(insertionIndex({ entries, entry: { date: '2026-10-02' } })).toBe(2);
		expect(insertionIndex({ entries, entry: { date: '2026-11-01' } })).toBe(3);
	});
});

describe('month summary', () => {
	// October 2026 from the sheet: 22 weekdays, no holidays, 8 hours a day.
	const data: WorkLogData = {
		...emptyWorkLog(),
		clients: [svelte, zenos],
		exchange: { from: 'USD', to: 'MYR', rate: 4 },
		entries: [
			entry({ date: '2026-10-01', start: '22:00', end: '05:00' }),
			entry({ date: '2026-10-08', clientId: 'zenos', start: '09:30', end: '11:30' }),
			entry({ date: '2026-10-12', hours: 3 })
		]
	};

	it('counts working days and the hours they expect', () => {
		const month = summarizeMonth({ data, month: '2026-10', today: '2026-10-12' });
		expect(month.weekdays).toBe(22);
		expect(month.workingDays).toBe(22);
		expect(month.expected).toBe(176);
		expect(month.logged).toBe(12);
		// 1st–12th holds 8 weekdays
		expect(month.expectedSoFar).toBe(64);
		expect(month.pace).toBe(-52);
		// 12th–30th, today included
		expect(month.workingDaysLeft).toBe(15);
		expect(month.remaining).toBe(164);
		expect(month.neededPerDay).toBe(10.93);
	});

	it('takes holidays and leave off the working days', () => {
		const month = summarizeMonth({
			data: {
				...data,
				holidays: [
					{ date: '2026-10-02', name: 'Holiday' },
					{ date: '2026-10-04', name: 'On a Sunday' }
				],
				leave: [{ date: '2026-10-05', name: '' }]
			},
			month: '2026-10',
			today: '2026-10-31'
		});
		expect(month.holidays).toBe(1);
		expect(month.leave).toBe(1);
		expect(month.workingDays).toBe(20);
		expect(month.days[1]).toMatchObject({ kind: 'holiday', name: 'Holiday', expected: 0 });
		expect(month.days[3].kind).toBe('weekend');
	});

	it('totals each client and converts the earnings', () => {
		const month = summarizeMonth({ data, month: '2026-10', today: '2026-10-31' });
		expect(month.clients.map(({ client, hours, amount }) => [client.id, hours, amount])).toEqual([
			['svelte', 10, 400],
			['zenos', 2, 84]
		]);
		expect(month.amounts).toEqual({ USD: 484 });
		expect(converted({ data, amounts: month.amounts })).toBe(1936);
		expect(month.days[0].byClient).toEqual({ svelte: 7 });
	});
});

describe('clients', () => {
	it('invoices Open Collective clients twice a month unless told otherwise', () => {
		expect(invoiceFrequency(svelte)).toBe('twice-monthly');
		expect(invoiceFrequency(zenos)).toBe('monthly');
		expect(invoiceFrequency({ ...svelte, frequency: 'monthly' })).toBe('monthly');
	});

	it('offers archived clients only for entries already theirs', () => {
		const old: Client = { ...zenos, archived: true };
		expect(activeClients([svelte, old])).toEqual([svelte]);
		expect(clientChoices({ clients: [svelte, old] })).toEqual([svelte]);
		expect(clientChoices({ clients: [svelte, old], clientId: 'zenos' })).toEqual([svelte, old]);
	});

	it('gives each client its share of the expected hours', () => {
		const data: WorkLogData = {
			...emptyWorkLog(),
			clients: [
				{ ...svelte, targetShare: 50 },
				{ ...zenos, targetShare: 50 },
				{
					id: 'old',
					name: 'old',
					rate: 10,
					currency: 'USD',
					openCollective: false,
					targetShare: 20,
					archived: true
				}
			],
			entries: [entry({ date: '2026-10-01', hours: 7 })]
		};
		const month = summarizeMonth({ data, month: '2026-10', today: '2026-10-12' });
		expect(month.clients.map(({ client, hours, target }) => [client.id, hours, target])).toEqual([
			['svelte', 7, 88],
			['zenos', 0, 88]
		]);
	});
});

describe('invoices', () => {
	const sent = {
		id: 'sep',
		clientId: 'zenos',
		startDate: '2026-09-01',
		endDate: '2026-09-30',
		hours: 42.5,
		rate: 42,
		amount: 1785,
		currency: 'USD',
		status: 'sent'
	} as const;

	it('continues from the last invoice sent, not a draft', () => {
		const invoices = [
			sent,
			{
				...sent,
				id: 'oct',
				startDate: '2026-10-01',
				endDate: '2026-10-31',
				status: 'draft' as const
			},
			{ ...sent, id: 'svelte', clientId: 'svelte', endDate: '2026-10-15' }
		];
		expect(lastInvoicedEnd({ invoices, clientId: 'zenos' })).toBe('2026-09-30');
		expect(lastInvoicedEnd({ invoices, clientId: 'other' })).toBeUndefined();
	});

	it('suggests a number from the client and month', () => {
		expect(suggestedInvoiceNumber({ client: zenos, startDate: '2026-09-02' })).toBe(
			'ZENOS-2026-09'
		);
		expect(suggestedInvoiceNumber({ client: { name: 'Acme Co.' }, startDate: '2026-10-01' })).toBe(
			'ACME-CO-2026-10'
		);
	});

	it('reads logs from before invoices were kept', () => {
		const old: Partial<WorkLogData> = emptyWorkLog();
		delete old.invoices;
		expect(v.parse(WorkLogSchema, old).invoices).toEqual([]);
	});
});

describe('invoices by email', () => {
	it('names a whole month, and spells out any other period', () => {
		expect(periodLabel({ startDate: '2026-09-01', endDate: '2026-09-30' })).toBe('September 2026');
		expect(periodLabel({ startDate: '2026-09-02', endDate: '2026-09-30' })).toBe(
			'02/09/2026 – 30/09/2026'
		);
		expect(periodLabel({ startDate: '2026-10-16', endDate: '2026-10-31' })).toBe(
			'16/10/2026 – 31/10/2026'
		);
	});

	it('writes the email from the client’s templates, or the usual ones', () => {
		const invoice = { startDate: '2026-09-01', endDate: '2026-09-30', number: 'ZENOS-2026-09' };
		const href = invoiceEmailHref({
			client: { email: 'zenos@ap.ramp.com', emailMessage: 'Hi Ben,\n\nHere is {number}.' },
			invoice
		});
		const url = new URL(href);
		expect(url.protocol).toBe('mailto:');
		expect(url.pathname).toBe('zenos@ap.ramp.com');
		expect(url.searchParams.get('subject')).toBe('Invoice for September 2026');
		expect(url.searchParams.get('body')).toBe('Hi Ben,\n\nHere is ZENOS-2026-09.');
	});

	it('names the PDF after the client and month', () => {
		expect(invoiceFileName({ client: zenos, invoice: { startDate: '2026-09-01' } })).toBe(
			'zenos_Invoice_2026_09'
		);
		expect(
			invoiceFileName({ client: { name: 'Acme Inc.' }, invoice: { startDate: '2026-10-16' } })
		).toBe('Acme_Inc_Invoice_2026_10_16');
	});

	it('lists each item once a day, leaving out a shared organization', () => {
		const pr = (repo: string, number: number): WorkRef => ({
			kind: 'pr',
			owner: 'zenoscorp',
			repo,
			number
		});
		const entries = [
			entry({
				date: '2026-09-11',
				items: [{ kind: 'task', text: 'Set up simulation' }, pr('zenos_ws', 637)]
			}),
			entry({ date: '2026-09-02', items: [pr('web', 8)] }),
			entry({ date: '2026-09-11', items: [pr('zenos_ws', 637)] })
		];
		expect(invoiceLogLines(entries)).toEqual([
			'02/09/2026 – web pull/8',
			'11/09/2026 – Set up simulation',
			'11/09/2026 – zenos_ws pull/637'
		]);
		expect(
			invoiceLogLines([
				...entries,
				entry({
					date: '2026-09-12',
					items: [{ kind: 'issue', owner: 'sveltejs', repo: 'kit', number: 1 }]
				})
			]).at(-1)
		).toBe('12/09/2026 – sveltejs/kit issues/1');
	});
});

describe('rates', () => {
	// The sheet billed svelte at 23 USD/h in January 2026 and 40 from February.
	const history: Client = {
		...svelte,
		rates: [
			{ from: '2026-02-01', rate: 40 },
			{ from: '2026-01-01', rate: 23 }
		]
	};

	it('uses the latest change on or before the date', () => {
		expect(rateOn(history, '2026-01-01')).toBe(23);
		expect(rateOn(history, '2026-01-31')).toBe(23);
		expect(rateOn(history, '2026-02-01')).toBe(40);
		expect(rateOn(history, '2026-10-16')).toBe(40);
	});

	it('falls back to the client rate before the first change or without changes', () => {
		expect(rateOn(history, '2025-12-31')).toBe(40);
		expect(rateOn(svelte, '2026-01-15')).toBe(40);
		expect(rateOn({ ...svelte, rates: [] }, '2026-01-15')).toBe(40);
	});

	it('earns January 2026 at 23 an hour', () => {
		const month = summarizeMonth({
			data: {
				...emptyWorkLog(),
				clients: [history, zenos],
				entries: [
					entry({ date: '2026-01-05', hours: 6 }),
					entry({ date: '2026-01-06', start: '09:00', end: '13:30' }),
					entry({ date: '2026-01-07', clientId: 'zenos', hours: 2 })
				]
			},
			month: '2026-01',
			today: '2026-10-16'
		});
		expect(month.clients.map(({ client, hours, amount }) => [client.id, hours, amount])).toEqual([
			['svelte', 10.5, 241.5],
			['zenos', 2, 84]
		]);
		expect(month.amounts).toEqual({ USD: 325.5 });
	});

	it('splits a month that spans a rate change', () => {
		const client: Client = { ...svelte, rates: [{ from: '2026-03-16', rate: 50 }] };
		const month = summarizeMonth({
			data: {
				...emptyWorkLog(),
				clients: [client],
				entries: [
					entry({ date: '2026-03-13', hours: 3 }),
					entry({ date: '2026-03-16', hours: 2 }),
					entry({ date: '2026-03-17', hours: 1.5 })
				]
			},
			month: '2026-03',
			today: '2026-10-16'
		});
		// 3 h at 40, then 3.5 h at 50
		expect(month.clients[0]).toMatchObject({ hours: 6.5, amount: 295 });
	});

	it('lets an entry set its own rate', () => {
		expect(entryRate({ client: history, entry: { date: '2026-01-05' } })).toBe(23);
		expect(entryRate({ client: history, entry: { date: '2026-01-05', rate: 30 } })).toBe(30);
		expect(entryRate({ client: history, entry: { date: '2026-01-05', rate: 0 } })).toBe(0);
	});

	it('earns each entry at its own rate and averages mixed rates', () => {
		const month = summarizeMonth({
			data: {
				...emptyWorkLog(),
				clients: [history],
				entries: [
					entry({ date: '2026-01-05', hours: 2 }),
					entry({ date: '2026-01-06', hours: 2, rate: 50 }),
					entry({ date: '2026-01-07', items: [pr(1)] })
				]
			},
			month: '2026-01',
			today: '2026-10-16'
		});
		// 2 h at 23 and 2 h at 50
		expect(month.clients[0]).toMatchObject({ hours: 4, amount: 146, rate: 36.5, mixedRates: true });
	});

	it('reports the one rate when every entry used it', () => {
		const month = summarizeMonth({
			data: {
				...emptyWorkLog(),
				clients: [history],
				entries: [entry({ date: '2026-01-05', hours: 3 })]
			},
			month: '2026-01',
			today: '2026-10-16'
		});
		expect(month.clients[0]).toMatchObject({ rate: 23, mixedRates: false });
	});

	it('reads logs saved before rates existed', () => {
		const old = {
			version: 1,
			clients: [{ id: 'svelte', name: 'svelte', rate: 40, currency: 'USD' }],
			entries: [{ id: '1', date: '2026-01-05', clientId: 'svelte', hours: 2, items: [] }],
			holidays: [],
			leave: []
		};
		const parsed = v.parse(WorkLogSchema, old);
		expect(parsed.clients[0].rates).toBeUndefined();
		expect(parsed.entries[0].rate).toBeUndefined();
		expect(() =>
			v.parse(WorkLogSchema, { ...old, entries: [{ ...old.entries[0], rate: -1 }] })
		).toThrow();
	});

	it('sorts changes', () => {
		const updated = withRates({
			client: svelte,
			rates: [
				{ from: '2026-11-01', rate: 45 },
				{ from: '2026-01-01', rate: 23 }
			]
		});
		expect(updated.rates?.map((change) => change.from)).toEqual(['2026-01-01', '2026-11-01']);
		expect(withRates({ client: history, rates: [] }).rates).toBeUndefined();
	});

	it('keeps earlier work at the old rate when the first change is added', () => {
		const updated = withRates({ client: svelte, rates: [{ from: '2026-10-16', rate: 60 }] });
		expect(updated.rate).toBe(svelte.rate);
		expect(rateOn(updated, '2026-10-15')).toBe(svelte.rate);
		expect(rateOn(updated, '2026-10-16')).toBe(60);
	});

	it('changes the rate that applies today', () => {
		const sorted = withRates({ client: history, rates: history.rates! });
		const updated = withCurrentRate({ client: sorted, rate: 42, today: '2026-10-16' });
		expect(updated.rate).toBe(history.rate);
		expect(updated.rates).toEqual([
			{ from: '2026-01-01', rate: 23 },
			{ from: '2026-02-01', rate: 42 }
		]);
		expect(withCurrentRate({ client: svelte, rate: 41, today: '2026-10-16' })).toEqual({
			...svelte,
			rate: 41,
			rates: undefined
		});
	});
});

describe('days off', () => {
	it('reads CSV and pasted rows with either date format', () => {
		const { days, skipped } = parseDaysOff(
			[
				'date,name',
				'2026-01-01,New Year’s Day',
				'"Thaipusam, observed",02/02/2026',
				'7/7/2026\tGeorge Town World Heritage City Day',
				'',
				'not a date,really'
			].join('\n')
		);
		expect(days).toEqual([
			{ date: '2026-01-01', name: 'New Year’s Day' },
			{ date: '2026-02-02', name: 'Thaipusam, observed' },
			{ date: '2026-07-07', name: 'George Town World Heritage City Day' }
		]);
		expect(skipped).toEqual(['date,name', 'not a date,really']);
	});

	it('merges in date order, replacing the same date', () => {
		const list: DayOff[] = [{ date: '2026-03-01', name: 'a' }];
		expect(
			mergeDaysOff({
				list,
				days: [
					{ date: '2026-01-01', name: 'b' },
					{ date: '2026-03-01', name: 'c' }
				]
			})
		).toBe(1);
		expect(list).toEqual([
			{ date: '2026-01-01', name: 'b' },
			{ date: '2026-03-01', name: 'c' }
		]);
	});

	it('lists the weekdays in a range of leave', () => {
		// Thursday 23 July to Tuesday 28 July 2026
		expect(weekdaysBetween({ from: '2026-07-23', to: '2026-07-28' })).toEqual([
			'2026-07-23',
			'2026-07-24',
			'2026-07-27',
			'2026-07-28'
		]);
		expect(weekdaysBetween({ from: '2026-07-28', to: '2026-07-27' })).toEqual([
			'2026-07-27',
			'2026-07-28'
		]);
	});

	it('shows days off that follow each other as one range, across a weekend', () => {
		const day = (date: string, name = 'Trip'): DayOff => ({ date, name });
		expect(
			groupDaysOff([
				day('2026-07-27'),
				day('2026-07-23'),
				day('2026-07-24'),
				day('2026-07-28'),
				day('2026-07-30'),
				day('2026-07-31', 'Other')
			]).map(({ from, to, dates }) => [from, to, dates.length])
		).toEqual([
			['2026-07-23', '2026-07-28', 4],
			['2026-07-30', '2026-07-30', 1],
			['2026-07-31', '2026-07-31', 1]
		]);
	});

	it('moves to the next month', () => {
		expect(addMonths('2026-12', 1)).toBe('2027-01');
		expect(addMonths('2026-01', -1)).toBe('2025-12');
	});
});
