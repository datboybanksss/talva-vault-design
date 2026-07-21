# Home Page (`/`) vs Prototype Design System — Gap Report

Comparison only. No code changes proposed yet. Current values pulled from `src/styles.css` (`:root` + `.tv-app` scoped tokens) and `src/routes/index.tsx`.

Note upfront: the project has **two token layers** — the global `:root` tokens the home page uses, and the `.tv-app` scoped `--tvp-*` tokens used inside the authenticated portal shells. They are close but not identical. The M0-M7 prototype spec you're quoting looks closer to a **third variant** (deeper teal-700, amber accent, tighter neutrals, smaller radii). The home page uses the global `:root` layer.

---

## 1. Color tokens

| Token | Prototype spec | `:root` (home page uses) | `.tv-app` (portal uses) | Match? |
|---|---|---|---|---|
| Primary teal | `#064E58` (teal-700) | `--teal: #086A70` | `--tvp-teal: #086A70` | ❌ Ours is lighter/greener than spec |
| Teal hover | (not specified) | `--teal-2: #108B95` | `--tvp-teal-2: #0A7B8A` | Two different hover shades already |
| Amber accent | `#E89348` (amber-500, secondary accent) | `--amber: #D97706` (semantic warning only) | `--tvp-amber: #D97706` | ❌ Different hue; and we treat amber as *status*, not *brand accent* |
| Ink | `#1A1F2A` | `--ink: #142033` | `--tvp-ink: #142033` | ❌ Ours is bluer/darker |
| Ink-soft | `#4B5563` | `--text-body: #384254` | `--tvp-text: #384254` | ❌ Ours is bluer/darker |
| Background | `#FAFAF9` (near-white warm) | `--bg: #FDF9F5` (warmer cream) | `--tvp-bg: #FDF9F5` | ❌ Ours is noticeably warmer/cream |
| Surface | `#FFFFFF` | `--surface: #FFFFFF` | `--tvp-surface: #FFFFFF` | ✅ |
| Line | (not specified in your summary) | `--line: #EDE8E0` (warm) | `--tvp-line: #EDE8E0` | Warm neutral, likely drifts from spec's cooler grays |

**Also missing entirely from our tokens:** amber as a brand accent (only exists as a warning color), a "color-coded divider under headers" pattern.

## 2. Radius scale

| Token | Prototype spec | Ours (`:root`) | Ours (`.tv-app`) |
|---|---|---|---|
| sm | 6px | `calc(var(--radius) - 4px)` = **10px** | `--tvp-radius-sm: 10px` |
| base | 10px | `--radius: 14px` | `--tvp-radius-md: 14px` |
| lg | 14px | `--radius-lg: 18px` | `--tvp-radius-lg: 18px` |
| xl | — | `--radius-xl: 22px` | `--tvp-radius-xl: 22px` |

❌ **Every step is ~4-8px larger than the spec.** Our design is visibly rounder/softer than the prototype target. The home page portal cards specifically inherit `tv-card` → `border-radius: var(--radius-xl)` = **22px**, vs spec's 10px card radius.

## 3. Typography

| Aspect | Prototype spec | Home page actual |
|---|---|---|
| Font stack | `-apple-system, Segoe UI, Roboto, ...` | `Arial, Helvetica, "Liberation Sans", sans-serif` (from `@theme inline --font-sans` + `body`) |
| Base body size | 13-14px | Tailwind default 16px; portal card body uses `text-[13.5px]` inline |
| Large heading weight | 700 | Home H1 uses `font-black` = **900** |
| Large heading tracking | -0.2 to -0.8px | `letter-spacing: -0.01em` on h1-h4 globally; home H1 adds `tracking-tight` |
| Portal card title | — | `text-[17px] font-black` (900) |

❌ Font family is completely different (Arial vs system stack). ❌ Heading weight is 900 across the board, spec is 700. Tracking is in the right direction but not calibrated to the spec's pixel values.

## 4. Cards & buttons

**Portal cards on the home page** (`tv-card` utility applied in `src/routes/index.tsx`):
- Border: `1px solid var(--line)` ✅ matches spec's "1px solid border"
- Radius: **22px** (`--radius-xl`) ❌ spec is 10px
- Padding: `p-6` = **24px** ❌ spec is `22px 26px` (asymmetric)
- Shadow: `--shadow-soft: 0 5px 18px rgba(20,32,51,0.05)` — spec didn't specify, but present

**Buttons on the home page:** The landing page has **no buttons** — only `<Link>`-wrapped cards. So there's nothing to compare against `.btn-primary` / `.btn-secondary` on this specific page. The utilities `tv-btn-primary` (teal bg, height 48px, radius 12px, weight 800) and `tv-btn-secondary` (white + `--line-strong` border) exist elsewhere and roughly match the spec's shape but with heavier font-weight (800 vs implied 700) and different radius (12px vs 10px).

## 5. Icons

Prototype: custom inline SVG, stroke-based, `stroke-width: 1.7`, unfilled.

Home page (`src/routes/index.tsx`): uses **lucide-react** (`Building2`, `Users`, `User`, `Heart`, `ShieldCheck`, `ArrowRight`). Lucide defaults to `stroke-width: 2`, stroke-based, unfilled.

Partial match: ✅ stroke-based / unfilled style is right. ❌ Stroke width is 2 vs spec's 1.7, and they're not the prototype's hand-authored SVG set — different shapes for the same concepts.

## 6. Other home-page-specific observations

- The teal brand mark tile uses inline `background: var(--teal)` = `#086A70`, same drift as row 1 above.
- The "Portal selector · Demo" eyebrow uses `text-teal` (again `#086A70`, not the spec's deeper `#064E58`).
- No amber accent anywhere on the page — the spec's "color-coded divider under headers" pattern isn't present at all on this page.
- Hero copy uses `text-[40px] md:text-[52px] font-black` — the spec doesn't cover a hero this large, so this is invented, not drifted.

---

## Summary of drift

| Area | Verdict |
|---|---|
| Teal primary hue | Off — ours is `#086A70`, spec is `#064E58` (deeper) |
| Amber as brand accent | **Missing** — we only have amber as a warning color |
| Neutral grays (ink, ink-soft, bg) | Off — ours are bluer + warmer background |
| Radius scale | Off — ours is 4-8px rounder at every step |
| Font family | Off — Arial vs system stack |
| Heading weight | Off — 900 vs 700 |
| Icon style | Close — stroke-based, unfilled ✓; stroke-width and specific icon set differ |
| Card border + surface color | ✅ matches |
| Buttons on this specific page | N/A — page has no buttons |

## Open questions before any redesign

1. Is the M0-M7 prototype spec's token set intended to **replace** our current TalVault tokens across the whole app, or is it a **third look** applied only to the landing page? If it replaces globally, the change is much larger than the home page.
2. Does "amber as secondary accent + color-coded divider under headers" apply to the landing page specifically, or is it a portal-page pattern that the home page shouldn't adopt?
3. Do you want the deeper teal `#064E58` to become the canonical brand token (updating sidebar, buttons, badges everywhere), or only the landing page's brand mark and headings?

I'll wait for direction on scope before proposing an implementation plan.
