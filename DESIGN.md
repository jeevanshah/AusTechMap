# Design System — Australia Tech Map

Locked design system. All coding agents (Claude, Codex, Gemini) and Hallmark runs read this file first; all pages and components defer to it. Amend intentionally — this file is the rule.

## System & Philosophy

- **Genre**: National Registry & Institutional Opportunity Intelligence
- **Inspiration**: SEEK / Braid design system, Australian Commonwealth portals, official registry records
- **Macrostructure**: High-density technical registry, split map/directory canvas, verified provenance records
- **Anti-Slop Stance**: Strict rejection of generic AI templates (no single-hue emerald opacities, no 3-card feature columns, no purple/blue gradients, no invented metrics, no uncoordinated hover fades)

## Typography

| Role                   | Family              | Fallback                                                            | Intended Usage                                                                      |
| :--------------------- | :------------------ | :------------------------------------------------------------------ | :---------------------------------------------------------------------------------- |
| **Headings / Display** | `Plus Jakarta Sans` | `var(--font-sans), sans-serif`                                      | Page `h1`, section `h2`, modal titles, company display names                        |
| **Body / UI**          | `Inter`             | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | Descriptions, search inputs, general copy, table content                            |
| **Data / Monospace**   | `JetBrains Mono`    | `"SF Mono", Menlo, Monaco, Consolas, monospace`                     | Employer counts, ABNs, visa subclasses (e.g. 482), dates, timestamps, registry keys |

## Design Tokens (Tailwind v4 `@theme` in `apps/web/src/app/globals.css`)

```css
@theme {
  --color-canvas: #f8fafc; /* Base app background */
  --color-surface: #ffffff; /* Card and panel fill */
  --color-surface-border: #e2e8f0; /* Default 1px structural border */

  /* Deep Navy (Institutional chrome, headers, primary buttons) */
  --color-navy-50: #f0f4f8;
  --color-navy-100: #d9e2ec;
  --color-navy-800: #1e3a5f;
  --color-navy-900: #0f172a; /* Main ink & dark buttons */
  --color-navy-950: #070d19;

  /* Australian Ochre (Primary interactive accent, active states, map clusters) */
  --color-ochre-50: #fffbeb;
  --color-ochre-100: #fef3c7;
  --color-ochre-500: #f59e0b;
  --color-ochre-600: #d97706; /* Primary accent */
  --color-ochre-700: #b45309; /* Map cluster stroke & text */
  --color-ochre-800: #92400e;

  /* Commonwealth Forest (Visa sponsorship evidence & high-trust verification) */
  --color-forest-50: #ecfdf5; /* Evidence card background */
  --color-forest-600: #059669;
  --color-forest-700: #047857; /* Shield check icon */
  --color-forest-800: #065f46; /* Trust badge text */
  --color-forest-900: #064e3b; /* Evidence headline */

  /* Pacific Cobalt (Oceanic intelligence, individual map pins, interactive focus) */
  --color-pacific-50: #eff6ff;
  --color-pacific-100: #dbeafe;
  --color-pacific-500: #3b82f6;
  --color-pacific-600: #2563eb;
  --color-pacific-700: #1d4ed8;
}
```

## Anti-Slop Quality Gates (Hallmark & Colorize Adaptation)

1. **No Invented Numbers or Social Proof**: Never display placeholder counts, fake testimonials, or fictional metrics. Real indexed data only (`{count} verified Australian tech employers indexed`).
2. **60-30-10 Color Architecture (Colorize)**:
   - **60% Ground**: Clean `#F8FAFC` canvas and `#FFFFFF` cards. No dull yellow-cream or muddy sepia paper.
   - **30% Structural Ink**: Deep Navy `#0F172A` and Slate `#475569` for confident readability.
   - **10% Purposeful Semantics**: Cobalt `#2563eb` for pins, Forest `#065F46` for trust, and multi-tier density on the map.
3. **No Decorative Numbered Steps**: Do not use `01 / 02 / 03` markers unless the UI represents a genuine chronological workflow.
4. **No Single-Word Gradient or Italic Accents**: Do not isolate single words in a headline with different colors or italicization.
5. **No Pastel Icon Circles**: Icons are functional glyphs (e.g. `ShieldCheckIcon` for visa evidence), not emojis centered inside pastel circles.
6. **Provenance Over Blankness ("Empty Husk" rule)**: When data is sparse, render an official registry metadata strip (`STATUS`, `DOMAIN`, `REGISTERED`, `VERIFIED`) and honest disclosure states.
7. **Accessibility & Contrast**: All body text and labels must maintain WCAG AA contrast (minimum 4.5:1 for normal text) against `#f8fafc` and `#ffffff`.
8. **Restrained Motion**: Micro-interactions are responsive only (button clicks, filter toggles, map zooms).

## Map Conventions (`MapCanvas.tsx`)

- **Multi-Tier Density Clusters (Sequential Pacific Cobalt)**:
  - `40+ companies`: Midnight Navy Cobalt `#0f2963` (Metro tech center: Sydney)
  - `20–39 companies`: Royal Cobalt `#1d4ed8` (Major tech hubs: Melbourne)
  - `10–19 companies`: Pacific Cobalt `#2563eb` (Established hubs: Brisbane, Perth)
  - `5–9 companies`: Medium Azure `#3b82f6` (Emerging hubs: Adelaide, Canberra, Wollongong, Newcastle)
  - `1–4 companies`: Sky Cobalt `#60a5fa` (Regional clusters: Darwin, Hobart)
- **Unclustered Pins**: Filled with Pacific Cobalt `#2563eb` with a crisp 2px white `#ffffff` stroke.
- **Interactions**: Smart click-to-zoom using `getClusterExpansionZoom`, plus navigation zoom controls.
