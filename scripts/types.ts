import { execFileSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';

const entryPath = 'worker.ts';
const hiddenEntryPath = `${entryPath}.hidden`;

// Wrangler adds `Cloudflare.GlobalProps.mainModule` whenever the `main` entry exists, which here
// wraps the build output, and folds it into the hash `--check` compares. Importing it would pull built code
// into type checking, and a deploy checks before it builds, so hide the entry while wrangler runs to
// get the same types and hash whether or not a build has run.
const entryExists = existsSync(entryPath);
if (entryExists) renameSync(entryPath, hiddenEntryPath);
try {
	execFileSync('wrangler', ['types', ...process.argv.slice(2)], { stdio: 'inherit' });
} catch {
	process.exitCode = 1;
} finally {
	if (entryExists) renameSync(hiddenEntryPath, entryPath);
}
