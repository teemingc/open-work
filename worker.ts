/**
 * The Worker: SvelteKit's, built by the adapter from `wrangler.kit.jsonc`, with a schedule added.
 * A scheduled run may take minutes, where a request's work stops soon after its response, so
 * scans too slow for a page are kept fresh from here.
 */

import kit from './.svelte-kit/cloudflare/_worker.js';

export default {
	fetch: kit.fetch,
	async scheduled(_controller, env, ctx) {
		// From the site itself, as SvelteKit refuses a POST from anywhere else.
		const origin = 'https://openwork.ing';
		const response = await kit.fetch!(
			new Request(`${origin}/contributors/refresh`, { method: 'POST', headers: { origin } }),
			env,
			ctx
		);
		if (!response.ok) throw new Error(`Refreshing the leaderboard failed (${response.status}).`);
	}
} satisfies ExportedHandler<Env>;
