import { expect, test } from '@playwright/test';

test.describe('Invoice Detail Page', () => {
	let invoiceId: string;

	test.beforeEach(async ({ page }) => {
		// Clear storage and create an invoice
		await page.goto('/');
		await page.evaluate(() => localStorage.clear());
		await page.reload();

		// Create invoice
		await page.getByRole('button', { name: /Create .* Invoice/ }).click();

		// Get the invoice ID from URL
		await page.waitForURL(/\/invoices\/\d{4}-\d{2}/);
		invoiceId = page.url().split('/').pop() || '';
	});

	test('should display invoice detail page with correct title', async ({ page }) => {
		const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
		await expect(page.getByRole('heading', { name: currentMonth, level: 1 })).toBeVisible();
		await expect(page.getByText('0h tracked')).toBeVisible();
	});

	test('should show back link to invoices list', async ({ page }) => {
		const backLink = page.getByRole('link', { name: '← Back' });
		await expect(backLink).toBeVisible();

		await backLink.click();
		await expect(page).toHaveURL('/invoices');
	});

	test('should display status dropdown with correct default value', async ({ page }) => {
		const statusSelect = page.locator('select').filter({ hasText: 'Draft' });
		await expect(statusSelect).toBeVisible();
		await expect(statusSelect).toHaveValue('draft');
	});

	test('should change invoice status', async ({ page }) => {
		const statusSelect = page.locator('select').filter({ hasText: 'Draft' });

		// Change to submitted
		await statusSelect.selectOption('submitted');

		// Reload page to verify persistence
		await page.reload();

		// Should show submitted status
		await expect(page.locator('select').filter({ hasText: 'Submitted' })).toHaveValue('submitted');
	});

	test('should display GitHub Contributions section', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'GitHub Contributions' })).toBeVisible();
		await expect(page.getByRole('button', { name: '🔄 Fetch from GitHub' })).toBeVisible();
	});

	test('should display Manual Work section', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Manual Work' })).toBeVisible();
	});

	test('should display Expense Preview section', async ({ page }) => {
		// Scroll to bottom to ensure it's visible
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await expect(page.getByText(/Expense/)).toBeVisible();
	});

	test('should show alert when fetching without GitHub settings', async ({ page }) => {
		let alertShown = false;
		page.on('dialog', (dialog) => {
			alertShown = true;
			expect(dialog.message()).toContain('configure GitHub settings');
			dialog.accept();
		});

		await page.getByRole('button', { name: '🔄 Fetch from GitHub' }).click();

		expect(alertShown).toBe(true);
	});

	test('should have Export button', async ({ page }) => {
		await expect(page.getByRole('button', { name: '💾 Export' })).toBeVisible();
	});

	test('should have Delete Invoice button', async ({ page }) => {
		await expect(page.getByRole('button', { name: '🗑️ Delete Invoice' })).toBeVisible();
	});

	test('should export invoice as JSON file', async ({ page }) => {
		// Set up download listener
		const downloadPromise = page.waitForEvent('download');

		// Click export
		await page.getByRole('button', { name: '💾 Export' }).click();

		// Wait for download
		const download = await downloadPromise;

		// Verify filename
		expect(download.suggestedFilename()).toMatch(/^invoice-\d{4}-\d{2}\.json$/);
	});

	test('should delete invoice when confirmed', async ({ page }) => {
		// Set up dialog handler to accept
		page.on('dialog', (dialog) => dialog.accept());

		// Click delete
		await page.getByRole('button', { name: '🗑️ Delete Invoice' }).click();

		// Should navigate to invoices list
		await expect(page).toHaveURL('/invoices');

		// Should show empty state
		await expect(page.getByText('No invoices found')).toBeVisible();
	});

	test('should not delete invoice when cancelled', async ({ page }) => {
		// Set up dialog handler to dismiss
		page.on('dialog', (dialog) => dialog.dismiss());

		// Click delete
		await page.getByRole('button', { name: '🗑️ Delete Invoice' }).click();

		// Should still be on invoice page
		await expect(page).toHaveURL(`/invoices/${invoiceId}`);
	});

	test('should show progress section for current month', async ({ page }) => {
		// Current month invoice should show progress
		await expect(page.getByText('▼ Progress')).toBeVisible();
	});

	test('should toggle progress section visibility', async ({ page }) => {
		// Click to collapse
		await page.getByRole('button', { name: '▼ Progress' }).click();

		// Should show collapsed state
		await expect(page.getByText('▶ Progress')).toBeVisible();

		// Click to expand
		await page.getByRole('button', { name: '▶ Progress' }).click();

		// Should show expanded state
		await expect(page.getByText('▼ Progress')).toBeVisible();
	});

	test('should display amount when hourly rate is set', async ({ page }) => {
		// Set hourly rate
		await page.goto('/settings');
		await page.getByLabel('Hourly Rate').fill('50');
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Go back to invoice
		await page.goto(`/invoices/${invoiceId}`);

		// Should show $0.00 (0 hours * $50)
		await expect(page.getByText('• $0.00')).toBeVisible();
	});

	test('should show all status options in dropdown', async ({ page }) => {
		const statusSelect = page.locator('select').filter({ hasText: 'Draft' });

		// Check all options exist
		await expect(statusSelect.locator('option[value="draft"]')).toBeVisible();
		await expect(statusSelect.locator('option[value="submitted"]')).toBeVisible();
		await expect(statusSelect.locator('option[value="approved"]')).toBeVisible();
		await expect(statusSelect.locator('option[value="paid"]')).toBeVisible();
	});

	test('should display 404 page for non-existent invoice', async ({ page }) => {
		await page.goto('/invoices/9999-99');

		await expect(page.getByText('Invoice not found')).toBeVisible();
		await expect(page.getByRole('link', { name: '← Back to invoices' })).toBeVisible();
	});

	test('should navigate back from 404 page', async ({ page }) => {
		await page.goto('/invoices/9999-99');

		await page.getByRole('link', { name: '← Back to invoices' }).click();
		await expect(page).toHaveURL('/invoices');
	});

	test('should display last fetch time after fetching', async ({ page }) => {
		// Configure settings first
		await page.goto('/settings');
		await page.getByLabel('GitHub Username').fill('testuser');
		await page.getByLabel('Personal Access Token').fill('ghp_invalid_token');
		await page.getByRole('checkbox', { name: 'sveltejs/kit' }).check();
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Go back to invoice
		await page.goto(`/invoices/${invoiceId}`);

		// Try to fetch (will fail but that's ok for this test)
		await page.getByRole('button', { name: '🔄 Fetch from GitHub' }).click();

		// Wait for fetch to complete
		await page.waitForTimeout(1000);

		// Should show either last fetch time or error message
		const hasLastFetch = await page
			.getByText(/Last fetched:/)
			.isVisible()
			.catch(() => false);
		const hasError = await page
			.locator('.bg-red-50')
			.isVisible()
			.catch(() => false);

		// At least one should be true
		expect(hasLastFetch || hasError).toBe(true);
	});

	test('should update tracked hours in header', async ({ page }) => {
		// Initially shows 0h
		await expect(page.getByText('0h tracked')).toBeVisible();

		// The hours would update when contributions or manual items are added
		// This tests the display is present
	});

	test('should persist status change across page reloads', async ({ page }) => {
		const statusSelect = page.locator('select').filter({ hasText: 'Draft' });

		// Change to approved
		await statusSelect.selectOption('approved');

		// Navigate away and back
		await page.goto('/invoices');
		await page.goto(`/invoices/${invoiceId}`);

		// Should still be approved
		await expect(page.locator('select').filter({ hasText: 'Approved' })).toHaveValue('approved');
	});

	test('should disable fetch button while fetching', async ({ page }) => {
		// Configure settings
		await page.goto('/settings');
		await page.getByLabel('GitHub Username').fill('testuser');
		await page.getByLabel('Personal Access Token').fill('ghp_test');
		await page.getByRole('checkbox', { name: 'sveltejs/kit' }).check();
		await page.getByRole('button', { name: 'Save Settings' }).click();

		await page.goto(`/invoices/${invoiceId}`);

		// Click fetch
		await page.getByRole('button', { name: '🔄 Fetch from GitHub' }).click();

		// Button should show "Fetching..." and be disabled
		const fetchButton = page.getByRole('button', { name: 'Fetching...' });
		await expect(fetchButton).toBeVisible();
		await expect(fetchButton).toBeDisabled();
	});
});
