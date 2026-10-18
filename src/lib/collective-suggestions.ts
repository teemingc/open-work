/**
 * A few well-known open source collectives to try, so the Collective page is useful before you
 * search. All are collectives on Open Collective (not organizations or individuals).
 */
export const SUGGESTED_COLLECTIVES = [
	{ slug: 'svelte', name: 'Svelte', about: 'Web UI framework' },
	{ slug: 'vuejs', name: 'Vue', about: 'Web UI framework' },
	{ slug: 'vite', name: 'Vite', about: 'Frontend build tool' },
	{ slug: 'valibot', name: 'Valibot', about: 'Schema validation' },
	{ slug: 'eslint', name: 'ESLint', about: 'JavaScript linter' }
] as const;

/** A collective's logo; the address redirects to the current image. */
export function collectiveLogo(slug: string): string {
	return `https://images.opencollective.com/${slug}/logo/128.png`;
}
