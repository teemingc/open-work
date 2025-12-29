import { expect, test } from '@playwright/test';

test.describe('Settings Page', () => {
	test.beforeEach(async ({ page }) => {
		// Clear localStorage before each test
		await page.goto('/settings');
		await page.evaluate(() => localStorage.clear());
		await page.reload();
	});

	test('should display settings page with all sections', async ({ page }) => {
		await page.goto('/settings');

		// Check main headings
		await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'GitHub Configuration' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Billing Configuration' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Monthly Goals' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Data Management' })).toBeVisible();
	});

	test('should save and persist GitHub username', async ({ page }) => {
		await page.goto('/settings');

		// Enter username
		await page.getByLabel('GitHub Username').fill('testuser123');

		// Save settings
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Verify save message
		await expect(page.getByText('Settings saved!')).toBeVisible();

		// Reload page
		await page.reload();

		// Verify username persisted
		await expect(page.getByLabel('GitHub Username')).toHaveValue('testuser123');
	});

	test('should save and persist GitHub token', async ({ page }) => {
		await page.goto('/settings');

		// Enter token
		await page.getByLabel('Personal Access Token').fill('ghp_testtoken123');

		// Save settings
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Reload page
		await page.reload();

		// Verify token persisted
		await expect(page.getByLabel('Personal Access Token')).toHaveValue('ghp_testtoken123');
	});

	test('should disable Test button when token is empty', async ({ page }) => {
		await page.goto('/settings');

		// Test button should be disabled when token is empty
		await expect(page.getByRole('button', { name: 'Test' })).toBeDisabled();

		// Enter token
		await page.getByLabel('Personal Access Token').fill('ghp_testtoken');

		// Test button should now be enabled
		await expect(page.getByRole('button', { name: 'Test' })).toBeEnabled();
	});

	test('should save and persist hourly rate', async ({ page }) => {
		await page.goto('/settings');

		// Enter hourly rate
		await page.getByLabel('Hourly Rate').fill('75.50');

		// Save settings
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Reload page
		await page.reload();

		// Verify hourly rate persisted
		await expect(page.getByLabel('Hourly Rate')).toHaveValue('75.5');
	});

	test('should display hourly rate example calculation', async ({ page }) => {
		await page.goto('/settings');

		// Enter hourly rate
		await page.getByLabel('Hourly Rate').fill('50');

		// Should show example calculation
		await expect(page.getByText(/Example: 32 hours × \$50/)).toBeVisible();
		await expect(page.getByText(/= \$1600.00/)).toBeVisible();
	});

	test('should save and persist currency selection', async ({ page }) => {
		await page.goto('/settings');

		// Select EUR
		await page.getByLabel('Currency').selectOption('EUR');

		// Save settings
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Reload page
		await page.reload();

		// Verify currency persisted
		await expect(page.getByLabel('Currency')).toHaveValue('EUR');
	});

	test('should save and persist monthly hour goal', async ({ page }) => {
		await page.goto('/settings');

		// Enter monthly goal
		await page.getByLabel('Target Hours per Month').fill('160');

		// Save settings
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Reload page
		await page.reload();

		// Verify monthly goal persisted
		await expect(page.getByLabel('Target Hours per Month')).toHaveValue('160');
	});

	test('should display monthly goal calculation when both goal and rate are set', async ({
		page
	}) => {
		await page.goto('/settings');

		// Enter hourly rate and monthly goal
		await page.getByLabel('Hourly Rate').fill('50');
		await page.getByLabel('Target Hours per Month').fill('160');

		// Should show calculation
		await expect(page.getByText(/At your current rate, 160 hours = \$8000.00/)).toBeVisible();
	});

	test('should select and persist repository checkboxes', async ({ page }) => {
		await page.goto('/settings');

		// Check some repositories
		await page.getByRole('checkbox', { name: 'sveltejs/kit' }).check();
		await page.getByRole('checkbox', { name: 'sveltejs/svelte' }).check();

		// Verify selected count updates
		await expect(page.getByText('Selected: 2 repositories')).toBeVisible();

		// Save settings
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Reload page
		await page.reload();

		// Verify repositories persisted
		await expect(page.getByRole('checkbox', { name: 'sveltejs/kit' })).toBeChecked();
		await expect(page.getByRole('checkbox', { name: 'sveltejs/svelte' })).toBeChecked();
		await expect(page.getByText('Selected: 2 repositories')).toBeVisible();
	});

	test('should uncheck repositories', async ({ page }) => {
		await page.goto('/settings');

		// Check repositories
		await page.getByRole('checkbox', { name: 'sveltejs/kit' }).check();
		await page.getByRole('checkbox', { name: 'sveltejs/svelte' }).check();

		// Save
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Uncheck one
		await page.getByRole('checkbox', { name: 'sveltejs/kit' }).uncheck();

		// Save again
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Reload
		await page.reload();

		// Verify only svelte is checked
		await expect(page.getByRole('checkbox', { name: 'sveltejs/kit' })).not.toBeChecked();
		await expect(page.getByRole('checkbox', { name: 'sveltejs/svelte' })).toBeChecked();
		await expect(page.getByText('Selected: 1 repository')).toBeVisible();
	});

	test('should save all settings together', async ({ page }) => {
		await page.goto('/settings');

		// Fill all fields
		await page.getByLabel('GitHub Username').fill('johndoe');
		await page.getByLabel('Personal Access Token').fill('ghp_secret');
		await page.getByRole('checkbox', { name: 'sveltejs/kit' }).check();
		await page.getByLabel('Hourly Rate').fill('85');
		await page.getByLabel('Currency').selectOption('GBP');
		await page.getByLabel('Target Hours per Month').fill('120');

		// Save settings
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Reload page
		await page.reload();

		// Verify all fields persisted
		await expect(page.getByLabel('GitHub Username')).toHaveValue('johndoe');
		await expect(page.getByLabel('Personal Access Token')).toHaveValue('ghp_secret');
		await expect(page.getByRole('checkbox', { name: 'sveltejs/kit' })).toBeChecked();
		await expect(page.getByLabel('Hourly Rate')).toHaveValue('85');
		await expect(page.getByLabel('Currency')).toHaveValue('GBP');
		await expect(page.getByLabel('Target Hours per Month')).toHaveValue('120');
	});

	test('should export data as JSON file', async ({ page }) => {
		await page.goto('/settings');

		// Set some data
		await page.getByLabel('GitHub Username').fill('exporttest');
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Wait for save to complete
		await page.waitForTimeout(100);

		// Set up download listener
		const downloadPromise = page.waitForEvent('download');

		// Click export
		await page.getByRole('button', { name: 'Export All Data' }).click();

		// Wait for download
		const download = await downloadPromise;

		// Verify filename pattern
		expect(download.suggestedFilename()).toMatch(/^oc-invoice-backup-\d{4}-\d{2}-\d{2}\.json$/);
	});

	test('should show save confirmation message temporarily', async ({ page }) => {
		await page.goto('/settings');

		// Save settings
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Message should be visible
		await expect(page.getByText('Settings saved!')).toBeVisible();

		// Message should disappear after a moment
		await expect(page.getByText('Settings saved!')).not.toBeVisible({ timeout: 3000 });
	});

	test('should clear all data when confirmed', async ({ page }) => {
		await page.goto('/settings');

		// Set some data
		await page.getByLabel('GitHub Username').fill('cleartest');
		await page.getByLabel('Hourly Rate').fill('100');
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Wait for save
		await page.waitForTimeout(100);

		// Set up dialog handler to accept
		page.on('dialog', (dialog) => dialog.accept());

		// Click clear data
		await page.getByRole('button', { name: 'Clear All Data' }).click();

		// Reload page
		await page.reload();

		// Verify data is cleared
		await expect(page.getByLabel('GitHub Username')).toHaveValue('');
		await expect(page.getByLabel('Hourly Rate')).toHaveValue('0');
	});

	test('should not clear data when cancelled', async ({ page }) => {
		await page.goto('/settings');

		// Set some data
		await page.getByLabel('GitHub Username').fill('keeptest');
		await page.getByRole('button', { name: 'Save Settings' }).click();

		// Wait for save
		await page.waitForTimeout(100);

		// Set up dialog handler to dismiss
		page.on('dialog', (dialog) => dialog.dismiss());

		// Click clear data
		await page.getByRole('button', { name: 'Clear All Data' }).click();

		// Reload page
		await page.reload();

		// Verify data is still there
		await expect(page.getByLabel('GitHub Username')).toHaveValue('keeptest');
	});
});
