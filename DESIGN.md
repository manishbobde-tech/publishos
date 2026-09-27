# PublishOS — DESIGN.md

Design system for the PublishOS site. This file is the source of truth.
Every color, type size, spacing and corner radius below must be followed;
new UI reuses these tokens and never invents new ones.

## Palette (dark command-center)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0d13` | Page background (with faint saffron/teal radial glows) |
| `--bg-soft` | `#0d1119` | Inputs, secondary surfaces |
| `--panel` / `--panel-2` / `--panel-3` | `#11151d` / `#161b26` / `#1b2130` | Card stack, lightest on top |
| `--border` / `--border-soft` | `#232b3b` / `#1a212e` | Borders |
| `--text` / `--muted` / `--faint` | `#e9edf5` / `#8b94a9` / `#5b6376` | Text hierarchy |
| `--accent` | `#f5a524` saffron | Primary actions, brand, focus rings |
| `--teal` | `#2dd4bf` | Secondary actions, approved state, links |
| `--ok` / `--warn` / `--danger` / `--info` | `#34d399` / `#f5a524` / `#f0524f` / `#60a5fa` | Status only |

Rules:
- `--accent` marks the **one** primary action per view. Nothing else competes with it.
- Status colors are never decoration.
- Body text is `--text` on panels; `--muted` minimum on `--panel`/`--bg`. Never put `--faint` on `--bg-soft`.

## Type scale

| Use | Size / weight |
|---|---|
| Page title (detail `h1`) | 24px / 800, −0.3px tracking |
| Section title (`h2`) | 17px / 700 |
| Card title (`h3`) | 16px / 700 |
| Body | 15px / 400, 1.5 line-height |
| UI text | 13.5px |
| Small | 12.5px |
| Micro labels | 11–11.5px / 700, uppercase, +0.4–0.6px tracking |
| Stats | 30px / 800, −0.5px; metric values 19px / 800 |

Font stack: system (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, …`).

## Spacing & radii

- 8px base grid. Section blocks: 30px top margin. Card padding: 20px.
- Modal padding: 26px; max-width 640px (780px wide).
- `--radius: 14px` (cards, gate), `--radius-sm: 9px` (buttons, inputs, rows), pills `999px`.
- Shadow: `--shadow: 0 12px 40px rgba(0,0,0,.45)` on cards and modals.

## Components

- **Buttons** — `.btn` base: `var(--panel-2)` bg, 13.5px/600, `9px 16px`, `--radius-sm`.
  Variants: `.btn-primary` (accent bg, `#131006` text — the single main CTA),
  `.btn-teal`, `.btn-danger`, `.btn-ghost`, `.btn-sm`.
  States: hover lifts 1px, `:active` presses, `:disabled` 45% opacity,
  `:focus-visible` accent outline. Min touch target 44px on coarse pointers.
- **Inputs** — `.input` / `.select`: `var(--bg-soft)`, 14.5px, `10px 12px`, `--radius-sm`;
  focus = accent border + soft ring. Labels: 12.5px uppercase muted.
- **Cards** — one kind: gradient `panel-2 → panel`, `border-soft`, `--radius`, shadow.
- **Pills** — status (`draft` / `awaiting_approval` / `approved` / `published`),
  filter pills, badges: 999px, uppercase micro type.
- **Feedback** — toasts (bottom-center) for success/failure; inline `.form-err`
  inside modals (never native `alert()`); empty states = dashed border + emoji + one CTA.
- **Motion** — 150–220ms ease on hovers; modal rise .18s; accordion `grid-template-rows`
  .22s; pulse animation only on `awaiting_approval`.
- **Keyboard** — every clickable surface is a real `<button>` or carries
  `data-kb` + `tabindex="0"` + `role="button"` with Enter/Space activation;
  visible focus rings everywhere; Escape closes modals; modals trap Tab.

## Page rules

- Dashboard opens with a one-line value prop and exactly one primary CTA.
- Every view: one main CTA, honest empty states, real numbers only ("no data yet", never 0).
- Approval gate: exact outgoing title/description/thumbnail shown, review checkbox
  required before the Approve button enables — nothing ships without explicit per-item approval.
