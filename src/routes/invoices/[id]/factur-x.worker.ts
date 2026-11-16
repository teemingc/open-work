/**
 * Turns a PDF into a Factur-X invoice: the EN 16931 data embedded as XML, and the PDF made
 * PDF/A-3. In a worker because the library checks the data with schemas it compiles with
 * `eval`, which the page's Content Security Policy rightly forbids; a worker runs under its own.
 */

import type { Invoice } from '@e-invoice-eu/core';

export type FacturXRequest = { data: Invoice; pdf: Uint8Array; fileName: string; title: string };
export type FacturXResponse = { pdf: Uint8Array } | { error: string };

const quiet = { log() {}, warn() {}, error() {} };

/**
 * The library's browser build looks for `window`, which a worker calls `self`. It also names
 * Node's `require` as a fallback it never calls here, which throws once built unless it exists.
 */
async function library() {
	const scope = globalThis as { window?: typeof globalThis; require?: unknown };
	scope.window ??= globalThis;
	if (!('require' in scope)) scope.require = undefined;
	return import('@e-invoice-eu/core/dist/e-invoice-eu.min.js');
}

self.onmessage = async (event: MessageEvent<FacturXRequest>) => {
	const { data, pdf, fileName, title } = event.data;
	try {
		const { InvoiceService } = await library();
		const out = await new InvoiceService(quiet).generate(data, {
			format: 'Factur-X-EN16931',
			lang: 'en-us',
			pdf: { buffer: pdf, filename: fileName, mimetype: 'application/pdf' },
			customMetadata: { title, creator: 'Open Work', producer: 'Open Work' }
		});
		self.postMessage({ pdf: out as Uint8Array } satisfies FacturXResponse);
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : String(error)
		} satisfies FacturXResponse);
	}
};
