import { describe, expect, it } from 'vitest';
import {
	endOfPeriod,
	formatLongDate,
	invoiceInfoText,
	invoiceTitle,
	lineItemDescription,
	nextPeriod,
	periodFromTitle,
	totalCents,
	workLogToHtml
} from './format';

describe('invoice text', () => {
	it('matches the wording used on previous invoices', () => {
		expect(invoiceTitle({ startDate: '2026-10-01', endDate: '2026-10-15' })).toBe(
			'Maintenance and Development (01/10/2026-15/10/2026)'
		);
		expect(
			lineItemDescription({
				hours: 41,
				rate: 40,
				currency: 'USD',
				startDate: '2026-10-01',
				endDate: '2026-10-15'
			})
		).toBe(
			'41 hours of work from 1st October 2026 to 15th October 2026 at a rate of 40 USD per hour'
		);
	});

	it('uses the right ordinal suffixes', () => {
		expect(formatLongDate('2026-10-02')).toBe('2nd October 2026');
		expect(formatLongDate('2026-10-03')).toBe('3rd October 2026');
		expect(formatLongDate('2026-10-11')).toBe('11th October 2026');
		expect(formatLongDate('2026-10-22')).toBe('22nd October 2026');
		expect(formatLongDate('2026-10-31')).toBe('31st October 2026');
	});

	it('computes cents without floating point drift', () => {
		expect(totalCents({ hours: 41, rate: 40 })).toBe(164000);
		expect(totalCents({ hours: 12.5, rate: 33.33 })).toBe(41663);
	});

	it('builds the invoice information line only when there is a number', () => {
		expect(invoiceInfoText('  Tax income number: IG123 ')).toBe('Tax income number: IG123');
		expect(invoiceInfoText('')).toBeUndefined();
		expect(invoiceInfoText(undefined)).toBeUndefined();
	});
});

describe('periods', () => {
	it('reads the period back from an expense title', () => {
		const period = { startDate: '2026-10-01', endDate: '2026-10-15' };
		expect(periodFromTitle(invoiceTitle(period))).toEqual(period);
		expect(periodFromTitle('Maintenance (16/09/2026 – 30/09/2026)')).toEqual({
			startDate: '2026-09-16',
			endDate: '2026-09-30'
		});
		expect(periodFromTitle('Conference travel')).toBeUndefined();
	});

	it('ends first-half periods on the 15th and second-half on the last day', () => {
		expect(endOfPeriod('2026-10-01')).toBe('2026-10-15');
		expect(endOfPeriod('2026-10-16')).toBe('2026-10-31');
		expect(endOfPeriod('2026-02-16')).toBe('2026-02-28');
		expect(endOfPeriod('2028-02-16')).toBe('2028-02-29');
	});

	it('continues from the last invoice', () => {
		expect(nextPeriod({ lastEnd: '2026-10-15' })).toEqual({
			startDate: '2026-10-16',
			endDate: '2026-10-31'
		});
		expect(nextPeriod({ lastEnd: '2026-12-31' })).toEqual({
			startDate: '2027-01-01',
			endDate: '2027-01-15'
		});
	});

	it('starts from the last finished half-month when there are no invoices', () => {
		expect(nextPeriod({ today: new Date(2026, 9, 16) })).toEqual({
			startDate: '2026-10-01',
			endDate: '2026-10-15'
		});
		expect(nextPeriod({ today: new Date(2026, 10, 1) })).toEqual({
			startDate: '2026-10-16',
			endDate: '2026-10-31'
		});
		expect(nextPeriod({ today: new Date(2027, 0, 5) })).toEqual({
			startDate: '2026-12-16',
			endDate: '2026-12-31'
		});
	});
});

describe('work log', () => {
	it('escapes HTML in notes', () => {
		expect(workLogToHtml('a <b> & "c"\nnext')).toBe('a &lt;b&gt; &amp; &quot;c&quot;<br>next');
	});
});
