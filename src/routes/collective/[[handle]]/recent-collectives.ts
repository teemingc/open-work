import type { CollectiveMatch } from './stats.remote';

const RECENT_KEY = 'invoicer:recent-collectives';
const MAX_RECENT = 6;

/** Collectives you visited, newest first. Kept in this browser only. */
export function readRecentCollectives(): CollectiveMatch[] {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
		if (!Array.isArray(stored)) return [];
		return stored
			.filter((item): item is CollectiveMatch => typeof item?.slug === 'string')
			.slice(0, MAX_RECENT);
	} catch {
		// Blocked or unreadable storage just means no recent collectives.
		return [];
	}
}

export function rememberCollective({ slug, name, imageUrl }: CollectiveMatch) {
	const recent = readRecentCollectives().filter((item) => item.slug !== slug);
	recent.unshift({ slug, name, imageUrl });
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
	} catch {
		// Nothing to remember it in.
	}
}
