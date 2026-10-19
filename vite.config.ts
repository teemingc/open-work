import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			// Consult https://svelte.dev/docs/kit/integrations
			// for more information about preprocessors
			preprocess: vitePreprocess(),
			compilerOptions: { experimental: { async: true } },
			experimental: { remoteFunctions: true },
			// Styles arrive with the page instead of in a request the first paint would wait on.
			inlineStyleThreshold: 128 * 1024,
			// The page holds your GitHub token and work log, so only this app's own scripts may run.
			csp: {
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Inline styles come from the inlined stylesheet, transitions and positioned popovers.
					'style-src': ['self', 'unsafe-inline'],
					'font-src': ['self'],
					'img-src': ['self', 'data:', 'https://images.opencollective.com'],
					// GitHub is asked from the browser, with your token.
					'connect-src': ['self', 'https://api.github.com'],
					'form-action': ['self'],
					'base-uri': ['self'],
					'object-src': ['none'],
					'frame-ancestors': ['none']
				}
			},
			adapter: adapter()
		})
	],
	// The OAuth app only allows the callback on this port, so fail rather than pick another one.
	server: { port: 5173, strictPort: true },
	test: {
		expect: { requireAssertions: true },

		projects: [
			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
