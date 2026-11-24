# Contributor entry

One contributor in a ranked list of who gave what, as in the Contribution frequency panel of a collective's page ([`IncomeSources.svelte`](../../src/routes/collective/[handle]/IncomeSources.svelte)). Written 2026-11-25.

## Use

- The list is an `ol`, ranked by amount, largest first. Each entry is an `li`.
- An entry reads like a ledger line: who on the left, how much at the top right, and the details under the name.
- The name may wrap to as many lines as it needs. Nothing else in the entry moves when it does: the logo and the amount stay on its first line.
- The name is the link. Its external-link icon is inline and joined to the last word, so it never wraps alone, and the link's `before` reaches back over the logo and 24px below the name, over the details and never above it, so the logo opens the same page and the target is at least 44px tall.
- Shares are not repeated on each entry where a share panel sits beside the list. Where there is none, as on a fund's page, the share goes before the amount in muted text.
- No bar or other chart inside an entry. The share panel draws the split.

## Layout

The entry is a three-column grid: `auto` for the logo, `minmax(0,1fr)` for the text and `auto` for the amount.

| Part    | Treatment                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------- |
| Logo    | 32px disc spanning the name and detail rows. A blank disc without an image, a `Users` icon for groups |
| Name    | `font-medium`, `text-base` from `@xl/main`. Muted for a group of unnamed contributors                 |
| Amount  | Besley (`font-display`), heading colour, tabular figures                                              |
| Details | Muted, `text-sm`, `text-xs` from `@3xl/main`: the dates and the number of contributions               |
| Badge   | Always on its own line under the details, so the badges start in one column                           |

| Gap              | Size                   |
| ---------------- | ---------------------- |
| Logo to text     | 12px (`gap-x-3`)       |
| Name to details  | 2px (`gap-y-0.5`)      |
| Details to badge | 6px (`gap-y-1.5`)      |
| Between entries  | 20px (`gap-5`, `mb-5`) |

The card is a `@container`. From `@3xl` of card the list runs in two columns (`columns-2`, 48px apart), still ranked top to bottom, and an entry never splits across them. Below that it is one column.

## Check

- At each iPhone Duo viewport and a desktop width, a name long enough to wrap leaves the amount and the logo on its first line.
- The external-link icon is never alone on a line.
- The link's target, logo included, is at least 44px tall, and does not cover the badge under it.
- An entry with no badge has no blank line where the badge would be.
- On a wide card, the amount sits beside its name rather than a card's width away.
