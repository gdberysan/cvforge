# Craft rules

CVForge is free and made with care. These are the rules every screen is
checked against. They exist because "looks fine" hides a hundred small
misalignments, and people feel them even when they can't name them.

## The standard (twelve points, above every rule below)

1. Visual first. Every datum in the form that best explains it (bar, ring, calendar, trend). Text only accompanies.
2. One idea per block. Each section answers one question, in one clear sentence, most important on top. Secondary things are hidden and open on request.
3. What demands action comes first. Urgent things (what to do, by when, what is missing) are seen before informative ones. Size, weight and colour mark that order.
4. Perfect alignment. Columns, baselines and heights match across equivalent blocks. Siblings share structure and measurements. Nothing misaligns because of a text's length.
5. No gaps. All space has a function. No empty columns, lame (half-filled) cards or dead margins. The composition is made for the screen it is used on.
6. Sober, with accents that mean something. Neutral, restrained base. Colour used sparingly and always meaning something: one main accent for alerts, green for what goes well.
7. No piece poorer than the rest. Every component has the same level of finish. A view that looks flat or generic is redone even if the others are fine.
8. Nothing templated. Zero generic solutions (identical stacked cards, filler panels). Each piece designed for its content, premium finish.
9. Living, meaningful interaction. Open, reveal and confirm animate fluidly and respond to the person. Motion is never decoration.
10. Identity well kept. Logos, type and brand tokens crisp and correct on any background. If something "looks odd", it is a defect.
11. Care for detail. Tabular (fixed-width) digits for numbers, single-line text where it belongs, no native tooltips overlapping, consistent behaviour across views.
12. Verified by seeing it. Nothing ships without screenshots reviewed at real size and interactions tested.

The rules below are how those points are met in this codebase.

## Grid and spacing
- Everything sits on an 8 px grid: margins, gaps, heights, paddings.
- 24 px inside a card, 16 px between cards and between blocks, 8 px inside a
  group (a label and its field, a title and its explanation).
- One left edge per card: title, text, rows and buttons start on the same line.

## Surfaces (four levels, never more)
1. The paper (page background). Only the page title and its one sentence sit
   directly on it.
2. A card (`.board`): white, soft shadow, 24 px radius.
3. An inner panel for one item inside a card (a question, a setting, an
   entry): the paper colour, 16 px radius.
4. A field: inset, 1.5 px warm border, 16 px radius.

## Type
| Role | Size / line |
|---|---|
| Page title | 32/40 (40/48 from 700 px) |
| Section / card title | 20/28 semibold |
| Item title | 16/24 semibold |
| Body | 16/24 |
| Detail, explanations | 14/20 or 15/24, muted |

- Nothing under 14 px except the colophon.
- Labels and buttons start with a capital letter.
- Spanish quotes « », numbers that line up (tabular figures), no lone word
  on a last line of a heading.
- Words, never shorthand: "Pocos datos · 2", not "n=2".

## Controls
- One height per kind: 48 px button, 40 px pill, 32 px chip or tag.
- One radius per size: 24 card, 16 control, round pill.
- One bar: 8 px, rounded, warm track. Too little data leaves the track empty
  and says so in words; no hatching.

## Lists
- `.rows`: label left, value right, at least 48 px per row, a hairline only
  between rows (never above the first or below the last).
- Values are right-aligned with tabular figures.

## Layout
- Cards side by side share a height; a card whose content is much longer or
  shorter than its neighbour takes the full width instead.
- Wide screens use the width: two columns where the content has two parts.
- Long text is clamped to two lines with a way to read more.

## Motion and tone
- Motion has physics (springs, not linear), and none at all when the system
  asks for reduced motion.
- Jokes are about the hiring process, never about the person or their data;
  facts, costs and errors stay plain.
