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
	invoiceTotals,
	invoicingNotes,
	type Address,
	type Client,
	type Invoice,
	type Invoicing,
	type LogLine
} from '#lib/worklog.js';
import regularFont from './assets/fonts/source-serif-4-regular.ttf?url';
import semiboldFont from './assets/fonts/source-serif-4-semibold.ttf?url';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const RIGHT = A4.width - MARGIN;
const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.4, 0.4, 0.44);
const RULE = rgb(0.82, 0.82, 0.85);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "02 Sep 2026", spelled the same everywhere. */
export function longDate(iso: string): string {
	const [year, month, day] = iso.split('-');
	return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
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

/** Lines like "Routing number: 026073150" as a label and value; other lines as they are. */
export function labelledLines(text: string): [label: string | undefined, value: string][] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const match = /^([^:]{1,40}):\s+(.+)$/.exec(line);
			return match ? [match[1], match[2]] : [undefined, line];
		});
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
	logLines: LogLine[];
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
	const { issuedOn } = invoiceDates({ invoice, client, today });
	const totals = invoiceTotals({ invoice, client });
	const money = (amount: number) => formatMoney(amount, invoice.currency);

	// Laid out as the invoices you wrote by hand: who it is from and to, its number and dates, one
	// table of what was billed, the total due, your notes and how to pay, then the work log.
	w.y -= 22;
	w.text({ text: 'INVOICE', size: 24, font: fonts.semibold });

	// Who it is from and to.
	w.y -= 36;
	const top = w.y;
	const from = [
		invoicing.name,
		...addressLines(invoicing.address),
		invoicing.email,
		invoicing.phone,
		...(invoicing.vatId.trim() && totals.category !== 'outside-scope'
			? [`VAT ${invoicing.vatId}`]
			: [])
	].filter((line) => line.trim());
	const to = [
		client.legalName?.trim() || client.name,
		...addressLines(client.address),
		...(client.vatId?.trim() && totals.category !== 'outside-scope' ? [`VAT ${client.vatId}`] : [])
	].filter((line) => line.trim());
	const leftEnd = block({ writer: w, heading: 'From:', lines: from, x: MARGIN, top });
	const rightEnd = block({ writer: w, heading: 'Bill To:', lines: to, x: MARGIN + 250, top });
	w.y = Math.min(leftEnd, rightEnd) - 34;

	// Its number and dates, side by side.
	const facts: [string, string][] = [
		['Invoice #', number],
		['Invoice Date', longDate(issuedOn)],
		['Billing Period', `${longDate(invoice.startDate)} – ${longDate(invoice.endDate)}`]
	];
	const factX = [MARGIN, MARGIN + 150, MARGIN + 290];
	w.rule();
	w.y -= 16;
	facts.forEach(([label], index) =>
		w.text({ text: label, x: factX[index], size: 9, color: MUTED })
	);
	w.y -= 15;
	facts.forEach(([, value], index) =>
		w.text({ text: value, x: factX[index], font: fonts.semibold })
	);
	w.y -= 12;
	w.rule();

	// What was billed.
	const columns = { hours: RIGHT - 200, rate: RIGHT - 100, amount: RIGHT };
	const plain = (amount: number) => amount.toFixed(2);
	w.y -= 32;
	w.text({ text: 'Description', size: 9, color: MUTED });
	w.text({ text: 'Hours', x: columns.hours, size: 9, color: MUTED, align: 'right' });
	w.text({
		text: `Rate (${invoice.currency}/hr)`,
		x: columns.rate,
		size: 9,
		color: MUTED,
		align: 'right'
	});
	w.text({
		text: `Amount (${invoice.currency})`,
		x: columns.amount,
		size: 9,
		color: MUTED,
		align: 'right'
	});
	w.y -= 8;
	w.rule();
	w.y -= 18;
	w.text({ text: client.lineItem?.trim() || DEFAULT_LINE_ITEM });
	w.text({ text: formatHours(invoice.hours), x: columns.hours, align: 'right' });
	w.text({
		text: plain(invoice.hours > 0 ? totals.lines / invoice.hours : invoice.rate),
		x: columns.rate,
		align: 'right'
	});
	w.text({ text: plain(totals.lines), x: columns.amount, align: 'right' });
	// Each adjustment is a line of its own, taken off or added.
	for (const adjustment of invoice.adjustments ?? []) {
		const lines = w.wrap({
			text: adjustment.description.trim() || 'Adjustment',
			width: columns.hours - MARGIN - 40
		});
		w.need(14 + lines.length * 14);
		w.y -= 22;
		lines.forEach((line, index) => {
			if (index > 0) w.y -= 14;
			w.text({ text: line });
		});
		w.text({
			text: `${adjustment.kind === 'take-off' ? '−' : ''}${plain(adjustment.amount)}`,
			x: columns.amount,
			align: 'right'
		});
	}
	w.y -= 12;
	w.rule();

	// The totals, right-aligned under the amounts.
	type Row = [label: string, value: string, strong: boolean];
	const rows: Row[] = [
		['Subtotal:', money(totals.net), false],
		...(totals.category === 'standard'
			? ([[`VAT ${totals.rate}%:`, money(totals.tax), false]] as Row[])
			: totals.category === 'reverse-charge'
				? ([['VAT (reverse charge):', money(0), false]] as Row[])
				: []),
		...(totals.credit > 0
			? ([['Credit from earlier payments:', `−${money(totals.credit)}`, false]] as Row[])
			: []),
		['Total Due:', `${money(totals.due)} ${invoice.currency}`, true]
	];
	w.y -= 4;
	for (const [name, value, strong] of rows) {
		w.y -= 17;
		const font = strong ? fonts.semibold : fonts.regular;
		const size = strong ? 11 : 10;
		w.text({ text: `${name} ${value}`, x: RIGHT, font, size, align: 'right' });
	}

	const width = RIGHT - MARGIN;
	const paragraph = ({ heading, text }: { heading?: string; text: string }) => {
		const lines = w.wrap({ text, width });
		w.need((heading ? 44 : 30) + lines.length * 14);
		w.y -= 30;
		if (heading) {
			w.text({ text: heading, font: fonts.semibold });
			w.y -= 4;
		}
		for (const [index, line] of lines.entries()) {
			if (heading || index > 0) w.y -= 14;
			w.text({ text: line });
		}
	};

	if (totals.category === 'reverse-charge') {
		paragraph({ text: 'Reverse charge: the customer accounts for the VAT on this invoice.' });
	}
	const notes = invoicingNotes(invoicing);
	if (notes) paragraph({ text: notes });

	// How to pay: any opening words first, then a table of labels and values, the account's own
	// details before the rest. A line with no label is said as it was written.
	const written = labelledLines(invoicing.payment);
	const opening = written.findIndex(([label]) => label !== undefined);
	const intro = (opening === -1 ? written : written.slice(0, opening)).map(([, text]) => text);
	const paymentRows: [label: string | undefined, value: string][] = [
		...(invoicing.accountName.trim()
			? [['Name', invoicing.accountName.trim()] as [string, string]]
			: []),
		['Account number', invoicing.accountNumber.trim()],
		...(invoicing.bic.trim() ? [['Swift/BIC', invoicing.bic.trim()] as [string, string]] : []),
		...(opening === -1 ? [] : written.slice(opening))
	];
	const labelWidth = Math.min(
		180,
		Math.max(
			...paymentRows.map(([label]) => (label ? fonts.regular.widthOfTextAtSize(label, 10) : 0))
		) + 16
	);
	w.need(44 + (intro.length + paymentRows.length) * 15);
	w.y -= 30;
	w.text({ text: 'Payment Terms', font: fonts.semibold });
	w.y -= 4;
	for (const line of intro.flatMap((text) => w.wrap({ text, width }))) {
		w.y -= 15;
		w.text({ text: line });
	}
	if (intro.length > 0) w.y -= 6;
	for (const [label, value] of paymentRows) {
		// A long label wraps within its column rather than running into the value.
		const labels = label ? w.wrap({ text: label, width: labelWidth - 16 }) : [];
		const values = w.wrap({ text: value, width: label ? width - labelWidth : width });
		const height = Math.max(labels.length, values.length);
		w.need(height * 15);
		for (let index = 0; index < height; index++) {
			w.y -= 15;
			if (labels[index]) w.text({ text: labels[index], color: MUTED });
			if (values[index]) w.text({ text: values[index], x: label ? MARGIN + labelWidth : MARGIN });
		}
	}

	// The work log backs the invoice up, so it starts a page of its own: the first page is the
	// whole invoice, the same every month however long the log runs.
	if (logLines.length > 0) {
		w.newPage();
		w.y -= 10;
		w.text({ text: 'Work Log', font: fonts.semibold });
		w.y -= 6;
		// A table of the day and what was worked on, each day's date said once. The headings come
		// again at the top of each page it runs onto.
		const size = 9.5;
		const workX = MARGIN + 76;
		const headings = () => {
			w.y -= 16;
			w.text({ text: 'Date', size: 9, color: MUTED });
			w.text({ text: 'Work', x: workX, size: 9, color: MUTED });
			w.y -= 6;
			w.rule();
		};
		headings();
		let lastDate = '';
		for (const line of logLines) {
			const wrapped = w.wrap({ text: line.work, width: RIGHT - workX, size });
			const newDay = line.date !== lastDate;
			const page = w.page;
			w.need((newDay ? 6 : 0) + wrapped.length * 13);
			const turned = w.page !== page;
			if (turned) headings();
			if (newDay && lastDate && !turned) {
				w.y -= 4;
				w.page.drawLine({
					start: { x: MARGIN, y: w.y - 2 },
					end: { x: RIGHT, y: w.y - 2 },
					thickness: 0.3,
					color: RULE
				});
			}
			wrapped.forEach((text, index) => {
				w.y -= 13;
				if (index === 0 && (newDay || turned)) w.text({ text: line.date, size, color: MUTED });
				w.text({ text, x: workX, size });
			});
			lastDate = line.date;
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
