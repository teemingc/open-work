# Day ruler

A strip of one day with the block of time being entered drawn to scale on it, beside the work already logged. Written 2026-11-25.

## Use

- [`DayRuler`](../../src/lib/components/DayRuler.svelte) sits under the Start and End fields of [`EntryForm`](../../src/lib/components/EntryForm.svelte), at the form's full width. It is for a block with a start and an end; hours typed without times have no place on it.
- It shows what the two times cannot: how long the block is, where in the day it falls, and what it overlaps. It warns about an overlap and never blocks saving.
- The time fields stay the way to set times by keyboard and for screen readers. The strip is `aria-hidden`; the block's length and the note under the strip are text.

## Parts

| Part             | Treatment                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strip            | 32px tall, `border-input`, `bg-card`. 30 hours: the calendar day and the six small hours after it                                                                 |
| Noon to midnight | `bg-primary/10`, so a block in the wrong half of the day is seen there                                                                                            |
| Next morning     | Not tinted, ruled diagonally in `--input`, after a full-height rule at midnight                                                                                   |
| Ticks and labels | A tick an hour, taller every six. Labels at 6 AM, 12 PM, 6 PM and 12 AM in `text-xs`                                                                              |
| Logged work      | `bg-muted-foreground/45`, shorter than the block. Includes the neighbouring days' work that falls here                                                            |
| The block        | `bg-primary`                                                                                                                                                      |
| Handles          | A 2px `bg-primary-foreground/60` mark at each end of the time, with 3px of the block outside it. One form at every length: the time is the navy between the marks |
| Overlap          | The shared stretch hatched in `--destructive`, with the note saying what it overlaps                                                                              |
| Length           | `font-display` above the block's middle; kept within the strip                                                                                                    |
| Note             | One line under the strip, always there so the form does not move: an overlap, or an end the next day                                                              |

## Dragging

- A handle at each end resizes the block, and the stretch between them moves it. No block is without its handles, and none changes form as it grows or shrinks: the marks stand just outside the time, so 15 minutes carries them as a whole day does. The block reaches 5px past its time at each end, and past the strip at either end of the day.
- A handle is held over 16px about its end, or 44px for a finger. A block too short to hold by its middle gets one of 12px, or 28px for a finger, with its ends held outside it. Each part is 40px tall, or 44px for a finger.
- The block and its length are drawn at their new place at once, typed or dragged: no slide, as it trailed behind the keys and left the overlap's hatching out of step.
- While held, the block and its hatching stand 15% taller (`scale-y`, 150ms), so taking hold is seen before anything moves. This is the ruler's only motion, and it is off under reduced motion.
- Steps are 15 minutes. A tap changes nothing: the pointer must travel 4px first.
- A block's start stays on its side of midnight, and it stops short of where the day's order would read it as the next morning's.
- Sideways drags belong to the block; up and down still scrolls the page.

## Check

- A 15-minute block shows both handles, in the middle of the strip and at either end of it, and each handle drags from where it is drawn.
- At each iPhone Duo viewport and a desktop width, the labels do not collide and the length stays within the strip at either end, also with large text.
- In light and dark, the tint, the next morning's ruling, logged work and the block are told apart.
- Typing 11:30 PM to 12:00 PM shows a block running off the strip and its 12.5 h.
