import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipLink } from './tooltip-link.svelte.js';

function pointer(hover: boolean) {
	vi.stubGlobal('matchMedia', () => ({ matches: hover }));
}

/** LayerChart calls the handler from the bar and again from the chart, with the same event. */
function click(link: TooltipLink<{ month: string }>, data: { month: string }) {
	const event = { target: { closest: () => null } } as unknown as MouseEvent;
	link.click(event, { data });
	link.click(event, { data });
}

/** A finger touching down somewhere, in the tooltip or not. The document stands in for its target. */
function touch(inTooltip: boolean) {
	Object.assign(document, { closest: () => (inTooltip ? {} : null) });
	document.dispatchEvent(new Event('pointerover'));
}

const url = ({ month }: { month: string }) => `https://example.com/${month}`;

describe('TooltipLink', () => {
	beforeEach(() => {
		vi.stubGlobal('document', new EventTarget());
		vi.stubGlobal('window', Object.assign(new EventTarget(), { open: vi.fn() }));
		pointer(false);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('opens the link once with a mouse', () => {
		pointer(true);
		const link = new TooltipLink(url);
		click(link, { month: '2026-01' });
		expect(window.open).toHaveBeenCalledExactlyOnceWith(
			'https://example.com/2026-01',
			'_blank',
			'noopener'
		);
		expect(link.locked).toBe(false);
		expect(link.href({ month: '2026-01' })).toBeUndefined();
	});

	it('shows the link with touch before it pins', () => {
		const link = new TooltipLink(url);
		expect(link.href({ month: '2026-01' })).toBe('https://example.com/2026-01');
		expect(link.locked).toBe(false);
	});

	it('pins the tapped point with touch', () => {
		const onpin = vi.fn();
		const link = new TooltipLink(url, onpin);
		const january = { month: '2026-01' };
		click(link, january);
		expect(link.locked).toBe(true);
		expect(onpin).toHaveBeenCalledWith(january);
		expect(window.open).not.toHaveBeenCalled();
	});

	it('does not pin a point with nothing to link to', () => {
		const link = new TooltipLink<{ month: string }>(() => undefined);
		click(link, { month: '2026-01' });
		expect(link.locked).toBe(false);
	});

	it('moves to the next tapped point', () => {
		const onpin = vi.fn();
		const link = new TooltipLink(url, onpin);
		const february = { month: '2026-02' };
		click(link, { month: '2026-01' });
		click(link, february);
		expect(link.locked).toBe(true);
		expect(onpin).toHaveBeenLastCalledWith(february);
	});

	it('lets go when a finger touches anywhere but the tooltip', async () => {
		const onpin = vi.fn();
		const link = new TooltipLink(url, onpin);
		click(link, { month: '2026-01' });
		// Svelte listens for pointer events a microtask later.
		await Promise.resolve();
		touch(true);
		expect(link.locked).toBe(true);
		touch(false);
		expect(link.locked).toBe(false);
		expect(onpin).toHaveBeenLastCalledWith(undefined);
	});

	it('lets go when the page scrolls', () => {
		const link = new TooltipLink(url);
		click(link, { month: '2026-01' });
		window.dispatchEvent(new Event('scroll'));
		expect(link.locked).toBe(false);
	});

	it('lets go on Escape', () => {
		const link = new TooltipLink(url);
		click(link, { month: '2026-01' });
		document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
		expect(link.locked).toBe(false);
	});
});
