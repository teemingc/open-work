import { describe, expect, it } from 'vitest';
import type { CollectiveStats } from '#lib/collective-stats.remote.js';
import { collectiveImageVersion } from './share-image';

const stats = {
	slug: 'svelte',
	name: 'Svelte',
	imageUrl: 'https://images.opencollective.com/svelte/logo.png',
	currency: 'USD',
	fetchedAt: '2026-10-22T08:00:00.000Z',
	months: [{ key: '2026-10', balance: 1000, received: 200, spent: 100 }],
	payouts: [],
	payeeImages: {},
	unpaid: []
} as unknown as CollectiveStats;

describe('collectiveImageVersion', () => {
	it('is keyed by the Monday of the week', () => {
		expect(collectiveImageVersion(stats)).toMatch(/^\d+-2026-10-19-[a-z0-9]+$/);
	});

	it('stays the same while the figures and the week do', () => {
		const later = { ...stats, fetchedAt: '2026-10-25T20:00:00.000Z' };
		expect(collectiveImageVersion(later)).toBe(collectiveImageVersion(stats));
	});

	it('changes with the figures', () => {
		const richer = { ...stats, months: [{ ...stats.months[0], balance: 1200 }] };
		expect(collectiveImageVersion(richer)).not.toBe(collectiveImageVersion(stats));
	});

	it('changes each week', () => {
		const next = { ...stats, fetchedAt: '2026-10-26T00:00:00.000Z' };
		expect(collectiveImageVersion(next)).not.toBe(collectiveImageVersion(stats));
	});
});
