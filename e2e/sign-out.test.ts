import { expect, test, type Page } from '@playwright/test';
import { remoteResult } from './remote';

/** Answers Google Drive's remote functions as if a Google account were signed in, noting each call. */
async function signInToGoogle(page: Page, { pullFails = false } = {}) {
	const calls: string[] = [];
	await page.route('**/_app/remote/*/getDriveStatus', (route) => {
		calls.push('status');
		return route.fulfill(
			remoteResult({ available: true, account: { email: 'someone@example.com', name: 'Someone' } })
		);
	});
	await page.route('**/_app/remote/*/pullWorkLog', (route) => {
		calls.push('pull');
		return pullFails
			? route.fulfill({
					status: 502,
					json: { type: 'error', error: { message: 'Google Drive is down.' } }
				})
			: route.fulfill(remoteResult(null));
	});
	await page.route('**/_app/remote/*/pushWorkLog', (route) => {
		calls.push('push');
		return route.fulfill(remoteResult({ conflict: false }));
	});
	await page.route('**/_app/remote/*/clearAllData', (route) => {
		calls.push('clear');
		return route.fulfill(remoteResult({}));
	});
	return calls;
}

test('there is nothing to sign out of until you sign in', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Main' })).toBeAttached();
	await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('signing out saves to Drive first, clears this browser and offers to sign out of Google', async ({
	page
}) => {
	const calls = await signInToGoogle(page);
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign out' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('The copy in your Google Drive stays.');
	const cleared = page.waitForResponse('**/auth/clear');
	await dialog.getByRole('button', { name: 'Sign out and clear' }).click();

	await expect(dialog.getByRole('heading', { name: 'Signed out of Open Work' })).toBeVisible();
	// `headers()` leaves out headers like this one.
	expect((await (await cleared).allHeaders())['clear-site-data']).toBe(
		'"cache", "cookies", "storage"'
	);
	await expect(dialog.getByRole('link', { name: 'Sign out of Google too' })).toHaveAttribute(
		'href',
		'https://accounts.google.com/Logout'
	);
	expect(calls.indexOf('pull')).toBeLessThan(calls.indexOf('clear'));
	expect(calls.filter((call) => call === 'status')).toHaveLength(1);
	await dialog.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('when Drive cannot be reached, nothing is cleared until you say so', async ({ page }) => {
	const calls = await signInToGoogle(page, { pullFails: true });
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign out' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: 'Sign out and clear' }).click();

	await expect(dialog.getByRole('alert')).toHaveText(
		'Your latest changes may not be in Google Drive: Google Drive is down.'
	);
	expect(calls).not.toContain('clear');
	await dialog.getByRole('button', { name: 'Clear anyway' }).click();
	await expect(dialog.getByRole('heading', { name: 'Signed out of Open Work' })).toBeVisible();
	expect(calls).toContain('clear');
});
