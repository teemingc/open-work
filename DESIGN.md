# Open Work design

## Intent and shared rules

Open Work helps freelancers doing open-source work log their time, see their pace and invoice clients, some through Open Collective, and lets anyone look up a collective's finances. It should read like a ledger: serif type, Open Collective's navy, ruled tables and calm, dense figures.

Shared rules live at their authoritative locations:

- [AGENTS.md](AGENTS.md): project rules (shadcn-svelte components, lucide icons, HTML and Svelte rules) and the **Layout rules** section, which is required for every page. It covers the iPhone Duo viewports, gutters and spacing, container queries on `main`, cards as sections, collapsing tabs and labels, full-width phone actions, chart cards, touch targets and minimum text size.
- Rules stated here:
  - Required: serif only. Besley (`font-display`) for page titles, the wordmark and headline figures; Source Serif 4 for everything else. No sans or mono for figures.
  - Required: colours come from the tokens below, never off-palette Tailwind colours.
  - Required: tables use `.ledger` (double rule under the head, banded rows); lists of records use `.ledger-rows`. A ledger too wide for its space stacks with a container variant of `ledger-stacked`.
  - Required: no captions or hints that only repeat what the interface already shows. A description that explains something not visible is fine.
  - Required: a list's add button sits at the top right of its section header.
  - Required: disclosure toggles use `<details>`/`<summary>` with a rotating lucide `ChevronRight` and a 40px tall summary, never the native marker.
  - Recommended: when choosing a layout, open the matching shadcn-svelte block (`dashboard-01`, `sidebar-07`, `login-01`) first and copy its arrangement.

## Design-system sources

- Components: [index](design-system/COMPONENTS.md)
- Layouts: [index](design-system/LAYOUTS.md)
- Patterns: [index](design-system/PATTERNS.md)
- Tokens: [`src/routes/layout.css`](src/routes/layout.css). `:root` and `.dark` define the colour roles (each documented in the comment above them), `--radius`, `--h1-size` and the chart series colours. `@theme inline` maps them to Tailwind utilities (`bg-card`, `text-muted-foreground`, `border-rule`, `font-display` and so on). Component-private values, such as `--card-padding` in the Card, are not shared tokens.
- Themes: light (`:root`) and dark (`.dark`) in the same file, with the same semantic roles.
- Visual references: shadcn-svelte blocks (https://www.shadcn-svelte.com/blocks) for layout; opencollective.com for colour.

## Contracts and public use

Component contracts live in `design-system/components/`, layouts in `design-system/layouts/` and patterns in `design-system/patterns/`, each with its uppercase index.

- shadcn-svelte primitives live in `src/lib/components/ui/` and are imported from their own files (`#lib/components/ui/card/index.js` and so on). Add new ones with the shadcn-svelte CLI ([components.json](components.json)). The local changes to these primitives are deliberate and must survive updates: Card padding via `--card-padding`, and 40px touch heights (`pointer-coarse:`) on Button, Toggle, Input and Select.
- App-wide components live in `src/lib/components/`. Components used by one route live next to it (AGENTS.md, SvelteKit rules).
- Shared styles: `src/routes/layout.css`, imported once by `src/routes/+layout.svelte`.
- Craft changes only design-related CSS, markup and public settings. Component internals and business logic stay project-owned.

## Verification

Run from the repository root:

- `pnpm format`, `pnpm lint`, `pnpm check` after every change (AGENTS.md).
- `pnpm test` runs the unit tests (vitest) and the end-to-end tests (Playwright, `e2e/`).
- Visual check: the dev server is `pnpm dev` (or the `dev` configuration in `.claude/launch.json`). Check each changed page at the five iPhone Duo viewports from AGENTS.md and at a desktop width, in Playwright WebKit with `hasTouch` so touch sizes apply. Use fake data only; never real work-log data.
- Accessibility: labels tied to inputs, visible or screen-reader text instead of `aria-label`/`title`/placeholder, one clear focus outline, state shown by more than colour, layouts that hold at larger browser text sizes.
- Browser support: current Safari (iOS and macOS), Chrome and Firefox.

## Gaps and decisions

Open gaps: none recorded yet. Add `design-system/gaps.md` when the first gap is recorded.

Contracts are written when real work touches a component, layout or pattern, not in one migration (decided 2026-11-04). Until then, existing UI is unmanaged: reuse it after checking its code, tests and consumers.
