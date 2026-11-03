import { expect, test, type Page } from '@playwright/test';

/** A remote function's response holding `value`, in devalue's format. Plain objects only. */
function remoteResult(value: unknown) {
	const nodes: unknown[] = [];
	const add = (v: unknown): number => {
		const index = nodes.push(null) - 1;
		nodes[index] =
			v && typeof v === 'object'
				? Object.fromEntries(Object.entries(v).map(([key, x]) => [key, add(x)]))
				: v;
		return index;
	};
	add({ _: value });
	return { json: { type: 'result', data: JSON.stringify(nodes) } };
}

/** Answers Google Drive's remote functions as if a Google account were signed in. */
async function signInToGoogle(page: Page) {
	await page.route('**/_app/remote/*/getDriveStatus', (route) =>
		route.fulfill(
			remoteResult({ available: true, account: { email: 'someone@example.com', name: 'Someone' } })
		)
	);
	await page.route('**/_app/remote/*/pullWorkLog', (route) => route.fulfill(remoteResult(null)));
	await page.route('**/_app/remote/*/pushWorkLog', (route) =>
		route.fulfill(remoteResult({ conflict: false }))
	);
}

test('deleting the Google Drive copy is offered only while signed in to Google', async ({
	page
}) => {
	await page.goto('/settings/data');
	await page.getByRole('button', { name: 'Delete all data' }).click();
	await expect(page.getByRole('dialog')).toContainText('copy in your Google Drive are not touched');
	await expect(page.getByLabel('Also delete the copy in Google Drive')).toHaveCount(0);

	await signInToGoogle(page);
	await page.reload();
	await expect(page.getByText('Signed in as someone@example.com')).toBeVisible();
	await page.getByRole('button', { name: 'Delete all data' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Also delete the copy in Google Drive').click();
	await expect(dialog).toContainText('kept in this browser and in your Google Drive');
});

test('a failed Drive delete leaves everything as it was', async ({ page }) => {
	await signInToGoogle(page);
	let deleteDrive = false;
	await page.route('**/_app/remote/*/clearAllData', async (route) => {
		deleteDrive = route.request().postDataBuffer()?.includes('deleteDrive') ?? false;
		await route.fulfill({
			status: 502,
			json: { type: 'error', error: { message: 'Google Drive is down.' } }
		});
	});
	await page.goto('/settings/data');
	await page.getByRole('button', { name: 'Delete all data' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Also delete the copy in Google Drive').click();
	await dialog.getByRole('button', { name: 'Delete everything' }).click();

	await expect(dialog.getByRole('alert')).toHaveText('Google Drive is down.');
	expect(deleteDrive).toBe(true);
	await expect(page.getByText('Signed in as someone@example.com')).toBeVisible();
});
