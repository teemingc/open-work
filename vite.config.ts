import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			compilerOptions: { experimental: { async: true } },
			experimental: { remoteFunctions: true },
			// The page holds users GitHub token and work log, so ensure only this app's own scripts may run.
			csp: {
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					// Inline styles come from transitions and positioned popovers.
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
	test: {
		expect: { requireAssertions: true },

		projects: [
			{
				extends: './vite.config.ts',

				test: {
					name: 'server',
					// TODO: use workerd once it supports vitest 5 https://developers.cloudflare.com/workers/testing/vitest-integration/
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
