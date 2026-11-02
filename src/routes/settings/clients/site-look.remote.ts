import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { iconData } from '#lib/server/icon-data.js';
import { isPublicSite, siteIcons, siteUrl } from './site-look';

/** Plenty for a page's `<head>`, where icons are declared. */
const MAX_HTML = 256 * 1024;

/** How many of a site's icons to try before giving up. */
const MAX_TRIES = 4;

const fetchOptions = (accept: string): RequestInit => ({
	headers: { Accept: accept },
	signal: AbortSignal.timeout(10_000)
});

/** The start of a homepage, up to the end of its `<head>`. */
async function readHead(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return '';
	const decoder = new TextDecoder();
	let html = '';
	while (html.length < MAX_HTML && !/<\/head>/i.test(html)) {
		const { done, value } = await reader.read();
		if (done) break;
		html += decoder.decode(value, { stream: true });
	}
	void reader.cancel();
	return html;
}

/** A website's icon, kept whole, read from its homepage. */
export const getSiteLook = query(
	v.pipe(v.string(), v.maxLength(200)),
	async (text): Promise<{ logo: string }> => {
		const url = siteUrl(text);
		if (!url) error(400, `"${text}" is not a website address.`);

		let response: Response;
		try {
			response = await fetch(url, fetchOptions('text/html'));
		} catch {
			error(502, `Could not reach ${url.hostname}.`);
		}
		if (!response.ok) error(502, `${url.hostname} answered with ${response.status}.`);

		const html = await readHead(response);
		// A redirect, as to www.zenos.com, moves where the icons' addresses start from.
		const base = new URL(response.url || url);
		let logo: string | undefined;
		for (const href of siteIcons(html, base).slice(0, MAX_TRIES)) {
			if (href.startsWith('data:') || isPublicSite(new URL(href))) logo = await iconData(href);
			if (logo) break;
		}
		if (!logo) error(404, `${url.hostname} has no icon small enough to keep.`);
		return { logo };
	}
);
