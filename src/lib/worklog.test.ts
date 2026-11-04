import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
	activeClients,
	bandsTax,
	daysOffBudget,
	monthProjection,
	takeHome,
	yearTakeHome,
	type Deduction,
	addMonths,
	dropDays,
	clientChoices,
	converted,
	describeRef,
	emptyWorkLog,
	entriesFor,
	entryHours,
	latestEnd,
	entryRate,
	insertionIndex,
	inDayOrder,
	startsPastMidnight,
	availableCredit,
	invoiceEmailHref,
	invoiceTotals,
	invoiceFileName,
	invoiceFrequency,
	invoiceLogLines,
	periodLabel,
	lastInvoicedEnd,
	suggestedInvoiceNumber,
	mergeDaysOff,
	observedHolidays,
	parseDaysOff,
	parseRef,
	rateOn,
	refUrl,
	summarizeMonth,
	summarizeYear,
	taskNames,
	totalHours,
	WORK_LOG_HEADER,
	WorkLogSchema,
	unloggedItems,
	withCurrentRate,
	withRates,
	workLogText,
	type Client,
	type DayOff,
	type Invoice,
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

	it('finds the latest end on a day', () => {
		const entries = [
			{ date: '2026-11-04', start: '09:00', end: '12:30' },
			{ date: '2026-11-04', start: '13:00', end: '15:00' },
			{ date: '2026-11-04', hours: 2 },
			{ date: '2026-11-04', start: '23:00', end: '01:00' },
			{ date: '2026-11-05', start: '16:00', end: '18:00' }
		];
		expect(latestEnd({ entries, date: '2026-11-04' })).toBe('15:00');
		expect(latestEnd({ entries, date: '2026-11-03' })).toBeUndefined();
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
			'01/10/2026 | kit PR #17292',
			'01/10/2026 | vitejs/kit PR #3',
			'01/10/2026 | Thu meeting'
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

	it('suggests each logged task once, the most recent first', () => {
		const task = (text: string): WorkRef => ({ kind: 'task', text });
		const entries = [
			entry({ date: '2026-10-05', items: [task('Mon full-time maintainers meeting'), pr(1)] }),
			entry({ date: '2026-10-07', items: [task('Triage')] }),
			entry({ date: '2026-10-12', items: [task('Mon full-time maintainers meeting')] })
		];
		expect(taskNames(entries)).toEqual(['Mon full-time maintainers meeting', 'Triage']);
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

	it('ends a day with the entries marked after midnight, and dates them the day after', () => {
		const day = inDayOrder([
			{ start: '03:00', end: '04:00', afterMidnight: true },
			{ start: '00:00', end: '00:30', afterMidnight: true },
			{ start: '01:00', end: '02:00', afterMidnight: true }
		]);
		expect(day.map((entry) => entry.start)).toEqual(['00:00', '01:00', '03:00']);
		expect(day.every((entry) => startsPastMidnight({ day, entry }))).toBe(true);
		const evening = inDayOrder([
			{ start: '00:30', end: '01:00', afterMidnight: true },
			{ start: '21:00', end: '23:00' }
		]);
		expect(evening.map((entry) => entry.start)).toEqual(['21:00', '00:30']);
	});

	it('tells which entries of a day started after midnight', () => {
		const day = inDayOrder([
			{ start: '01:00', end: '02:00' },
			{ start: '23:00', end: '00:30' },
			{ start: '12:00', end: '14:00' },
			{}
		]);
		expect(day.map((entry) => startsPastMidnight({ day, entry }))).toEqual([
			false,
			false,
			true,
			false
		]);
		const morning = inDayOrder([{ start: '09:00', end: '12:00' }]);
		expect(startsPastMidnight({ day: morning, entry: morning[0] })).toBe(false);
	});

	it('orders a day from waking, with work past midnight at the end', () => {
		const order = (entries: Pick<WorkLogEntry, 'start' | 'end' | 'hours'>[]) =>
			inDayOrder(entries).map((entry) => entry.start ?? '-');
		expect(
			order([
				{ start: '01:00', end: '02:00' },
				{ start: '20:00', end: '22:00' },
				{},
				{ start: '12:00', end: '14:00' }
			])
		).toEqual(['12:00', '20:00', '01:00', '-']);
		// Working past 09:00, so no fixed hour can split the day.
		expect(
			order([
				{ start: '07:00', end: '10:00' },
				{ start: '19:00', end: '21:00' },
				{ start: '23:00', end: '02:00' }
			])
		).toEqual(['19:00', '23:00', '07:00']);
		expect(
			order([
				{ start: '13:00', end: '15:00' },
				{ start: '09:00', end: '12:00' }
			])
		).toEqual(['09:00', '13:00']);
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

	it('takes holidays off the working days', () => {
		const month = summarizeMonth({
			data: {
				...data,
				holidays: [
					{ date: '2026-10-02', name: 'Holiday' },
					{ date: '2026-10-04', name: 'On a Sunday' }
				],
				replaceHolidays: false
			},
			month: '2026-10',
			today: '2026-10-31'
		});
		expect(month.holidays).toBe(1);
		expect(month.workingDays).toBe(21);
		expect(month.days[1]).toMatchObject({ kind: 'holiday', name: 'Holiday', expected: 0 });
		expect(month.days[3].kind).toBe('weekend');
	});

	it('takes the Friday before a Saturday holiday off, and the Monday after a Sunday one', () => {
		const holidays = [
			{ date: '2026-10-02', name: 'Friday' },
			{ date: '2026-10-03', name: 'Saturday' },
			{ date: '2026-10-05', name: 'Monday' },
			{ date: '2026-10-04', name: 'Sunday' }
		];
		expect(observedHolidays({ holidays, replaceHolidays: true }).replacedOn).toEqual(
			new Map([
				// Friday the 2nd is a holiday already, and so is Monday the 5th.
				['2026-10-03', '2026-10-01'],
				['2026-10-04', '2026-10-06']
			])
		);
		const month = summarizeMonth({
			data: { ...data, holidays },
			month: '2026-10',
			today: '2026-10-31'
		});
		expect(month.holidays).toBe(4);
		expect(month.workingDays).toBe(18);
		expect(month.days[0]).toMatchObject({ kind: 'holiday', name: 'Saturday (replacement)' });
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

describe('credits and adjustments', () => {
	const billed = (partial: Partial<Invoice>): Invoice => ({
		id: crypto.randomUUID(),
		clientId: 'zenos',
		startDate: '2026-05-01',
		endDate: '2026-05-31',
		hours: 10,
		rate: 42,
		amount: 420,
		currency: 'USD',
		status: 'sent',
		...partial
	});

	it('takes adjustments off or adds them before tax, and credit off after it', () => {
		expect(
			invoiceTotals({
				invoice: {
					amount: 420,
					adjustments: [
						{ description: 'Discount', kind: 'take-off', amount: 20 },
						{ description: 'Hosting', kind: 'add', amount: 10.5 }
					],
					credit: 100
				},
				client: { tax: { category: 'standard', rate: 10 } }
			})
		).toMatchObject({
			lines: 420,
			allowances: 20,
			charges: 10.5,
			net: 410.5,
			tax: 41.05,
			total: 451.55,
			credit: 100,
			due: 351.55
		});
	});

	it('never uses more credit than the invoice comes to', () => {
		expect(invoiceTotals({ invoice: { amount: 50, credit: 143 }, client: {} })).toMatchObject({
			credit: 50,
			due: 0
		});
	});

	it('keeps what a client overpaid as credit until later invoices use it up', () => {
		const may = billed({ status: 'paid', paidAmount: 563 });
		const june = billed({ startDate: '2026-06-01', endDate: '2026-06-30', credit: 100 });
		expect(availableCredit({ invoices: [may], client: zenos })).toBe(143);
		expect(availableCredit({ invoices: [may, june], client: zenos })).toBe(43);
		// Writing June again, its own credit is free to use.
		expect(availableCredit({ invoices: [may, june], client: zenos, exceptId: june.id })).toBe(143);
		// Paid what was due, or another client's overpayment: no credit.
		expect(
			availableCredit({ invoices: [billed({ status: 'paid', paidAmount: 420 })], client: zenos })
		).toBe(0);
		expect(availableCredit({ invoices: [may], client: svelte })).toBe(0);
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
		const invoice = {
			startDate: '2026-09-01',
			endDate: '2026-09-30',
			number: 'ZENOS-2026-09',
			amount: 1785,
			currency: 'USD'
		};
		const client = { currency: 'USD', email: 'zenos@ap.ramp.com' };
		const usual = new URL(invoiceEmailHref({ client, invoice, invoicing: { name: 'Tee Ming' } }));
		expect(usual.protocol).toBe('mailto:');
		expect(usual.pathname).toBe('zenos@ap.ramp.com');
		expect(usual.searchParams.get('subject')).toBe('Invoice for September 2026');
		expect(usual.searchParams.get('body')).toBe(
			"Hi,\n\nI've attached the invoice for September 2026.\n\nKind regards,"
		);
		const own = new URL(
			invoiceEmailHref({
				client: { ...client, emailMessage: 'Hi Ben,\n\nHere is {number}.\n\n{name}.' },
				invoice,
				invoicing: { name: 'Tee Ming' }
			})
		);
		expect(own.searchParams.get('body')).toBe('Hi Ben,\n\nHere is ZENOS-2026-09.\n\nTee Ming.');
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
			{ date: '02/09/2026', work: 'web PR #8' },
			{ date: '11/09/2026', work: 'Set up simulation' },
			{ date: '11/09/2026', work: 'zenos_ws PR #637' }
		]);
		expect(
			invoiceLogLines([
				...entries,
				entry({
					date: '2026-09-12',
					items: [{ kind: 'issue', owner: 'sveltejs', repo: 'kit', number: 1 }]
				})
			]).at(-1)
		).toEqual({ date: '12/09/2026', work: 'sveltejs/kit Issue #1' });
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

	it('moves to the next month', () => {
		expect(addMonths('2026-12', 1)).toBe('2027-01');
		expect(addMonths('2026-01', -1)).toBe('2025-12');
	});
});

describe('take-home', () => {
	// A progressive scale like Malaysia's income tax, simplified.
	const bands = [
		{ upTo: 5000, rate: 0 },
		{ upTo: 20000, rate: 1 },
		{ upTo: 35000, rate: 3 },
		{ rate: 8 }
	];
	const deduction = (partial: Partial<Deduction> & Pick<Deduction, 'kind'>): Deduction => ({
		id: crypto.randomUUID(),
		name: partial.kind,
		base: 'gross',
		order: 0,
		...partial
	});

	it('taxes each band’s part of the income at its own rate', () => {
		expect(bandsTax({ income: 3000, bands })).toBe(0);
		expect(bandsTax({ income: 30000, bands })).toBe(450);
		expect(bandsTax({ income: 40000, bands })).toBe(1000);
	});

	it('takes each deduction in order, from gross or from what is left', () => {
		const { lines, net } = takeHome({
			gross: 10000,
			deductions: [
				deduction({ name: 'Tithe', kind: 'percent', rate: 10, order: 2 }),
				deduction({ name: 'Pension', kind: 'percent', rate: 11, order: 0 }),
				// A yearly scale on what the pension leaves: 8900 a month is 106800 a year.
				deduction({ name: 'Tax', kind: 'bands', bands, yearly: true, base: 'remaining', order: 1 })
			]
		});
		expect(lines.map(({ deduction, amount }) => [deduction.name, amount])).toEqual([
			['Pension', 1100],
			['Tax', 528.67],
			['Tithe', 1000]
		]);
		expect(net).toBe(7371.33);
	});

	it('taxes a year on its whole gross, and takes a monthly amount each month', () => {
		const { lines, net } = yearTakeHome({
			gross: 40000,
			months: 4,
			deductions: [
				deduction({ name: 'Tithe', kind: 'percent', rate: 10, order: 0 }),
				deduction({ name: 'Tax', kind: 'bands', bands, yearly: true, order: 1 }),
				deduction({ name: 'Fee', kind: 'fixed', amount: 100, order: 2 })
			]
		});
		expect(lines.map(({ deduction, amount }) => [deduction.name, amount])).toEqual([
			['Tithe', 4000],
			['Tax', 1000],
			['Fee', 400]
		]);
		expect(net).toBe(34600);
		// A monthly scale applies to the average month: 10000 a month takes 50, four times.
		expect(
			yearTakeHome({
				gross: 40000,
				months: 4,
				deductions: [deduction({ kind: 'bands', bands })]
			}).net
		).toBe(39800);
	});

	it('can leave less than nothing, but takes nothing from nothing', () => {
		expect(
			takeHome({ gross: 100, deductions: [deduction({ kind: 'fixed', amount: 150 })] }).net
		).toBe(-50);
		expect(takeHome({ gross: 0, deductions: [deduction({ kind: 'percent', rate: 10 })] }).net).toBe(
			0
		);
	});
});

describe('projections', () => {
	const data: WorkLogData = {
		...emptyWorkLog(),
		clients: [svelte, zenos],
		exchange: { from: 'USD', to: 'MYR', rate: 4 },
		entries: [
			entry({ date: '2026-10-01', hours: 7 }),
			entry({ date: '2026-10-08', clientId: 'zenos', hours: 2 }),
			entry({ date: '2026-10-12', hours: 3 })
		]
	};
	const month = (log: WorkLogData) =>
		monthProjection({
			data: log,
			summary: summarizeMonth({ data: log, month: '2026-10', today: '2026-10-12' })
		});

	it('ranges the hours still expected from the lowest rate to the highest', () => {
		// 484 USD earned is 1936 MYR; 164 hours left at 160 or 168 MYR an hour.
		expect(month(data)).toEqual({
			currency: 'MYR',
			earned: 1936,
			low: 28176,
			average: 28832,
			high: 29488
		});
	});

	it('averages at each client’s share of the hours', () => {
		const shared = {
			...data,
			clients: [
				{ ...svelte, targetShare: 50 },
				{ ...zenos, targetShare: 50 }
			]
		};
		// 78 hours left toward svelte's 88 at 160, and 86 toward zenos's at 168.
		expect(month(shared)?.average).toBe(28864);
	});
});

describe('year', () => {
	const data: WorkLogData = {
		...emptyWorkLog(),
		clients: [svelte, zenos],
		exchange: { from: 'USD', to: 'MYR', rate: 4 },
		entries: [
			entry({ date: '2026-10-01', hours: 7 }),
			entry({ date: '2026-10-08', clientId: 'zenos', hours: 2 }),
			entry({ date: '2026-10-12', hours: 3 })
		]
	};
	const year = summarizeYear({ data, year: 2026, today: '2026-10-12' });

	it('counts from the first month logged, so starting partway through is not a shortfall', () => {
		expect(year.months.map((summary) => summary.month)).toEqual(['2026-10', '2026-11', '2026-12']);
		// 22, 21 and 23 working days at 8 hours; 64 of them expected by the 12th.
		expect(year).toMatchObject({
			expected: 528,
			expectedSoFar: 64,
			logged: 12,
			pace: -52,
			remaining: 516,
			workingDaysLeft: 59,
			neededPerDay: 8.75
		});
	});

	it('runs the totals through the year, with logged only up to today', () => {
		expect(year.days[0]).toEqual({ date: '2026-10-01', expected: 8, logged: 7 });
		expect(year.days.find((day) => day.date === '2026-10-12')).toEqual({
			date: '2026-10-12',
			expected: 64,
			logged: 12
		});
		expect(year.days.at(-1)).toEqual({ date: '2026-12-31', expected: 528, logged: null });
	});

	it('projects the hours still expected at the clients’ average rate', () => {
		// October as projected for the month, then November's 168 and December's 184 hours at 164.
		expect(year.earnings).toEqual({
			currency: 'MYR',
			earned: 1936,
			projected: 86560,
			monthsSoFar: 1,
			months: 3
		});
	});
});

describe('days-off budget', () => {
	it('takes counted holidays and hours short off the allowance', () => {
		const data: WorkLogData = {
			...emptyWorkLog(),
			clients: [svelte],
			allowance: { days: 14, holidays: true },
			holidays: [{ date: '2026-12-25', name: 'Christmas' }],
			entries: [entry({ date: '2026-10-01', hours: 12 })]
		};
		// By the 12th, October expected 64 hours: 52 short is 6.5 days.
		expect(daysOffBudget({ data, year: 2026, today: '2026-10-12' })).toEqual({
			allowance: 14,
			holidays: 1,
			short: 6.5,
			used: 7.5,
			left: 6.5
		});
		// November logged nothing, so all 21 of its days count, but nothing before October does.
		expect(daysOffBudget({ data, year: 2026, today: '2026-11-30' })).toMatchObject({
			short: 41.5,
			used: 42.5
		});
		expect(
			daysOffBudget({ data: { ...data, allowance: undefined }, year: 2026, today: '2026-10-12' })
		).toBe(undefined);
	});
});

describe('dropDays', () => {
	it('offers the night before to small-hours entries', () => {
		expect(dropDays({ date: '2030-01-02', start: '01:00' })).toEqual(['2030-01-01', '2030-01-02']);
		expect(dropDays({ date: '2030-01-02', start: '09:00' })).toEqual([]);
		expect(dropDays({ date: '2030-01-02' })).toEqual([]);
	});

	it('counts from the day a marked entry was worked on', () => {
		expect(dropDays({ date: '2030-01-01', start: '01:00', afterMidnight: true })).toEqual([
			'2030-01-01',
			'2030-01-02'
		]);
	});
});
