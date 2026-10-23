import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const typesPath = 'worker-configuration.d.ts';

execFileSync('wrangler', ['types'], { stdio: 'inherit' });

// Wrangler adds `Cloudflare.GlobalProps.mainModule` whenever the `main` entry exists, which here is
// the build output. Importing it would pull built code into type checking and make the generated
// file depend on whether a build has run, so drop it.
const types = readFileSync(typesPath, 'utf-8');
writeFileSync(typesPath, types.replace(/\n\tinterface GlobalProps \{\n[\s\S]*?\n\t\}/, ''));
