# Settings section

A titled part of a settings page, such as Clients, Public holidays or Open Collective. Written 2026-11-19.

## Use

- Every section of a page under `/settings` is a [`SettingsSection`](../../src/lib/components/SettingsSection.svelte), never a `Card`.
- Sections are separated by a rule (`border-t`, none above the first) and `py-8`, which the component sets. Pages stack them with no gap of their own.
- The title is an `h2`. The description says what the section is for and anything the fields do not show; it never repeats a label.
- The section's action, such as Add client or the year select, goes in the `action` snippet, at the top right (DESIGN.md: a list's add button sits at the top right of its section header).

### Why not a card

This is a deliberate exception to the AGENTS.md layout rule that a section is a `Card`. A settings page is one long form read top to bottom, like shadcn-svelte's forms example, which divides its sections with separators: a card around each section adds a second frame without separating anything the rule does not already, and it would nest the boxed records below inside a second box. Cards stay the rule for dashboard sections, like the overview and the work log.

## Layout

The settings area is the `@container/settings` container. From `@4xl/settings` the title and description take a 14rem column beside the content. Below it they sit above the content, with the action at the end of the title's row and the description under both at full width; that row wraps, so with large text the action drops under the title.

| Gap                              | Size                            |
| -------------------------------- | ------------------------------- |
| Title to description, wide       | 4px (`mt-1`)                    |
| Title row to description, narrow | 8px row gap                     |
| Description to content, narrow   | 24px                            |
| Between sections                 | the rule, with 32px either side |

## Content

What goes inside a section decides whether it is boxed. All boxes are `rounded-lg border bg-card`, so they read as the same kind of thing on every page.

| Content                                    | Treatment                                                                                    | Example                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------- |
| Plain fields of a form                     | No box                                                                                       | Your details, hours a day   |
| A list of records with several fields each | One box per record, `space-y-3` between, `@container/card` inside                            | Clients, deductions         |
| A list of one-line rows                    | One box for the list, `divide-y` between rows                                                | Public holidays             |
| A connected account or other single status | One box, like a record                                                                       | Open Collective account     |
| A draft row for adding to a list           | `rounded-lg border border-dashed`, no fill, laid out with the list's columns, after the list | New holiday                 |
| Inputs, including custom ones              | `bg-card`, as the Input primitive                                                            | Chip input for repositories |

Avoid `bg-background` or `bg-muted` fills on a box: on the page background they look like holes rather than records.

## Check

- At each iPhone Duo viewport and a desktop width, the action never overlaps the title, and the description is at least 8px from the action.
- With large text, the title row wraps rather than squeezing the action.
- Every box on the page uses the same border, radius and fill.
