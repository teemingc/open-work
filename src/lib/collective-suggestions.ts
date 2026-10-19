/**
 * A few well-known open source collectives to try, so the Collective page is useful before you
 * search. All are collectives on Open Collective (not organizations or individuals). `about` is
 * each collective's own description from Open Collective, copied as written.
 */
export const SUGGESTED_COLLECTIVES = [
	{ slug: 'svelte', name: 'Svelte', about: 'Web development for the rest of us' },
	{
		slug: 'vuejs',
		name: 'Vue',
		about: 'We are on a mission to help more frontend devs enjoy building apps for the web.'
	},
	{
		slug: 'vite',
		name: 'Vite',
		about: 'We maintain Vite, a fast and simple build tool for the web.'
	},
	{
		slug: 'valibot',
		name: 'Valibot',
		about: 'The modular and type safe schema library for validating structural data in TypeScript'
	},
	{ slug: 'eslint', name: 'ESLint', about: 'The pluggable linting utility for JavaScript and JSX' }
] as const;

/**
 * A collective's logo; the address redirects to the current image. 64px tall covers the 32px it is
 * shown at on screens with twice the pixels.
 */
export function collectiveLogo(slug: string): string {
	return `https://images.opencollective.com/${slug}/logo/64.png`;
}
