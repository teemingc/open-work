/**
 * Which picture a page's share link points at, drawn by routes/og/[...path]. Sharing sites keep a
 * picture for as long as its address stays the same, so the address changes whenever the picture
 * does.
 */
import type { CollectiveStats } from '#lib/collective-stats.remote.js';

/** Bump when the cards change, so sharing sites fetch them again instead of using their copy. */
export const OG_IMAGE_VERSION = '4';

/**
 * Changes whenever a collective's card may: when Open Collective reports new figures, and at the
 * start of each month, as the forecast moves along even when nothing new comes in.
 */
export function collectiveImageVersion(stats: CollectiveStats): string {
	// What a fund has given, and to whom, for a fund's card.
	const given = stats.grants?.map((grant) => [grant.slug, grant.amount]);
	const figures = [
		stats.name,
		stats.imageUrl,
		stats.currency,
		stats.months,
		stats.unpaid,
		given,
		stats.commitments
	];
	return `${OG_IMAGE_VERSION}-${stats.fetchedAt.slice(0, 7)}-${hash(JSON.stringify(figures))}`;
}

/** FNV-1a: short, and the same in the browser as on the server. */
function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}
