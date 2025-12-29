import { expect, test } from '@playwright/test';

test.describe('Homepage', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => localStorage.clear());
		await page.reload();
	});

	test('should display homepage with title', async ({ page }) => {
		await page.goto('/');

		await expect(
			page.getByRole('heading', { name: 'OpenCollective Invoice Generator', level: 1 })
		).toBeVisible();
		await expect(
			page.getByText('Track your Svelte contributions and generate expense submissions')
		).toBeVisible();
	});

	test('should show create invoice prompt when no invoices exist', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('heading', { name: 'Start Tracking This Month' })).toBeVisible();
		await expect(page.getByRole('button', { name: /Create .* Invoice/ })).toBeVisible();
	});

	test('should display quick stats', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByText('Total Invoices')).toBeVisible();
		await expect(page.getByText('Unpaid Hours')).toBeVisible();
	});

	test('should show setup warning when settings incomplete', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByRole('heading', { name: 'Complete Setup' })).toBeVisible();
		await expect(page.getByText('Configure your GitHub token and repositories')).toBeVisible();

		// Click the setup link
		await page.getByRole('link', { name: 'Go to Settings' }).click();
		await expect(page).toHaveURL('/settings');
	});

	test('should create current month invoice and navigate to it', async ({ page }) => {
		await page.goto('/');

		// Click create invoice button
		await page.getByRole('button', { name: /Create .* Invoice/ }).click();

		// Should navigate to the invoice page
		await expect(page).toHaveURL(/\/invoices\/\d{4}-\d{2}/);
	});

	test('should show current month progress after invoice is created', async ({ page }) => {
		await page.goto('/');

		// Create invoice
		await page.getByRole('button', { name: /Create .* Invoice/ }).click();

		// Go back to homepage
		await page.goto('/');

		// Should show progress section
		const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
		await expect(page.getByText(`${currentMonth} Progress`)).toBeVisible();
		await expect(page.getByRole('link', { name: 'Continue Editing →' })).toBeVisible();
	});

	test('should display stats with correct initial values', async ({ page }) => {
		await page.goto('/');

		// Initially should show 0 invoices
		const totalInvoices = page
			.locator('.bg-white.border.rounded-lg')
			.filter({ hasText: 'Total Invoices' });
		await expect(totalInvoices).toContainText('0');

		const unpaidHours = page
			.locator('.bg-white.border.rounded-lg')
			.filter({ hasText: 'Unpaid Hours' });
		await expect(unpaidHours).toContainText('0h');
		await expect(unpaidHours).toContainText('0 invoices');
	});

	test('should display unpaid amount when hourly rate is set', async ({ page }) => {
		// Set hourly rate first
		await page.goto('/settings');
		await page.getByLabel('Hourly Rate').fill('50');
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Go to homepage
		await page.goto('/');

		// Should show unpaid amount card
		await expect(page.getByText('Unpaid Amount')).toBeVisible();
	});

	test('should update stats after creating invoice', async ({ page }) => {
		await page.goto('/');

		// Create invoice
		await page.getByRole('button', { name: /Create .* Invoice/ }).click();

		// Go back to homepage
		await page.goto('/');

		// Stats should update to show 1 invoice
		const totalInvoices = page
			.locator('.bg-white.border.rounded-lg')
			.filter({ hasText: 'Total Invoices' });
		await expect(totalInvoices).toContainText('1');
	});
});
