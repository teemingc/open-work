You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

## Design system

Read [DESIGN.md](DESIGN.md) before UI work. It links the design rules, tokens and the component, layout and pattern contracts in `design-system/`. Use the `design-system` skill for contract and system work and for choosing and reusing components, layouts and patterns.

## Project rules

- before writing Svelte code, check https://www.shadcn-svelte.com/docs/components and their installation instructions
- use https://www.shadcn-svelte.com/docs/components/spinner instead of implementing your own spinner
- select.root must set type attribute if it is a single select

- instead of using emojis, raw SVG and special characters, use icons from the @lucide/svelte package
- avoid using deprecated icons

- use pnpm instead of npm
- run pnpm format, pnpm lint and pnpm check after making changes

## HTML rules

- `<label>` elements must be associated with an input
- when adding a toggle to hide/show elements, use `<details>` and `<summary>` instead of `<button>` and conditional logic

## TypeScript rules

- functions with 4 or more positional arguments should use a single destructured argument instead
- types should be in their primary domain file rather than in a dedicated types.ts file
- never create a barrel file such as `index.ts` that re-exports exported variables and functions from another file. Always import directly from the file with the original export

## Svelte rules

- do not use `$effect` to synchronise state
- state whose value is an array should take advantage of mutative array methods instead of re-assigning the entire array for fine-grained updates
- `window` always exists in `onMount` because it only runs on the client. There's no need to check if it is defined

## SvelteKit rules

- use `#lib` as an alias to `src/lib`
- use `$app/state` instead of `$app/stores`
- use the page object from `$app/state` to check the current URL instead of `window.location.href`
- use `goto` from `$app/navigation` instead of assigning a value to `window.location.href`
- href link must be wrapped with `resolve` from `$app/paths`
- files referenced by only one other file should be located adjacent to it. Only move it to the `src/lib` directory if it's used by more than one file

## Layout rules

Lay out pages the way shadcn-svelte's blocks do (`dashboard-01`, `sidebar-07`, `login-01`), and check the block before inventing a layout.

- test at the iPhone Duo's Safari viewports, from https://webkit.org/blog/18486/webkit-features-for-safari-27-1/: 382 × 580 (closed), 385 × 571 (split view), 594 × 368 (closed, sideways), 669 × 867 (open), 951 × 585 (open, sideways). Also check a desktop width, and a larger text size
- the page gutter is `px-4`, widening to `px-6` from `lg`; sections are spaced `gap-4`, widening to `gap-6` from `md`
- inside `main`, prefer container queries (`@container/main`, `@container/card`) to window breakpoints, so a layout follows the space it is given and the text size
- card grids go from one column to two at `@xl` and four at `@5xl`. A card's headline figure grows with the card (`@[250px]/card:text-3xl`)
- tabs that do not fit become a select below `@4xl`, and a toggle group in a card header becomes a select below about 767px of card. Rows of tabs never scroll sideways
- button labels shorten on narrow widths ("Columns" for "Customize Columns") or become icons with a `sr-only` label. Secondary controls, like first and last page, hide below `lg`
- the submit button of a form takes the full width on phones, with the main action first; from `sm`, buttons sit together at the end of the row
- chart cards use `px-2 pt-4` for their content on phones and `sm:px-6 sm:pt-6`, with a fixed chart height rather than an aspect ratio
- a detail view opens as a bottom drawer on phones and a side panel from `md`
- keep fixed and sticky parts short: at 368px of height, a two-row sticky header leaves little room for the page
- `main` is `@container/main`, so pages use `@xl/main:`, `@3xl/main:`, `@5xl/main:` and so on rather than `sm:`, `md:` and `lg:`
- a section is a `Card` with its title in `Card.Header` and its actions in `Card.Action`, not a hand-rolled bordered `div`. Space sections with `flex flex-col gap-4 md:gap-6`, not margins or `space-y-8`
- on touch screens, buttons, toggles, inputs and selects are at least 40px tall through `pointer-coarse:` in their components. Don't shrink them with `h-auto py-0`; give a smaller custom control a 40px hit area with `relative after:absolute after:-inset-2`
- text is at least `text-xs` (12px), and notes people need to read on a phone are `text-sm`
