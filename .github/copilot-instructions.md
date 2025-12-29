# GitHub Copilot Instructions

## Project Overview

This is a **SvelteKit 2** web application built for generating OpenCollective invoices. It's deployed to **Cloudflare Pages** using `@sveltejs/adapter-cloudflare` and uses Wrangler for local preview and deployment.

**Core Purpose**: Help users generate properly formatted expense submissions for OpenCollective (specifically https://opencollective.com/svelte) by following their strict title and description requirements documented in [SPEC.md](../SPEC.md).

## Architecture

- **Framework**: SvelteKit 2 with Svelte 5 (modern runes-based reactivity)
- **Styling**: Tailwind CSS 4 (v4 architecture with Vite plugin)
- **Deployment**: Cloudflare Pages via `adapter-cloudflare`
- **Package Manager**: pnpm with workspace configuration
- **Build Tool**: Vite 7 with SvelteKit plugin

## Critical Development Workflows

### Development
```bash
pnpm dev              # Start dev server (Vite)
pnpm preview          # Preview production build via Wrangler + Cloudflare runtime
```

### Testing
```bash
pnpm test             # Run both e2e (Playwright) and unit tests (Vitest)
pnpm test:e2e         # E2E tests only (requires build first)
pnpm test:unit        # Unit tests via Vitest
```

### Type Safety & Linting
```bash
pnpm prepare          # Generate Cloudflare types + SvelteKit sync (runs automatically)
pnpm check            # Svelte type checking with TypeScript
pnpm lint             # ESLint + Prettier checks
pnpm format           # Auto-format with Prettier
```

## Svelte 5 Patterns (CRITICAL)

This project uses **Svelte 5 with runes**. Always use modern Svelte 5 syntax:

- **Props**: `let { children, prop = 'default' } = $props()`
- **State**: `let count = $state(0)` (not `let count = 0`)
- **Derived**: `let doubled = $derived(count * 2)`
- **Effects**: `$effect(() => { /* side effect */ })`
- **Render children**: `{@render children()}`

See [+layout.svelte](../src/routes/+layout.svelte) for the children render pattern used in layouts.

**MCP Server Available**: Use the Svelte MCP tools (documented in [AGENTS.md](../AGENTS.md)) to validate Svelte code:
1. Always run `svelte-autofixer` on any Svelte component before presenting to user
2. Use `list-sections` and `get-documentation` to fetch official Svelte 5/SvelteKit docs
3. Offer `playground-link` after completing code (only for demos, not file changes)

## Domain-Specific Knowledge

The app's domain logic centers on **OpenCollective expense submission requirements**. When implementing invoice generation:

- **Expense titles** must be specific, not generic (see [SPEC.md](../SPEC.md) examples)
- **Descriptions** require: work details, project support context, timeframe, and supporting links
- Avoid vague terms: "work", "services", "payment", "grant", "donation", "reward"
- Good examples: "Maintenance and Development (09/2024)", "Fixed critical security bugs in February 2024"
- Must include GitHub commits, PRs, changelogs, or repository links for transparency

## Project Structure Conventions

```
src/
  routes/          # SvelteKit file-based routing
    +page.svelte   # Route page component
    +layout.svelte # Root layout with favicon and global CSS
    layout.css     # Global styles (@tailwind directives)
  lib/             # Shared utilities via $lib alias
    index.ts       # Re-exports for $lib imports
    assets/        # Static assets (imported via Vite)

e2e/               # Playwright tests (run against production build)
static/            # Publicly served files (robots.txt)
```

## TypeScript Configuration

- **Strict mode enabled** (all type checks)
- **Auto-rewrite imports**: `.js` → `.ts` via `rewriteRelativeImportExtensions`
- **Cloudflare types**: Generated via `pnpm types` (runs in `prepare` script)
- SvelteKit generates `.svelte-kit/tsconfig.json` (extended by root config)

## Testing Strategy

### E2E (Playwright)
- Located in `e2e/` directory
- Runs against **production build** (see [playwright.config.ts](../playwright.config.ts))
- Command: `pnpm build && pnpm preview` before tests execute
- Example: [e2e/demo.test.ts](../e2e/demo.test.ts)

### Unit (Vitest)
- Uses custom config separating server tests from component tests
- Server tests: `src/**/*.{test,spec}.{js,ts}` (Node environment)
- Component tests: `src/**/*.svelte.{test,spec}.{js,ts}` (excluded from server project)
- **Requires assertions**: `expect.requireAssertions: true` configured

## Cloudflare-Specific Details

- **Adapter**: `@sveltejs/adapter-cloudflare` (configured in [svelte.config.js](../svelte.config.js))
- **Preview**: `wrangler dev` runs `.svelte-kit/cloudflare/_worker.js`
- **Compatibility**: Date `2025-12-29`, flag `nodejs_als` enabled (see [wrangler.jsonc](../wrangler.jsonc))
- **Assets**: Bound via `ASSETS` binding for static file serving

## Code Quality Tools

- **ESLint**: Flat config with TypeScript, Svelte, and Prettier integration ([eslint.config.js](../eslint.config.js))
- **Prettier**: Auto-formats with svelte and tailwindcss plugins
- **ESLint Rule**: `no-undef` disabled for TypeScript files (typescript-eslint recommendation)

## When to Use AI Tools

- **Svelte MCP Server**: Always validate Svelte components with `svelte-autofixer` before delivery
- **Type Generation**: Run `pnpm types` after changing Wrangler configuration
- **Documentation**: Reference [SPEC.md](../SPEC.md) for OpenCollective requirements when building invoice features
