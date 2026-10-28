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
	it('stays the same while the figures and the month do', () => {
		const later = { ...stats, fetchedAt: '2026-10-29T20:00:00.000Z' };
		expect(collectiveImageVersion(later)).toBe(collectiveImageVersion(stats));
	});

	it('changes with the figures', () => {
		const richer = { ...stats, months: [{ ...stats.months[0], balance: 1200 }] };
		expect(collectiveImageVersion(richer)).not.toBe(collectiveImageVersion(stats));
	});

	it('changes each month', () => {
		const next = { ...stats, fetchedAt: '2026-11-01T00:00:00.000Z' };
		expect(collectiveImageVersion(next)).not.toBe(collectiveImageVersion(stats));
	});
});
