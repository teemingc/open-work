import { describe, expect, it } from 'vitest';
import { rankMatches, searchTerms, slugFor, type SearchMatch } from './collective-search';

const match = (slug: string, name = slug, backers = 0): SearchMatch => ({
	slug,
	name,
	imageUrl: null,
	backers
});

describe('searchTerms', () => {
	it('searches a term with punctuation as typed and without it', () => {
		expect(searchTerms('bombshell-d')).toEqual(['bombshell-d', 'bombshelld']);
		expect(searchTerms('vue js')).toEqual(['vue js', 'vuejs']);
	});

	it('searches a website address by its name too', () => {
		expect(searchTerms('bomb.sh')).toEqual(['bomb.sh', 'bombsh', 'bomb']);
		expect(searchTerms('bombshell.dev')).toEqual(['bombshell.dev', 'bombshelldev', 'bombshell']);
		expect(searchTerms('vue.js')).toEqual(['vue.js', 'vuejs', 'vue']);
		expect(searchTerms('https://www.astro.build/')).toEqual([
			'https://www.astro.build/',
			'httpswwwastrobuild',
			'astro'
		]);
	});

	it('searches a term without punctuation once', () => {
		for (const term of ['bomb', 'bombshell', 'bombsh', 'vite']) {
			expect(searchTerms(term)).toEqual([term]);
		}
	});
});

describe('slugFor', () => {
	it('turns a name into the slug it would be', () => {
		expect(slugFor('node.js')).toBe('nodejs');
		expect(slugFor('bombshell dev')).toBe('bombshell-dev');
		expect(slugFor('...')).toBeNull();
	});
});

describe('rankMatches', () => {
	it('puts names and slugs that start with the term first, shortest first', () => {
		const matches = [
			match('food-not-bombs'),
			match('bombastictranz', 'Bombastictranz'),
			match('bombshell-dev', 'Bombshell')
		];
		expect(rankMatches('bomb', matches).map((m) => m.slug)).toEqual([
			'bombshell-dev',
			'bombastictranz',
			'food-not-bombs'
		]);
	});

	it('puts those with numbers after the term after those without', () => {
		const matches = [match('node9'), match('nodejs', 'Node.js'), match('node-argon2')];
		expect(rankMatches('node', matches).map((m) => m.slug)).toEqual([
			'nodejs',
			'node9',
			'node-argon2'
		]);
		expect(rankMatches('web3', [match('web3js'), match('web3')])[0].slug).toBe('web3');
		expect(rankMatches('web', [match('web3'), match('webpack')])[0].slug).toBe('webpack');
	});

	it('puts the more popular first among those that match the term', () => {
		const matches = [
			match('vue'),
			match('vue-rx'),
			match('vuejs', 'Vue.js', 902),
			match('vue-gl', 'vue-gl', 1),
			match('easy-vue', 'Easy Vue', 5000)
		];
		expect(rankMatches('vue', matches).map((m) => m.slug)).toEqual([
			'vuejs',
			'vue',
			'vue-rx',
			'vue-gl',
			'easy-vue'
		]);
	});

	it('puts a slug that is the term before a name that is the term', () => {
		const matches = [
			match('jsslakcom', 'NODE JS'),
			match('node-js-africa', 'Node.js Africa'),
			match('nodejs', 'Node.js')
		];
		expect(rankMatches('node js', matches).map((m) => m.slug)).toEqual([
			'nodejs',
			'jsslakcom',
			'node-js-africa'
		]);
	});

	it('ignores punctuation when comparing', () => {
		const matches = [match('other'), match('bombshell-dev', 'Bombshell')];
		expect(rankMatches('bombshell-d', matches)[0].slug).toBe('bombshell-dev');
		expect(rankMatches('bombshell dev', matches)[0].slug).toBe('bombshell-dev');
	});

	it('drops repeats and keeps at most eight', () => {
		const matches = [match('a'), match('a'), ...'bcdefghij'.split('').map((slug) => match(slug))];
		const ranked = rankMatches('zz', matches);
		expect(ranked.map((m) => m.slug)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
	});
});
