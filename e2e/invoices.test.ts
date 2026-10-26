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
	await page.goto('/worklog/setup');
	await page.getByRole('button', { name: 'Add a client' }).click();
	await page.getByLabel('Per hour').first().fill('40');
	await page.getByLabel('Per hour').first().blur();
	await page.getByLabel('Invoiced through Open Collective').first().check();
	await expect.poll(async () => (await savedLog(page))?.clients[0]?.openCollective).toBe(true);
	await page.reload();
	await expect(page.getByLabel('Invoiced through Open Collective').first()).toBeChecked();
	await expect(page.getByLabel('Per hour').first()).toHaveValue('40');

	await page.goto('/worklog?month=2026-10');

	await page.getByLabel('Date').fill('2026-10-01');
	await page.getByLabel('Start').fill('22:00');
	await page.getByLabel('End').fill('01:30');
	await page.getByLabel('What you worked on').fill('sveltejs/kit/pull/17363');
	await expect(page.getByText('Pull request #17363 in sveltejs/kit.')).toBeVisible();
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
	await page.goto('/worklog/setup');
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
	// Leaving before the save answers would lose the cookie it sets.
	const saved = page.waitForResponse((response) => response.url().includes('/saveSettings'));
	await page.getByLabel('Invoice note').fill(' X123 ');
	await page.getByLabel('Invoice note').blur();
	await saved;
	await page.reload();

	await expect(page.getByLabel('Invoice note')).toHaveValue('X123');
});

test('a draft survives a reload', async ({ page }) => {
	await page.getByRole('button', { name: 'Start invoice' }).first().click();
	await page.getByLabel('Hours worked').fill('12');
	await page.reload();

	await expect(page.getByLabel('Hours worked')).toHaveValue('12');
	await expect(page.getByText('Typed by you.')).toBeVisible();
});

test('submitting stays disabled until Open Collective is connected', async ({ page }) => {
	await page.getByRole('button', { name: 'Start invoice' }).first().click();
	await page.getByLabel('Hours worked').fill('10');

	await expect(page.getByRole('button', { name: 'Submit to Open Collective' })).toBeDisabled();
});

test('the expense list asks you to connect Open Collective first', async ({ page }) => {
	await expect(page.getByRole('link', { name: 'Connect Open Collective' })).toBeVisible();
});

test('settings lists what is still needed and links to each field', async ({ page }) => {
	await page.goto('/settings');

	const needed = page.getByRole('alert').filter({ hasText: 'Still needed' });
	await expect(needed.getByRole('link', { name: 'Connect Open Collective' })).toBeVisible();
	await expect(needed.getByRole('link', { name: 'Choose a payout method' })).toHaveAttribute(
		'href',
		'#payout-method'
	);
});
