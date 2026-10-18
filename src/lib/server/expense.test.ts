import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { buildExpense, SubmitExpenseSchema } from './expense';

const validInput = {
	collectiveSlug: 'svelte',
	payoutMethodId: 'po_123',
	title: 'Maintenance and Development (01/10/2026-15/10/2026)',
	itemDescription:
		'41 hours of work from 1st October 2026 to 15th October 2026 at a rate of 40 USD per hour',
	amountInCents: 164000,
	currency: 'USD',
	invoiceInfo: 'Tax income number: X1',
	notesHtml: 'a<br>b',
	address: '1 Road',
	country: 'my'
};

describe('SubmitExpenseSchema', () => {
	it('accepts a complete invoice and normalises the country code', () => {
		expect(v.parse(SubmitExpenseSchema, validInput).country).toBe('MY');
	});

	it('rejects bad amounts and codes', () => {
		for (const bad of [
			{ amountInCents: 0 },
			{ amountInCents: 10.5 },
			{ country: 'Malaysia' },
			{ currency: 'usd' },
			{ collectiveSlug: '../svelte' },
			{ payoutMethodId: '' }
		]) {
			expect(v.safeParse(SubmitExpenseSchema, { ...validInput, ...bad }).success).toBe(false);
		}
	});
});

describe('buildExpense', () => {
	it('builds an INVOICE expense billed for time', () => {
		const input = v.parse(SubmitExpenseSchema, validInput);
		const incurredAt = new Date('2026-10-16T00:00:00Z');

		expect(buildExpense({ input, payeeSlug: 'someone', incurredAt })).toEqual({
			type: 'INVOICE',
			description: validInput.title,
			currency: 'USD',
			payee: { slug: 'someone' },
			payoutMethod: { publicId: 'po_123' },
			items: [
				{
					description: validInput.itemDescription,
					amountV2: { valueInCents: 164000, currency: 'USD' },
					incurredAt: '2026-10-16T00:00:00.000Z'
				}
			],
			invoiceInfo: 'Tax income number: X1',
			privateMessage: 'a<br>b',
			payeeLocation: { address: '1 Road', country: 'MY' }
		});
	});

	it('leaves out optional fields that were not given', () => {
		const input = v.parse(SubmitExpenseSchema, {
			...validInput,
			invoiceInfo: undefined,
			notesHtml: undefined,
			address: undefined,
			country: undefined
		});
		const expense = buildExpense({ input, payeeSlug: 'someone' });
		expect(expense).not.toHaveProperty('invoiceInfo');
		expect(expense).not.toHaveProperty('privateMessage');
		expect(expense).not.toHaveProperty('payeeLocation');
	});
});
