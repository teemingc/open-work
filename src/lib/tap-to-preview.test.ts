import { afterEach, describe, expect, it, vi } from 'vitest';
import { tapToPreview } from './tap-to-preview.js';

function pointer(hover: boolean) {
	vi.stubGlobal('matchMedia', () => ({ matches: hover }));
}

/** LayerChart calls the handler from the bar and again from the chart, with the same event. */
function tap(handler: ReturnType<typeof tapToPreview<object>>, data: object) {
	const event = new Event('click') as MouseEvent;
	handler(event, { data });
	handler(event, { data });
}

describe('tapToPreview', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('opens on the first click with a mouse', () => {
		pointer(true);
		const open = vi.fn();
		tap(tapToPreview(open), { month: '2026-01' });
		expect(open).toHaveBeenCalledOnce();
	});

	it('opens on the second tap on the same point with touch', () => {
		pointer(false);
		const open = vi.fn();
		const handler = tapToPreview(open);
		const january = { month: '2026-01' };
		tap(handler, january);
		expect(open).not.toHaveBeenCalled();
		tap(handler, january);
		expect(open).toHaveBeenCalledOnce();
	});

	it('previews a different point instead of opening it', () => {
		pointer(false);
		const open = vi.fn();
		const handler = tapToPreview(open);
		tap(handler, { month: '2026-01' });
		tap(handler, { month: '2026-02' });
		expect(open).not.toHaveBeenCalled();
	});
});
