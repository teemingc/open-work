import { expect, test, type Page } from '@playwright/test';
import type { WorkLogData } from '../src/lib/worklog';

/**
 * The work log as saved in IndexedDB. Saving finishes just after the change that caused it, so
 * poll this before leaving a page, or the save can be cut short.
 */
function savedLog(page: Page): Promise<WorkLogData | undefined> {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('open-work', 1);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		try {
			if (!db.objectStoreNames.contains('worklog')) return undefined;
			return await new Promise<WorkLogData | undefined>((resolve, reject) => {
				const request = db.transaction('worklog').objectStore('worklog').get('log');
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		} finally {
			db.close();
		}
	});
}

/**
 * Mark the first client as invoiced through Open Collective. Choosing its collective in settings
 * searches Open Collective, which the tests leave alone.
 */
function invoiceFirstClientThroughOpenCollective(page: Page) {
	return page.evaluate(async () => {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('open-work', 1);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		try {
			await new Promise<void>((resolve, reject) => {
				const store = db.transaction('worklog', 'readwrite').objectStore('worklog');
				const request = store.get('log');
				request.onsuccess = () => {
					const log = request.result;
					log.clients[0] = { ...log.clients[0], openCollective: true, collective: 'svelte' };
					store.put(log, 'log').onsuccess = () => resolve();
				};
				request.onerror = () => reject(request.error);
			});
		} finally {
			db.close();
		}
	});
}

/** Type a time, like `1000P` for 10:00 PM, into a field with a segment for each part. */
async function typeTime(page: Page, label: string, keys: string) {
	await page.getByRole('group', { name: label }).getByRole('spinbutton').first().click();
	await page.keyboard.type(keys);
}

test.beforeEach(async ({ page }) => {
	await page.goto('/invoices');
	await page.evaluate(() => localStorage.clear());
	await page.reload();
});

test('starting an invoice shows the total and wording as you type hours', async ({ page }) => {
	await page.getByRole('button', { name: 'Start invoice' }).first().click();
	await expect(page).toHaveURL(/\/invoices\/.+/);

	await page.getByLabel(/Rate per hour/).fill('40');
	await page.getByLabel('Hours worked').fill('41');

	await expect(page.getByText('$1,640.00').first()).toBeVisible();
	await expect(
		page.getByText(/^41 hours of work from .* at a rate of 40 USD per hour$/)
	).toBeVisible();
});

test('time logged in the work log fills the invoice for that period', async ({ page }) => {
	// A new user starts with no clients: add the one invoiced through Open Collective.
	await page.goto('/settings/clients');
	await page.getByRole('button', { name: 'Add a client' }).click();
	await page.getByLabel('Per hour', { exact: true }).first().fill('40');
	await page.getByLabel('Per hour', { exact: true }).first().blur();
	await expect.poll(async () => (await savedLog(page))?.clients[0]?.rate).toBe(40);
	await invoiceFirstClientThroughOpenCollective(page);
	await page.reload();
	await expect(page.getByLabel('Per hour', { exact: true }).first()).toHaveValue('40');

	await page.goto('/worklog?month=2026-10');

	await page.getByLabel('Date').fill('2026-10-01');
	await typeTime(page, 'Start', '1000P');
	await typeTime(page, 'End', '0130A');
	await page.getByLabel('What you worked on').fill('sveltejs/kit/pull/17363');
	await expect(
		page.getByText('Pull request #17363 in sveltejs/kit', { exact: true })
	).toBeVisible();
	await page.getByLabel('What you worked on').press('Enter');
	await page.getByLabel('What you worked on').fill('Thu full-time maintainers meeting');
	await page.getByRole('button', { name: 'Log it' }).click();

	await expect(page.getByText('3.5 h').first()).toBeVisible();
	await expect(page.getByRole('link', { name: 'PR #17363' })).toHaveAttribute(
		'href',
		'https://github.com/sveltejs/kit/pull/17363'
	);
	await expect.poll(async () => (await savedLog(page))?.entries.length).toBe(1);

	await page.goto('/invoices/new?start=2026-10-01&end=2026-10-15');
	await expect(page.getByLabel('Hours worked')).toHaveValue('3.5');
	await expect(page.getByText('$140.00').first()).toBeVisible();
	await expect(page.getByText('Thu full-time maintainers meeting').first()).toBeVisible();

	await page.getByLabel('Hours worked').fill('5');
	await page.getByRole('button', { name: 'Use logged (3.5)' }).click();
	await expect(page.getByLabel('Hours worked')).toHaveValue('3.5');
});

test('pasted holidays come off the working days', async ({ page }) => {
	await page.goto('/settings/time-off');
	await page.getByText('Import from CSV or paste').first().click();
	await page
		.getByLabel('Rows')
		.first()
		.fill('date,name\n07/07/2026,George Town World Heritage City Day');
	await page.getByRole('button', { name: 'Add these rows' }).first().click();
	await expect(page.getByText('Added 1.')).toBeVisible();
	await expect.poll(async () => (await savedLog(page))?.holidays.length).toBe(1);

	await page.goto('/worklog?month=2026-07');
	// 23 weekdays in July 2026, less the holiday, at 8 h each.
	await expect(page.getByText('Of 176 h expected this month')).toBeVisible();
});

test('settings save automatically and the setup warning lists what is missing', async ({
	page
}) => {
	await expect(page.getByText('Finish setup to submit invoices')).toBeVisible();

	await page
		.getByRole('navigation', { name: 'Work' })
		.getByRole('link', { name: /Settings/ })
		.click();
	await page
		.getByRole('navigation', { name: 'Settings' })
		.getByRole('link', { name: 'Invoicing' })
		.click();
	await page.getByLabel('Notes').fill(' X123 ');
	await page.getByLabel('Notes').blur();
	await expect.poll(async () => (await savedLog(page))?.invoicing?.notes).toBe('X123');
	await page.reload();

	await expect(page.getByLabel('Notes')).toHaveValue('X123');
});

test('a draft survives a reload', async ({ page }) => {
	await page.getByRole('button', { name: 'Start invoice' }).first().click();
	await page.getByLabel('Hours worked').fill('12');
	await page.reload();

	await expect(page.getByLabel('Hours worked')).toHaveValue('12');
});

test('submitting stays disabled until Open Collective is connected', async ({ page }) => {
	await page.getByRole('button', { name: 'Start invoice' }).first().click();
	await page.getByLabel('Hours worked').fill('10');

	await expect(page.getByRole('button', { name: 'Submit to Open Collective' })).toBeDisabled();
});

test('settings lists what is still needed and links to each field', async ({ page }) => {
	await page.goto('/settings/invoicing');

	const needed = page.getByRole('alert').filter({ hasText: 'Still needed' });
	await expect(needed.getByRole('link', { name: 'Connect Open Collective' })).toBeVisible();
	await expect(needed.getByRole('link', { name: 'Choose a payout method' })).toHaveAttribute(
		'href',
		'#payout-method'
	);
});
