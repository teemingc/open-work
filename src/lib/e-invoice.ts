/**
 * An invoice in the shape of EN 16931, the European e-invoice standard, as the `@e-invoice-eu/core`
 * library takes it: UBL elements as keys, attributes after an `@`, and every value a string.
 */

import type { Invoice as EInvoice } from '@e-invoice-eu/core';
import {
	DEFAULT_LINE_ITEM,
	invoiceDates,
	invoiceTotals,
	periodLabel,
	type Address,
	type Client,
	type Invoice,
	type Invoicing,
	type TaxCategory
} from './worklog';

/** The UNCL 5305 code for each way of taxing, and the reason printed for a zero rate. */
const TAX_CODES: Record<TaxCategory, { code: string; reason?: string }> = {
	'outside-scope': { code: 'O', reason: 'Not subject to VAT' },
	'reverse-charge': { code: 'AE', reason: 'Reverse charge' },
	standard: { code: 'S' }
};

function money(amount: number): string {
	return amount.toFixed(2);
}

function postalAddress(address: Address): Record<string, unknown> {
	return {
		...(address.street.trim() && { 'cbc:StreetName': address.street.trim() }),
		...(address.extra.trim() && { 'cbc:AdditionalStreetName': address.extra.trim() }),
		'cbc:CityName': address.city.trim(),
		...(address.postcode.trim() && { 'cbc:PostalZone': address.postcode.trim() }),
		...(address.region.trim() && { 'cbc:CountrySubentity': address.region.trim() }),
		'cac:Country': { 'cbc:IdentificationCode': address.country.trim() }
	};
}

/** The invoice as EN 16931 data. Check `invoiceMissing` first: this assumes nothing is. */
export function toEInvoice({
	invoice,
	client,
	invoicing,
	today
}: {
	invoice: Invoice;
	client: Client;
	invoicing: Invoicing;
	today: string;
}): EInvoice {
	const currency = invoice.currency;
	const { issuedOn, dueOn } = invoiceDates({ invoice, client, today });
	const totals = invoiceTotals({ invoice, client });
	const tax = TAX_CODES[totals.category];
	const category = {
		'cbc:ID': tax.code,
		// Reverse charge states its 0%; outside the scope of VAT there is no rate at all.
		...(totals.category !== 'outside-scope' && { 'cbc:Percent': String(totals.rate) }),
		'cac:TaxScheme': { 'cbc:ID': 'VAT' }
	};
	const withCurrency = (key: string, value: number) => ({
		[`cbc:${key}`]: money(value),
		[`cbc:${key}@currencyID`]: currency
	});
	const vatInvoice = totals.category !== 'outside-scope';
	// A buyer's system tells sellers apart by one of these; outside VAT, a VAT number may not be it.
	const sellerId = invoicing.taxId.trim() || invoicing.email.trim() || invoicing.name.trim();
	const days = invoiceDays({ issuedOn, dueOn });
	const notes = [invoicing.notes.trim(), invoicing.payment.trim()].filter(Boolean);

	const data = {
		'ubl:Invoice': {
			'cbc:CustomizationID': 'urn:cen.eu:en16931:2017',
			'cbc:ID': invoice.number?.trim() || invoice.id,
			'cbc:IssueDate': issuedOn,
			'cbc:DueDate': dueOn,
			'cbc:InvoiceTypeCode': '380',
			...(notes.length > 0 && { 'cbc:Note': notes.join('\n\n') }),
			'cbc:DocumentCurrencyCode': currency,
			'cac:InvoicePeriod': {
				'cbc:StartDate': invoice.startDate,
				'cbc:EndDate': invoice.endDate
			},
			'cac:AccountingSupplierParty': {
				'cac:Party': {
					...(invoicing.email.trim() && {
						'cbc:EndpointID': invoicing.email.trim(),
						'cbc:EndpointID@schemeID': 'EM'
					}),
					'cac:PartyIdentification': [{ 'cbc:ID': sellerId }],
					'cac:PostalAddress': postalAddress(invoicing.address),
					...((vatInvoice && invoicing.vatId.trim()) || invoicing.taxId.trim()
						? {
								'cac:PartyTaxScheme': [
									...(vatInvoice && invoicing.vatId.trim()
										? [
												{
													'cbc:CompanyID': invoicing.vatId.trim(),
													'cac:TaxScheme': { 'cbc:ID': 'VAT' }
												}
											]
										: []),
									...(invoicing.taxId.trim()
										? [
												{
													'cbc:CompanyID': invoicing.taxId.trim(),
													'cac:TaxScheme': { 'cbc:ID': 'FC' }
												}
											]
										: [])
								]
							}
						: {}),
					'cac:PartyLegalEntity': { 'cbc:RegistrationName': invoicing.name.trim() },
					...((invoicing.email.trim() || invoicing.phone.trim()) && {
						'cac:Contact': {
							...(invoicing.phone.trim() && { 'cbc:Telephone': invoicing.phone.trim() }),
							...(invoicing.email.trim() && { 'cbc:ElectronicMail': invoicing.email.trim() })
						}
					})
				}
			},
			'cac:AccountingCustomerParty': {
				'cac:Party': {
					...(client.email?.trim() && {
						'cbc:EndpointID': client.email.trim(),
						'cbc:EndpointID@schemeID': 'EM'
					}),
					'cac:PostalAddress': postalAddress(client.address!),
					...(vatInvoice &&
						client.vatId?.trim() && {
							'cac:PartyTaxScheme': {
								'cbc:CompanyID': client.vatId.trim(),
								'cac:TaxScheme': { 'cbc:ID': 'VAT' }
							}
						}),
					'cac:PartyLegalEntity': {
						'cbc:RegistrationName': client.legalName?.trim() || client.name
					}
				}
			},
			// The work is delivered by the end of the period. Without a date the delivery is left empty,
			// which validators warn about.
			'cac:Delivery': { 'cbc:ActualDeliveryDate': invoice.endDate },
			'cac:PaymentMeans': [
				{
					// 58 is a SEPA transfer, which an IBAN means; 30 is any other bank transfer.
					'cbc:PaymentMeansCode': isIban(invoicing.accountNumber) ? '58' : '30',
					'cac:PayeeFinancialAccount': {
						'cbc:ID': invoicing.accountNumber.replace(/\s+/g, ''),
						...(invoicing.accountName.trim() && { 'cbc:Name': invoicing.accountName.trim() }),
						...(invoicing.bic.trim() && {
							'cac:FinancialInstitutionBranch': { 'cbc:ID': invoicing.bic.trim() }
						})
					}
				}
			],
			'cac:PaymentTerms': { 'cbc:Note': `Payable within ${days} days` },
			...((invoice.adjustments ?? []).length > 0 && {
				// Adjustments are allowances (taken off) and charges (added) on the whole invoice.
				'cac:AllowanceCharge': (invoice.adjustments ?? []).map((adjustment) => ({
					'cbc:ChargeIndicator': adjustment.kind === 'add' ? 'true' : 'false',
					'cbc:AllowanceChargeReason':
						adjustment.description.trim() || (adjustment.kind === 'add' ? 'Charge' : 'Discount'),
					...withCurrency('Amount', adjustment.amount),
					'cac:TaxCategory': category
				}))
			}),
			'cac:TaxTotal': [
				{
					...withCurrency('TaxAmount', totals.tax),
					'cac:TaxSubtotal': [
						{
							...withCurrency('TaxableAmount', totals.net),
							...withCurrency('TaxAmount', totals.tax),
							'cac:TaxCategory': {
								...category,
								...(tax.reason && { 'cbc:TaxExemptionReason': tax.reason })
							}
						}
					]
				}
			],
			'cac:LegalMonetaryTotal': {
				...withCurrency('LineExtensionAmount', totals.lines),
				...(totals.allowances > 0 && withCurrency('AllowanceTotalAmount', totals.allowances)),
				...(totals.charges > 0 && withCurrency('ChargeTotalAmount', totals.charges)),
				...withCurrency('TaxExclusiveAmount', totals.net),
				...withCurrency('TaxInclusiveAmount', totals.total),
				// Credit from earlier overpayments counts as paid already.
				...(totals.credit > 0 && withCurrency('PrepaidAmount', totals.credit)),
				...withCurrency('PayableAmount', totals.due)
			},
			'cac:InvoiceLine': [
				{
					'cbc:ID': '1',
					// HUR is the UN/ECE code for an hour.
					'cbc:InvoicedQuantity': String(invoice.hours),
					'cbc:InvoicedQuantity@unitCode': 'HUR',
					...withCurrency('LineExtensionAmount', totals.lines),
					'cac:Item': {
						'cbc:Description': periodLabel(invoice),
						'cbc:Name': client.lineItem?.trim() || DEFAULT_LINE_ITEM,
						'cac:ClassifiedTaxCategory': category
					},
					'cac:Price': {
						// The hours times the rate makes the line, to the cent.
						'cbc:PriceAmount':
							invoice.hours > 0 ? (totals.lines / invoice.hours).toFixed(4) : money(invoice.rate),
						'cbc:PriceAmount@currencyID': currency
					}
				}
			]
		}
	};
	// Checked against the standard's schema by the library, which also types it far stricter than
	// this builds it up.
	return data as unknown as EInvoice;
}

function isIban(account: string): boolean {
	return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(account.replace(/\s+/g, '').toUpperCase());
}

function invoiceDays({ issuedOn, dueOn }: { issuedOn: string; dueOn: string }): number {
	return Math.round((Date.parse(dueOn) - Date.parse(issuedOn)) / (24 * 60 * 60 * 1000));
}
