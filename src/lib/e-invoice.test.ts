import { InvoiceService } from '@e-invoice-eu/core';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
	emptyInvoicing,
	invoiceMissing,
	invoiceTotals,
	type Client,
	type Invoice
} from '#lib/worklog.js';
import { toEInvoice } from './e-invoice';
import { addressLines, drawInvoicePdf } from './invoice-pdf';

const invoicing = {
	...emptyInvoicing(),
	name: 'Test Person',
	address: {
		street: '1 Example Road',
		extra: '',
		city: 'Bayan Lepas',
		postcode: '11900',
		region: 'Pulau Pinang',
		country: 'MY'
	},
	email: 'test@example.com',
	taxId: 'IG0000000',
	accountName: 'Test Person',
	accountNumber: '0000000000',
	bic: 'TESTUS33',
	payment: 'Routing number 000000000',
	notes: 'W-8BEN on file.'
};

const client: Client = {
	id: 'zenos',
	name: 'Zenos',
	legalName: 'Zenos LLC',
	rate: 42,
	currency: 'USD',
	openCollective: false,
	email: 'billing@example.com',
	address: {
		street: '2 Example Ave',
		extra: 'Floor 6',
		city: 'San Mateo',
		postcode: '94402',
		region: 'CA',
		country: 'US'
	}
};

const invoice: Invoice = {
	id: 'invoice-1',
	clientId: 'zenos',
	number: 'ZENOS-2026-10',
	startDate: '2026-10-01',
	endDate: '2026-10-31',
	hours: 42.5,
	rate: 42,
	amount: 1785,
	currency: 'USD',
	status: 'sent',
	sentOn: '2026-11-01'
};

const fontBytes = {
	regular: readFileSync(new URL('./assets/fonts/source-serif-4-regular.ttf', import.meta.url)),
	semibold: readFileSync(new URL('./assets/fonts/source-serif-4-semibold.ttf', import.meta.url))
};

describe('e-invoice', () => {
	it('bills work for a client abroad outside the scope of VAT, due after its payment days', () => {
		const data = toEInvoice({ invoice, client, invoicing, today: '2026-11-20' });
		const ubl = data['ubl:Invoice'] as unknown as Record<string, unknown>;
		expect(ubl['cbc:IssueDate']).toBe('2026-11-01');
		expect(ubl['cbc:DueDate']).toBe('2026-11-15');
		expect(JSON.stringify(ubl['cac:TaxTotal'])).toContain('"cbc:ID":"O"');
		// Outside VAT, no VAT number may be on the invoice.
		expect(JSON.stringify(ubl)).not.toContain('"cbc:ID":"VAT"}},{');
	});

	it('adds VAT at the client’s rate', () => {
		expect(
			invoiceTotals({ invoice, client: { ...client, tax: { category: 'standard', rate: 19 } } })
		).toMatchObject({ net: 1785, tax: 339.15, total: 2124.15, due: 2124.15 });
	});

	it('says what is still needed', () => {
		expect(
			invoiceMissing({ invoicing: emptyInvoicing(), client: { ...client, address: undefined } })
		).toEqual([
			'your name',
			'your city and country',
			'your bank account',
			'Zenos’s city and country'
		]);
		expect(invoiceMissing({ invoicing, client })).toEqual([]);
	});

	it('spells out the country', () => {
		expect(addressLines(client.address!)).toEqual([
			'2 Example Ave',
			'Floor 6',
			'94402 San Mateo CA',
			'United States'
		]);
	});

	it('makes a Factur-X PDF with the invoice inside it', { timeout: 30_000 }, async () => {
		const pdf = await drawInvoicePdf({
			invoice,
			client,
			invoicing,
			logLines: Array.from({ length: 80 }, (_, index) => ({
				date: `${String((index % 28) + 1).padStart(2, '0')}/10/2026`,
				work: `web PR #${index}`
			})),
			today: '2026-11-20',
			fontBytes
		});
		const service = new InvoiceService({ log() {}, warn() {}, error() {} });
		const out = await service.generate(
			toEInvoice({ invoice, client, invoicing, today: '2026-11-20' }),
			{
				format: 'Factur-X-EN16931',
				lang: 'en-us',
				pdf: { buffer: pdf, filename: 'invoice.pdf', mimetype: 'application/pdf' }
			}
		);
		const text = Buffer.from(out as Uint8Array).toString('latin1');
		expect(text.startsWith('%PDF-')).toBe(true);
		expect(text).toContain('factur-x.xml');
		expect(text).toContain('pdfaid:part');
		// The embedded XML is compressed: find it and check the invoice made it in.
		const streams = [...text.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].flatMap((match) => {
			try {
				return [inflateSync(Buffer.from(match[1], 'latin1')).toString('utf8')];
			} catch {
				return [];
			}
		});
		const xml = streams.find((stream) => stream.includes('CrossIndustryInvoice'));
		expect(xml).toContain('ZENOS-2026-10');
		expect(xml).toContain('urn:cen.eu:en16931:2017');
		expect(xml).toContain('<ram:DuePayableAmount>1785.00</ram:DuePayableAmount>');
	});

	it.for([
		{ category: 'outside-scope' },
		{ category: 'reverse-charge' },
		{ category: 'standard', rate: 20 }
	] as const)(
		'passes the standard’s schema with VAT $category',
		{ timeout: 30_000 },
		async (tax) => {
			// Checked against Mustang, the reference validator, when written: these keep it so.
			const vatClient: Client = { ...client, vatId: 'FR40303265045', tax };
			const adjusted: Invoice = {
				...invoice,
				adjustments: [
					{ description: 'Discount', kind: 'take-off', amount: 20 },
					{ description: 'Hosting', kind: 'add', amount: 10.5 }
				],
				credit: 143
			};
			const data = toEInvoice({
				invoice: adjusted,
				client: vatClient,
				invoicing: { ...invoicing, vatId: 'DE123456789' },
				today: '2026-11-20'
			});
			const ubl = data['ubl:Invoice'] as unknown as Record<string, unknown>;
			expect(ubl['cac:Delivery']).toEqual({ 'cbc:ActualDeliveryDate': '2026-10-31' });
			const subtotal = JSON.stringify(ubl['cac:TaxTotal']);
			if (tax.category === 'reverse-charge') expect(subtotal).toContain('"cbc:Percent":"0"');
			if (tax.category === 'outside-scope') expect(subtotal).not.toContain('cbc:Percent');
			expect(ubl['cac:AllowanceCharge']).toHaveLength(2);
			expect(ubl['cac:LegalMonetaryTotal']).toMatchObject({ 'cbc:PrepaidAmount': '143.00' });
			const service = new InvoiceService({ log() {}, warn() {}, error() {} });
			const pdf = await drawInvoicePdf({
				invoice: adjusted,
				client: vatClient,
				invoicing,
				logLines: [],
				today: '2026-11-20',
				fontBytes
			});
			await expect(
				service.generate(data, {
					format: 'Factur-X-EN16931',
					lang: 'en-us',
					pdf: { buffer: pdf, filename: 'invoice.pdf', mimetype: 'application/pdf' }
				})
			).resolves.toBeTruthy();
		}
	);
});
