import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

// Matches the Google OAuth redirect URI registered for local development.
const DEV_PORT = 5317;

/** Warns when Vite falls back to another port, since the OAuth callback only works on {@link DEV_PORT}. */
function warnOnPortFallback(): Plugin {
	return {
		name: 'warn-on-port-fallback',
		apply: 'serve',
		configureServer(server) {
			server.httpServer?.once('listening', () => {
				const address = server.httpServer?.address();
				if (typeof address === 'object' && address && address.port !== DEV_PORT) {
					server.config.logger.warn(
						`Port ${DEV_PORT} is in use, so the dev server started on ${address.port}. Google sign-in will fail because its OAuth callback is registered for http://localhost:${DEV_PORT}.`
					);
				}
			});
		}
	};
}

export default defineConfig({
	server: { port: DEV_PORT },
	plugins: [
		warnOnPortFallback(),
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
