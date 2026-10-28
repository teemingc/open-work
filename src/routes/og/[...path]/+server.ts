/**
 * The picture shown when a page is shared: `/og` followed by the page's path, like
 * `/og/collective/svelte`. A collective's says in a sentence how long it is funded for, and a
 * fund's what it has given; every other page shows its title and what it is for.
 */
import { read } from '$app/server';
import { env, waitUntil } from 'cloudflare:workers';
import { Resvg } from '@cf-wasm/resvg';
import { satori, type Font } from '@cf-wasm/satori';
import { collectiveImageVersion } from '#lib/share-image.js';
import { isFund } from '#lib/grants.js';
import { getCollectiveStats } from '#lib/collective-stats.remote.js';
import type { RequestHandler } from './$types';
import { collectiveCard, fundCard, given, logo } from './collective-card';
import { HEIGHT, WIDTH } from './draw';
import { homeCard, PAGES, pageCard } from './page-card';
import besleyLatin from './fonts/besley-700-latin.ttf?url';
import besleyLatinExt from './fonts/besley-700-latin-ext.ttf?url';
import serifLatin from './fonts/source-serif-4-400-latin.ttf?url';
import serifLatinExt from './fonts/source-serif-4-400-latin-ext.ttf?url';
import serifBoldLatin from './fonts/source-serif-4-600-latin.ttf?url';
import serifBoldLatinExt from './fonts/source-serif-4-600-latin-ext.ttf?url';

let fonts: Promise<Font[]> | undefined;

function loadFonts(): Promise<Font[]> {
	const load = async (name: string, weight: Font['weight'], url: string): Promise<Font> => ({
		name,
		weight,
		style: 'normal',
		data: await read(url).arrayBuffer()
	});
	fonts ??= Promise.all([
		load('Besley', 700, besleyLatin),
		load('Besley', 700, besleyLatinExt),
		load('Source Serif 4', 400, serifLatin),
		load('Source Serif 4', 400, serifLatinExt),
		load('Source Serif 4', 600, serifBoldLatin),
		load('Source Serif 4', 600, serifBoldLatinExt)
	]).catch((error) => {
		// Tried again on the next picture.
		fonts = undefined;
		throw error;
	});
	return fonts;
}

/** Long enough that the card of a collective nobody shares any more drops out. */
const KV_KEPT_FOR_SECONDS = 60 * 60 * 24 * 90;
/** A year, as long as caches keep anything. */
const FOREVER = 60 * 60 * 24 * 365;

/** Where a collective's card for one version of its figures is kept, shared by every data centre. */
const kvKey = (slug: string, version: string) => `og-image:${slug}:${version}`;

async function storedCard(slug: string, version: string): Promise<ArrayBuffer | undefined> {
	try {
		return (await env.OC_CACHE?.get(kvKey(slug, version), 'arrayBuffer')) ?? undefined;
	} catch {
		return undefined;
	}
}

async function storeCard(slug: string, version: string, png: Uint8Array): Promise<void> {
	try {
		await env.OC_CACHE?.put(kvKey(slug, version), png, { expirationTtl: KV_KEPT_FOR_SECONDS });
	} catch {
		// Drawn again next time.
	}
}

export const GET: RequestHandler = async ({ params, url }) => {
	const path = params.path.replace(/\/+$/, '').toLowerCase();
	// Cloudflare's shared cache, missing outside a Worker.
	const cache =
		typeof caches === 'undefined' ? undefined : (caches as unknown as { default?: Cache }).default;
	const key = new Request(url);
	const respond = (png: BufferSource, maxAge: number) => {
		const response = new Response(png, {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': `public, max-age=${maxAge}${maxAge === FOREVER ? ', immutable' : ''}`
			}
		});
		if (cache) waitUntil(cache.put(key, response.clone()));
		return response;
	};
	const cached = await cache?.match(key);
	if (cached) return cached;

	const slug = /^collective\/([a-z0-9][a-z0-9-]{0,99})$/.exec(path)?.[1];
	// A version names one set of figures, so its card never changes once drawn.
	const requested = url.searchParams.get('v');
	if (slug && requested) {
		const stored = await storedCard(slug, requested);
		if (stored) return respond(stored, FOREVER);
	}

	// An unknown collective, or one Open Collective could not tell us about, gets the plain card.
	const [stats, image] = slug
		? await Promise.all([getCollectiveStats(slug).catch(() => undefined), logo(slug)])
		: [];
	const page = PAGES[path];
	const element = !stats
		? page
			? pageCard(page)
			: homeCard()
		: isFund(stats)
			? fundCard(stats, image, await given(stats))
			: collectiveCard(stats, image);

	const svg = await satori(element, { width: WIDTH, height: HEIGHT, fonts: await loadFonts() });
	const png = (await Resvg.async(svg)).render().asPng() as Uint8Array<ArrayBuffer>;

	if (slug && stats) {
		// Kept only when asked for by its version, which was just found missing, so it is written once.
		if (requested === collectiveImageVersion(stats)) {
			waitUntil(storeCard(slug, requested, png));
			return respond(png, FOREVER);
		}
		// Asked for older figures, or none, this is only the latest card, which changes with them.
		return respond(png, 60 * 60);
	}
	// A plain card in a collective's place may only mean Open Collective was busy. The other pages
	// only change with a deploy.
	return respond(png, slug ? 5 * 60 : 24 * 60 * 60);
};
