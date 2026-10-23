export interface CollectiveMatch {
	slug: string;
	name: string;
	imageUrl: string | null;
}

/** How many matches the search lists. */
export const MAX_MATCHES = 8;

const FUNDED_TYPES = new Set(['COLLECTIVE', 'PROJECT', 'FUND']);

/**
 * Whether an account looked up by its exact slug has money of its own to show. Some projects, like
 * Node.js and Bombshell, are organizations that hold their own funds rather than collectives.
 */
export function isFunded(account: { type: string; isHost: boolean }): boolean {
	return FUNDED_TYPES.has(account.type) || (account.type === 'ORGANIZATION' && account.isHost);
}

/** The slug a term would be, like "nodejs" for "Node.js", or null if it cannot be one. */
export function slugFor(term: string): string | null {
	const slug = term.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
	return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? slug : null;
}

/**
 * The terms to search for, as typed first. Open Collective's search treats "." and "-" its own way
 * and no one spelling finds everything: "vuejs" finds Vue where "vue.js" does not, and "node.js"
 * finds Node.js where "node js" does not. So a term with punctuation is searched without it too.
 * Nothing is found for a website address like "bomb.sh" or "bombshell.dev" either, so one is also
 * searched by its name before the last dot.
 */
export function searchTerms(term: string): string[] {
	const domain = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.[a-z]{2,}\/?$/.exec(
		term
	);
	const terms = [term, squash(term), ...(domain && domain[1].length >= 2 ? [domain[1]] : [])];
	return [...new Set(terms.filter((t) => t.length >= 2))];
}

/** "bombshell-dev", "Bombshell dev" and "bombshell.dev" all read as "bombshelldev". */
function squash(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A match to rank, with how many backers it has. */
export interface SearchMatch extends CollectiveMatch {
	backers: number;
}

/**
 * How popular a match is, by the order of magnitude of its backers: 0 under ten, 1 in the tens, 2
 * in the hundreds and so on. Rough on purpose, so a backer or two does not outweigh a closer match.
 */
function popularity(backers: number): number {
	return backers < 10 ? 0 : Math.floor(Math.log10(backers));
}

/**
 * The matches without repeats, ranked by how closely they match the term, ignoring punctuation: a
 * slug that is the term, then a name that is the term, then a slug or name that starts with it,
 * then the rest. So "node js" puts Node.js (nodejs) before a collective only named "NODE JS".
 * Those that start with the term go without numbers after it first, then shortest first, as the
 * closest to it: "bomb" puts Bombshell before Bombastictranz, and "node" puts Node.js before
 * node9. Among all that match or start with the term, the more popular go first, so "vue" puts
 * Vue (vuejs, hundreds of backers) before vue-rx. Otherwise the order given is kept.
 */
export function rankMatches(term: string, matches: SearchMatch[]): SearchMatch[] {
	const start = squash(term);
	const seen = new Set<string>();
	const unique = matches.filter((match) => !seen.has(match.slug) && seen.add(match.slug));
	const closeness = (match: SearchMatch): number[] | null => {
		const slug = squash(match.slug);
		const name = squash(match.name);
		if (start === '') return null;
		if (slug === start) return [0];
		if (name === start) return [1];
		const closest = [slug, name]
			.filter((text) => text.startsWith(start))
			.map((text) => [/\d/.test(text.slice(start.length)) ? 1 : 0, text.length])
			.sort(compare)[0];
		return closest ? [2, ...closest] : null;
	};
	const rank = (match: SearchMatch): number[] => {
		const close = closeness(match);
		return close ? [0, -popularity(match.backers), ...close] : [1];
	};
	const ranks = new Map(unique.map((match) => [match, rank(match)]));
	// Array sort is stable, so matches that rank the same keep their order.
	return unique.sort((a, b) => compare(ranks.get(a)!, ranks.get(b)!)).slice(0, MAX_MATCHES);
}

/** Compares two lists of numbers by their first difference. */
function compare(a: number[], b: number[]): number {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const difference = (a[i] ?? 0) - (b[i] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}
