/**
 * The invoice as a PDF, laid out like most invoices so people and accounts payable software
 * find each part where they expect it: the number and dates, who it is from and to, the amount
 * due, one table of what was billed, the totals, how to pay, then the work log.
 */

import * as fontkit from 'fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import { formatHours, formatMoney } from '#lib/format.js';
import {
	DEFAULT_LINE_ITEM,
	invoiceDates,
	periodLabel,
	type Address,
	type Client,
	type Invoice,
	type Invoicing
} from '#lib/worklog.js';
import regularFont from './assets/fonts/source-serif-4-regular.ttf?url';
import semiboldFont from './assets/fonts/source-serif-4-semibold.ttf?url';
import { invoiceTotals } from './e-invoice';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const RIGHT = A4.width - MARGIN;
const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.4, 0.4, 0.44);
const RULE = rgb(0.82, 0.82, 0.85);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "15 Nov 2026", spelled the same everywhere. */
export function longDate(iso: string): string {
	const [year, month, day] = iso.split('-');
	return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * The invoice's typeface, Source Serif 4, as static fonts: PDF/A needs its fonts embedded, and
 * the site's variable web fonts cannot be cut down to the letters used.
 */
export async function invoiceFonts(): Promise<{ regular: Uint8Array; semibold: Uint8Array }> {
	const [regular, semibold] = await Promise.all(
		[regularFont, semiboldFont].map((url) => fetch(url).then((response) => response.arrayBuffer()))
	);
	return { regular: new Uint8Array(regular), semibold: new Uint8Array(semibold) };
}

/** An address as lines, with the country spelled out. Nothing for an address not filled in. */
export function addressLines(address: Address | undefined): string[] {
	if (!address) return [];
	const country = address.country.trim();
	let countryName = country;
	try {
		countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(country) ?? country;
	} catch {
		// Not a country code: print it as typed.
	}
	return [
		address.street,
		address.extra,
		[address.postcode, address.city, address.region]
			.map((part) => part.trim())
			.filter(Boolean)
			.join(' '),
		countryName
	]
		.map((line) => line.trim())
		.filter(Boolean);
}

type Fonts = { regular: PDFFont; semibold: PDFFont };

/** Draws top to bottom, starting a new page when one fills. */
class Writer {
	page!: PDFPage;
	y = 0;
	readonly pages: PDFPage[] = [];

	constructor(
		readonly doc: PDFDocument,
		readonly fonts: Fonts
	) {
		this.newPage();
	}

	newPage() {
		this.page = this.doc.addPage([A4.width, A4.height]);
		this.pages.push(this.page);
		this.y = A4.height - MARGIN;
	}

	/** Room for `height` more points, else a new page. */
	need(height: number) {
		if (this.y - height < MARGIN + 24) this.newPage();
	}

	text({
		text,
		x = MARGIN,
		size = 10,
		font = this.fonts.regular,
		color = INK,
		align = 'left'
	}: {
		text: string;
		x?: number;
		size?: number;
		font?: PDFFont;
		color?: ReturnType<typeof rgb>;
		align?: 'left' | 'right';
	}) {
		const width = font.widthOfTextAtSize(text, size);
		this.page.drawText(text, {
			x: align === 'right' ? x - width : x,
			y: this.y,
			size,
			font,
			color
		});
	}

	rule(from = MARGIN, to = RIGHT) {
		this.page.drawLine({
			start: { x: from, y: this.y },
			end: { x: to, y: this.y },
			thickness: 0.6,
			color: RULE
		});
	}

	/** Words wrapped to `width`, each line `leading` below the last. */
	wrap({
		text,
		width,
		size = 10,
		font = this.fonts.regular
	}: {
		text: string;
		width: number;
		size?: number;
		font?: PDFFont;
	}) {
		return text.split('\n').flatMap((paragraph) => {
			const lines: string[] = [];
			let line = '';
			for (const word of paragraph.split(/\s+/)) {
				const next = line ? `${line} ${word}` : word;
				if (line && font.widthOfTextAtSize(next, size) > width) {
					lines.push(line);
					line = word;
				} else line = next;
			}
			lines.push(line);
			return lines;
		});
	}
}

/** Lines under a small heading, side by side with another block at `x`. */
function block({
	writer,
	heading,
	lines,
	x,
	top
}: {
	writer: Writer;
	heading: string;
	lines: string[];
	x: number;
	top: number;
}): number {
	writer.y = top;
	writer.text({ text: heading, x, size: 9, color: MUTED });
	for (const line of lines) {
		writer.y -= 14;
		writer.text({ text: line, x });
	}
	return writer.y;
}

export async function drawInvoicePdf({
	invoice,
	client,
	invoicing,
	logLines,
	today,
	fontBytes
}: {
	invoice: Invoice;
	client: Client;
	invoicing: Invoicing;
	/** The work log, one line per item. */
	logLines: string[];
	today: string;
	fontBytes: { regular: Uint8Array; semibold: Uint8Array };
}): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const fonts = {
		regular: await doc.embedFont(fontBytes.regular, { subset: true }),
		semibold: await doc.embedFont(fontBytes.semibold, { subset: true })
	};
	const number = invoice.number?.trim() || 'Invoice';
	doc.setTitle(`Invoice ${number}`);
	doc.setAuthor(invoicing.name);
	doc.setCreator('Open Work');
	doc.setProducer('Open Work');

	const w = new Writer(doc, fonts);
	const { issuedOn, dueOn } = invoiceDates({ invoice, client, today });
	const totals = invoiceTotals({ invoice, client });
	const money = (amount: number) => formatMoney(amount, invoice.currency);

	// Title, and the facts every invoice is filed by.
	w.y -= 22;
	w.text({ text: 'Invoice', size: 26, font: fonts.semibold });
	w.y -= 30;
	const facts: [string, string][] = [
		['Invoice number', number],
		['Date of issue', longDate(issuedOn)],
		['Date due', longDate(dueOn)],
		['Billing period', `${longDate(invoice.startDate)} – ${longDate(invoice.endDate)}`]
	];
	for (const [label, value] of facts) {
		w.text({ text: label, color: MUTED });
		w.text({ text: value, x: MARGIN + 100, font: fonts.semibold });
		w.y -= 15;
	}

	// Who it is from and to.
	w.y -= 18;
	const top = w.y;
	const from = [
		invoicing.name,
		...addressLines(invoicing.address),
		invoicing.email,
		...(invoicing.vatId.trim() && totals.category !== 'outside-scope'
			? [`VAT ${invoicing.vatId}`]
			: []),
		...(invoicing.taxId.trim() ? [`Tax number ${invoicing.taxId}`] : [])
	].filter((line) => line.trim());
	const to = [
		client.legalName?.trim() || client.name,
		...addressLines(client.address),
		client.email ?? '',
		...(client.vatId?.trim() && totals.category !== 'outside-scope' ? [`VAT ${client.vatId}`] : [])
	].filter((line) => line.trim());
	const leftEnd = block({ writer: w, heading: 'From', lines: from, x: MARGIN, top });
	const rightEnd = block({ writer: w, heading: 'Bill to', lines: to, x: MARGIN + 250, top });
	w.y = Math.min(leftEnd, rightEnd) - 34;

	// The one line someone paying it looks for.
	w.text({
		text: `${money(totals.total)} ${invoice.currency} due ${longDate(dueOn)}`,
		size: 16,
		font: fonts.semibold
	});

	// What was billed.
	const columns = { qty: RIGHT - 190, price: RIGHT - 90, amount: RIGHT };
	w.y -= 34;
	w.text({ text: 'Description', size: 9, color: MUTED });
	w.text({ text: 'Qty', x: columns.qty, size: 9, color: MUTED, align: 'right' });
	w.text({ text: 'Unit price', x: columns.price, size: 9, color: MUTED, align: 'right' });
	w.text({ text: 'Amount', x: columns.amount, size: 9, color: MUTED, align: 'right' });
	w.y -= 8;
	w.rule();
	w.y -= 18;
	w.text({ text: client.lineItem?.trim() || DEFAULT_LINE_ITEM });
	w.text({ text: `${formatHours(invoice.hours)} h`, x: columns.qty, align: 'right' });
	w.text({
		text: money(invoice.hours > 0 ? totals.net / invoice.hours : invoice.rate),
		x: columns.price,
		align: 'right'
	});
	w.text({ text: money(totals.net), x: columns.amount, align: 'right' });
	w.y -= 14;
	w.text({ text: periodLabel(invoice), size: 9, color: MUTED });
	w.y -= 12;
	w.rule();

	// The totals, ruled off under the amount column.
	const label = RIGHT - 200;
	const rows: [string, string, boolean][] = [
		['Subtotal', money(totals.net), false],
		[
			totals.category === 'standard'
				? `VAT ${totals.rate}%`
				: totals.category === 'reverse-charge'
					? 'No VAT: reverse charge'
					: 'No VAT: outside its scope',
			money(totals.tax),
			false
		],
		['Total', money(totals.total), false],
		['Amount due', `${money(totals.total)} ${invoice.currency}`, true]
	];
	w.y -= 6;
	for (const [name, value, strong] of rows) {
		w.y -= 16;
		if (strong) {
			w.y -= 2;
			w.page.drawLine({
				start: { x: label, y: w.y + 12 },
				end: { x: RIGHT, y: w.y + 12 },
				thickness: 0.6,
				color: RULE
			});
		}
		const font = strong ? fonts.semibold : fonts.regular;
		w.text({ text: name, x: label, font, color: strong ? INK : MUTED });
		w.text({ text: value, x: RIGHT, font, align: 'right' });
	}

	const width = RIGHT - MARGIN;
	const paragraph = (heading: string, text: string) => {
		const lines = w.wrap({ text, width });
		w.need(30 + lines.length * 14);
		w.y -= 30;
		w.text({ text: heading, size: 9, color: MUTED });
		for (const line of lines) {
			w.y -= 14;
			w.text({ text: line });
		}
	};

	if (totals.category === 'reverse-charge') {
		paragraph('VAT', 'Reverse charge: the customer accounts for the VAT on this invoice.');
	}
	const payment = [
		...(invoicing.accountName.trim() ? [`Account name: ${invoicing.accountName.trim()}`] : []),
		`Account number: ${invoicing.accountNumber.trim()}`,
		...(invoicing.bic.trim() ? [`BIC/SWIFT: ${invoicing.bic.trim()}`] : []),
		...(invoicing.payment.trim() ? [invoicing.payment.trim()] : [])
	].join('\n');
	paragraph('How to pay', payment);
	if (invoicing.notes.trim()) paragraph('Notes', invoicing.notes.trim());

	if (logLines.length > 0) {
		w.need(60);
		w.y -= 30;
		w.text({ text: 'Work log', size: 9, color: MUTED });
		for (const line of logLines) {
			for (const wrapped of w.wrap({ text: line, width, size: 9 })) {
				w.need(13);
				w.y -= 13;
				w.text({ text: wrapped, size: 9 });
			}
		}
	}

	// Each page says whose it is, so a loose page finds its way back.
	w.pages.forEach((page, index) => {
		const footer = `${number}   Page ${index + 1} of ${w.pages.length}`;
		const size = 8;
		page.drawText(footer, {
			x: RIGHT - fonts.regular.widthOfTextAtSize(footer, size),
			y: MARGIN - 24,
			size,
			font: fonts.regular,
			color: MUTED
		});
	});

	return doc.save();
}
