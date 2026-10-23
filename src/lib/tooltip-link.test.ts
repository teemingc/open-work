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

const url = ({ month }: { month: string }) => `https://example.com/${month}`;

describe('TooltipLink', () => {
	beforeEach(() => {
		vi.stubGlobal('document', new EventTarget());
		vi.stubGlobal('window', { open: vi.fn() });
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

	it('pins the tapped point with touch', () => {
		const link = new TooltipLink(url);
		const january = { month: '2026-01' };
		click(link, january);
		expect(link.locked).toBe(true);
		expect(link.href(january)).toBe('https://example.com/2026-01');
		expect(window.open).not.toHaveBeenCalled();
	});

	it('does not pin a point with nothing to link to', () => {
		const link = new TooltipLink<{ month: string }>(() => undefined);
		click(link, { month: '2026-01' });
		expect(link.locked).toBe(false);
	});

	it('lets go on the next tap', () => {
		const link = new TooltipLink(url);
		click(link, { month: '2026-01' });
		click(link, { month: '2026-02' });
		expect(link.locked).toBe(false);
	});

	it('lets go on Escape', () => {
		const link = new TooltipLink(url);
		click(link, { month: '2026-01' });
		document.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
		expect(link.locked).toBe(false);
	});
});
