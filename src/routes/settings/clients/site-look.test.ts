import { describe, expect, it } from 'vitest';
import { siteIcons, siteUrl } from './site-look';

const base = new URL('https://www.zenos.com/');

describe('siteUrl', () => {
	it('takes a bare domain as its https homepage', () => {
		expect(siteUrl('zenos.com')?.href).toBe('https://zenos.com/');
		expect(siteUrl('https://zenos.com/about?x=1')?.href).toBe('https://zenos.com/');
	});

	it('refuses addresses that are not public websites', () => {
		for (const text of ['', 'localhost', 'http://127.0.0.1', 'http://[::1]', 'printer.local']) {
			expect(siteUrl(text)).toBeUndefined();
		}
	});
});

describe('siteIcons', () => {
	it('puts an SVG icon first, then the largest, then the favicon', () => {
		const html = `
			<link rel="icon" sizes="96x96" href="/96.png">
			<link rel="icon" type="image/svg+xml" href="/_app/favicon.svg"/>
			<link rel="apple-touch-icon" sizes="180x180" href="data:image/png;base64,AAAA">`;
		expect(siteIcons(html, base)).toEqual([
			'https://www.zenos.com/_app/favicon.svg',
			'data:image/png;base64,AAAA',
			'https://www.zenos.com/96.png',
			'https://www.zenos.com/favicon.ico'
		]);
	});

	it('falls back to the favicon', () => {
		expect(siteIcons('<title>Zenos</title>', base)).toEqual(['https://www.zenos.com/favicon.ico']);
	});
});
