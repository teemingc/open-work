import { expect, test } from '@playwright/test';

test.describe('Invoices List Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/invoices');
		await page.evaluate(() => localStorage.clear());
		await page.reload();
	});

	test('should display invoices page with title', async ({ page }) => {
		await page.goto('/invoices');

		await expect(page.getByRole('heading', { name: 'Invoices', level: 1 })).toBeVisible();
		await expect(page.getByText('Manage your monthly invoices')).toBeVisible();
	});

	test('should show create new invoice button', async ({ page }) => {
		await page.goto('/invoices');

		await expect(page.getByRole('button', { name: '+ Create New Invoice' })).toBeVisible();
	});

	test('should show filter and sort dropdowns', async ({ page }) => {
		await page.goto('/invoices');

		// Filter dropdown
		const filterSelect = page.locator('select').filter({ hasText: 'All Statuses' });
		await expect(filterSelect).toBeVisible();

		// Sort dropdown
		const sortSelect = page.locator('select').filter({ hasText: 'Newest First' });
		await expect(sortSelect).toBeVisible();
	});

	test('should show empty state when no invoices exist', async ({ page }) => {
		await page.goto('/invoices');

		await expect(page.getByText('No invoices found')).toBeVisible();
		await expect(page.getByText('Create your first invoice to get started')).toBeVisible();
	});

	test('should create new invoice and navigate to it', async ({ page }) => {
		await page.goto('/invoices');

		// Create new invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();

		// Should navigate to invoice detail page
		await expect(page).toHaveURL(/\/invoices\/\d{4}-\d{2}/);
	});

	test('should display created invoice in list', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();

		// Go back to list
		await page.goto('/invoices');

		// Should see the invoice in the list
		const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
		await expect(page.getByText(currentMonth)).toBeVisible();
		await expect(page.getByText('draft')).toBeVisible();
		await expect(page.getByText('0h')).toBeVisible();
	});

	test('should filter invoices by status', async ({ page }) => {
		await page.goto('/invoices');

		// Create an invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Should see draft invoice
		await expect(page.getByText('draft')).toBeVisible();

		// Filter by submitted
		await page.locator('select').filter({ hasText: 'All Statuses' }).selectOption('submitted');

		// Should show empty state since no submitted invoices
		await expect(page.getByText('No invoices found')).toBeVisible();

		// Filter back to all
		await page.locator('select').filter({ hasText: 'Submitted' }).selectOption('all');

		// Should see draft invoice again
		await expect(page.getByText('draft')).toBeVisible();
	});

	test('should sort invoices', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Change sort to oldest first
		await page.locator('select').filter({ hasText: 'Newest First' }).selectOption('oldest');

		// Should still display invoice (only one exists)
		const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
		await expect(page.getByText(currentMonth)).toBeVisible();

		// Change sort to most hours
		await page.locator('select').filter({ hasText: 'Oldest First' }).selectOption('hours');
		await expect(page.getByText(currentMonth)).toBeVisible();
	});

	test('should display invoice with status badge', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Should show status badge
		const statusBadge = page.locator('.rounded-full').filter({ hasText: 'draft' });
		await expect(statusBadge).toBeVisible();
	});

	test('should show Edit button for draft invoices', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Should show Edit button
		await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible();
	});

	test('should show Delete button for draft invoices', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Should show Delete button
		await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
	});

	test('should delete invoice when confirmed', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Should see invoice
		const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
		await expect(page.getByText(currentMonth)).toBeVisible();

		// Set up dialog handler to accept
		page.on('dialog', (dialog) => dialog.accept());

		// Click delete
		await page.getByRole('button', { name: 'Delete' }).click();

		// Should show empty state
		await expect(page.getByText('No invoices found')).toBeVisible();
	});

	test('should not delete invoice when cancelled', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Set up dialog handler to dismiss
		page.on('dialog', (dialog) => dialog.dismiss());

		// Click delete
		await page.getByRole('button', { name: 'Delete' }).click();

		// Invoice should still be visible
		const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long' });
		await expect(page.getByText(currentMonth)).toBeVisible();
	});

	test('should navigate to invoice detail when Edit clicked', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		const invoiceUrl = page.url();

		// Go back to list
		await page.goto('/invoices');

		// Click Edit
		await page.getByRole('link', { name: 'Edit' }).click();

		// Should navigate to invoice detail
		await expect(page).toHaveURL(invoiceUrl);
	});

	test('should group invoices by year', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Should show current year as heading
		const currentYear = new Date().getFullYear().toString();
		await expect(page.getByRole('heading', { name: currentYear })).toBeVisible();
	});

	test('should show alert when trying to create duplicate invoice', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice for current month
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Set up dialog handler to capture alert
		let alertShown = false;
		page.on('dialog', (dialog) => {
			alertShown = true;
			expect(dialog.message()).toContain('already exists');
			dialog.accept();
		});

		// Try to create another invoice for same month
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();

		// Alert should have been shown
		expect(alertShown).toBe(true);
	});

	test('should display invoice hours and amount', async ({ page }) => {
		// Set hourly rate first
		await page.goto('/settings');
		await page.getByLabel('Hourly Rate').fill('50');
		await page.getByRole('button', { name: 'Save Settings' }).click();

		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Should show hours
		await expect(page.getByText('⏱️ 0h')).toBeVisible();

		// Should show amount (0 * 50 = 0)
		await expect(page.getByText('💰 $0.00')).toBeVisible();
	});

	test('should display updated date for invoice', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Should show updated date
		const today = new Date().toLocaleDateString();
		await expect(page.getByText(`Updated ${today}`)).toBeVisible();
	});

	test('should filter draft invoices correctly', async ({ page }) => {
		await page.goto('/invoices');

		// Create invoice
		await page.getByRole('button', { name: '+ Create New Invoice' }).click();
		await page.goto('/invoices');

		// Filter by draft
		await page.locator('select').filter({ hasText: 'All Statuses' }).selectOption('draft');

		// Should see draft invoice
		await expect(page.getByText('draft')).toBeVisible();
	});

	test('should have all status filter options', async ({ page }) => {
		await page.goto('/invoices');

		const filterSelect = page.locator('select').filter({ hasText: 'All Statuses' });

		// Check all options exist
		await expect(filterSelect.locator('option[value="all"]')).toBeVisible();
		await expect(filterSelect.locator('option[value="draft"]')).toBeVisible();
		await expect(filterSelect.locator('option[value="submitted"]')).toBeVisible();
		await expect(filterSelect.locator('option[value="approved"]')).toBeVisible();
		await expect(filterSelect.locator('option[value="paid"]')).toBeVisible();
	});

	test('should have all sort options', async ({ page }) => {
		await page.goto('/invoices');

		const sortSelect = page.locator('select').filter({ hasText: 'Newest First' });

		// Check all options exist
		await expect(sortSelect.locator('option[value="newest"]')).toBeVisible();
		await expect(sortSelect.locator('option[value="oldest"]')).toBeVisible();
		await expect(sortSelect.locator('option[value="hours"]')).toBeVisible();
	});
});
