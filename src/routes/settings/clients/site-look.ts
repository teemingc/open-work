/**
 * Whether `url` is a public website, so the server is never asked to read an address on its own
 * network.
 */
export function isPublicSite(url: URL): boolean {
	const host = url.hostname;
	return (
		/^https?:$/.test(url.protocol) &&
		host.includes('.') &&
		!/^[\d.]+$/.test(host) &&
		!host.startsWith('[') &&
		!/\.(local|localhost|internal|test)$/.test(host)
	);
}

/** "zenos.com" or "https://zenos.com/about" as the site's homepage, or `undefined` if it is not one. */
export function siteUrl(text: string): URL | undefined {
	const trimmed = text.trim();
	if (!trimmed) return undefined;
	let url: URL;
	try {
		url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
	} catch {
		return undefined;
	}
	return isPublicSite(url) ? new URL('/', url) : undefined;
}

/** The attributes of each tag named `tag`, with their names in lower case. */
function tags(html: string, tag: string): Record<string, string>[] {
	return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'gi'))].map(([, attributes]) =>
		Object.fromEntries(
			[...attributes.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)].map(
				([, name, double, single, bare]) => [name.toLowerCase(), double ?? single ?? bare]
			)
		)
	);
}

/** The largest size in a `sizes` attribute like "32x32 64x64", or 0 when it names none. */
function largest(sizes: string | undefined): number {
	return Math.max(0, ...[...(sizes ?? '').matchAll(/(\d+)x\d+/g)].map(([, size]) => Number(size)));
}

/**
 * The icons a homepage's HTML declares, best first, ending with the site's favicon. A drawing
 * scales to any size, so an SVG icon comes first; then the larger of the others, with an Apple
 * touch icon, made to be seen large, ahead of an icon of the same size.
 */
export function siteIcons(html: string, base: URL): string[] {
	const icons = tags(html, 'link')
		.filter((link) => /(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(link.rel ?? '') && link.href)
		.map((link) => ({
			href: link.href,
			score:
				link.type === 'image/svg+xml' || /\.svg(\?|$)/i.test(link.href)
					? Infinity
					: largest(link.sizes) + (/apple-touch-icon/i.test(link.rel) ? 0.5 : 0)
		}))
		.sort((a, b) => b.score - a.score)
		.map(({ href }) => href);
	return [...new Set([...icons, '/favicon.ico'])].flatMap((href) => {
		try {
			return [new URL(href, base).href];
		} catch {
			return [];
		}
	});
}
