# Open Work

Keeps open source freelancing sustainable. Log the hours and the PRs and issues you work on, see whether you are on pace for the month, follow how your collective's money is holding up, and turn each fortnight of work into an Open Collective expense.

Your settings are kept in a cookie and your work log in this browser's local storage. The server only forwards requests to Open Collective.

## Run it

```sh
pnpm install
pnpm dev
```

Then open Settings and fill in:

- **Open Collective personal token** with the `expenses` scope, then press Connect. This loads your name, address and saved payout methods.
- **Payout method**, **collective** (the slug from its Open Collective address), **tax income number** and your **address**.
- **Hourly rate** and currency. Each new invoice copies these.
- **GitHub** (optional): username, a token for private activity, the organization and, if you like, a list of repositories.

## Work log

Log your time under **Work log**, a month at a time. Each entry is a block of time for one client: a date, a start and end (or just hours), and everything you worked on in it. Type an item as a GitHub path or link, like `owner/repo/pull/123` or `repo/issues/45` (the owner defaults to your organization), or as a task like a meeting. **Add from GitHub** fills in the PRs and issues you touched that month.

Each month shows:

- Weekdays − public holidays − leave = working days, each expecting 8 hours (configurable).
- Hours logged, your pace against what is expected by today, what is still to log and how many hours a day that takes.
- Hours and earnings per client, a pace chart, hours per day by client, and the year so far.

Under **Clients and days off**, set each client's hourly rate and currency, which client you invoice through Open Collective, an optional second currency for totals (USD to MYR, say), and the public holidays and leave for each year. Holidays can be pasted or imported from a CSV of `date,name` rows.

## Google Drive sync (optional)

Signed in with Google, the work log is also kept in your own Google Drive, in the hidden app data folder that only this app can open. This browser's copy stays the one you edit; Drive follows a moment after each change, and on load the newer copy wins. Nothing about you is stored on the server: the session and Google tokens live in encrypted cookies.

Without the Google credentials below, sign-in is hidden and the work log stays in the browser.

### For local development

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Drive API** under APIs & Services.
2. Open **Google Auth Platform**. On **Audience**, choose _External_ and add yourself as a test user.
3. On **Data access**, add the `https://www.googleapis.com/auth/drive.appdata` scope. It is non-sensitive, so it needs no security review.
4. On **Clients**, create an OAuth client of type _Web application_ with the authorized redirect URI `http://localhost:5173/api/auth/callback/google`.
5. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `BETTER_AUTH_SECRET` (at least 32 random characters, for example from `openssl rand -base64 32`) in `.dev.vars`.

While the app is in testing, only test users can sign in and Google expires their sign-in after 7 days.

### For production

Anyone can sign in once the app is published, but Google first wants to know the app is yours. Do these in order; each depends on the one before.

1. **Deploy first.** The privacy policy at `/privacy` and the home page must be live at the address you will register, for example `https://open-work.<account>.workers.dev`.
2. **Verify the domain in [Google Search Console](https://search.google.com/search-console).** Sign in with the same Google account that owns the Cloud project. Add a _URL prefix_ property for the deployed origin and pick the **HTML file** method. Download the `google<code>.html` file into `static/` (it is served from the site root), commit, deploy, check it opens at `<origin>/google<code>.html`, then press **Verify**. Keep the file: Google checks it again from time to time and drops the verification if it is gone.
3. **Fill in Branding** in Google Auth Platform:
   - App name: Open Work
   - User support email and developer contact email
   - App logo: `logo-oauth-120.jpg` from the repository root (120×120, under 1 MB). `logo-oauth-512.jpg` is a larger copy for anywhere else that asks.
   - Application home page: `<origin>/`
   - Privacy policy: `<origin>/privacy`
   - Authorized domains: the domain verified in step 2
4. **Add the production redirect URI** to the OAuth client on **Clients**: `<origin>/api/auth/callback/google`, next to the localhost one.
5. **Publish.** On **Audience**, press **Publish app** to move from _Testing_ to _In production_. Because the app shows a logo, Google reviews the branding before showing it (on **Verification centre**, usually a few business days). Sign-in works meanwhile, with a plain consent screen.
6. **Set the Worker secrets** with the client's ID and secret:

   ```sh
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
   pnpm exec wrangler secret put BETTER_AUTH_SECRET
   ```

If the address changes, redo steps 2 to 4 for the new one. The privacy policy has to keep describing what the app does with Google data, so update `src/routes/privacy/+page.svelte` when that changes.

## Each invoice

1. Open the app. It suggests the next half-month (1st to 15th, or 16th to the end of the month). Use "Use different dates" for anything else.
2. The hours and notes come from the work log entries of the client invoiced through Open Collective. You can type other hours instead.
3. Check the preview, then **Submit to Open Collective**.
4. Mark it paid when the money arrives.

If you would rather paste into the Open Collective form yourself, "Copy fields to paste yourself" copies each field.

## What gets sent

| Open Collective field          | Value                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Type                           | Invoice                                                                                   |
| Title                          | `Maintenance and Development (DD/MM/YYYY-DD/MM/YYYY)`                                     |
| Item description               | `N hours of work from 1st October 2026 to 15th October 2026 at a rate of 40 USD per hour` |
| Item amount                    | hours × rate                                                                              |
| Additional invoice information | The invoice note from Settings, if any                                                    |
| Additional notes               | The work log                                                                              |
| Payee, payout method           | From Settings                                                                             |

The title and item description can be edited per invoice under "Edit the wording".

The work log is plain text, one row per line:

```
Date | Repository | Issue/PR
01/10/2026 | kit | PR #17292
01/10/2026 | — | Thu full-time maintainers meeting
```

## Limits to know about

- GitHub's activity feed only goes back 300 events. For a fortnight this is normally enough; the app warns when it is not.
- Tokens are kept in local storage on this device. Backups from Settings leave them out.
- The work log lives in this browser only. Download a backup from Clients and days off to keep it safe or move it.
- Invoices created by the earlier monthly version of this app are converted when first loaded.

## Develop

```sh
pnpm format
pnpm lint
pnpm check
pnpm test:unit -- --run
pnpm test:e2e
```

## Deploy

The app runs on Cloudflare Workers: the server forwards requests to Open Collective, caches public stats and handles sign-in, so it needs the Workers runtime rather than static hosting.

1. Log in once with `pnpm exec wrangler login`.
2. Create an Open Collective OAuth app at opencollective.com (your account, then For developers) with the callback URL `https://<your-worker>.workers.dev/auth/callback`.
3. Set the secrets:

   ```sh
   pnpm exec wrangler secret put OC_CLIENT_ID
   pnpm exec wrangler secret put OC_CLIENT_SECRET
   pnpm exec wrangler secret put OC_PERSONAL_TOKEN
   ```

   `OC_PERSONAL_TOKEN` is optional but recommended: a personal token from your Open Collective account (read-only is enough). Visitors who have not connected Open Collective share a Worker's outgoing IPs, and anonymous requests are limited to 10 a minute per IP; with the token, public stats get 100 a minute. To turn on Google Drive sync, follow [Google Drive sync for production](#for-production).

4. Run `pnpm deploy`.

`specs/REQUIREMENTS.md` has the wording the fiscal host asks for in expense titles and descriptions.
