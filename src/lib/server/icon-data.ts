/**
 * The most an icon may weigh. It is kept in the work log, so it lasts after the site renames its
 * files and shows without asking another site for it, but a larger one would weigh the log down.
 */
const MAX_ICON = 32 * 1024;

/**
 * The image at `href` as a `data:` address, or `undefined` if it is not a small enough image.
 * `href` must already be known to be a public address.
 */
export async function iconData(href: string): Promise<string | undefined> {
	if (href.startsWith('data:image/')) return href.length <= MAX_ICON * 1.4 ? href : undefined;
	try {
		const response = await fetch(href, {
			headers: { Accept: 'image/*' },
			signal: AbortSignal.timeout(10_000)
		});
		const type = response.headers.get('content-type')?.split(';')[0].trim();
		if (!response.ok || !type?.startsWith('image/')) return undefined;
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.length === 0 || bytes.length > MAX_ICON) return undefined;
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		return `data:${type};base64,${btoa(binary)}`;
	} catch {
		return undefined;
	}
}
