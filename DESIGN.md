---
name: SaasLeds LED Control
description: Dark dispatch panel for LED veiculação (campaign scheduling) across cities
colors:
  deep-ink: "#0b1224"
  surface-slate: "#131b32"
  surface-deep: "#0f1730"
  border-steel: "#232d4a"
  near-white: "#eef1f8"
  slate-gray: "#8b93ab"
  aqua-mint: "#2dd4bf"
  amber: "#f5943a"
  sky-blue: "#4f8ff7"
  lavender: "#8b7cf6"
  coral-red: "#f0546a"
typography:
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: 1.4
  display:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.03em"
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "0.66rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.05em"
    textTransform: uppercase
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  card: "16px"
  pill: "20px"
components:
  button-primary:
    backgroundColor: "{colors.aqua-mint}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    fontWeight: 700
  button-ghost:
    backgroundColor: "{colors.surface-deep}"
    textColor: "{colors.near-white}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    fontWeight: 400
  input-field:
    backgroundColor: "{colors.surface-deep}"
    textColor: "{colors.near-white}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  card:
    backgroundColor: "{colors.surface-slate}"
    rounded: "{rounded.card}"
    padding: "22px"
---

# Design System: SaasLeds LED Control

## Overview

**Creative North Star: "The Signal Board"**

A clean, modern dispatch surface for scheduling LED campaigns across cities. The system reads like a signal board: dark, receding surfaces that let information — not chrome — carry the weight. Density is high but controlled: KPI strips, compact tables, and small badges sit close together within cards, while generous separation sits between major blocks so the screen never feels cramped. The philosophy is utilitarian precision dressed in a restrained dark aesthetic; color is reserved for signal (live, warn, error, status) and never used as decoration.

**Key Characteristics:**
- Dark receding surfaces (deep-ink / surface-slate) with near-white text
- Color used only as signal: aqua-mint for live/active, amber for warn, coral-red for error
- Flat depth: panels separated by border-steel and tonal steps, no offset shadows
- Refined and restrained components: subtle borders, muted small labels, small caps
- Compact data density inside cards, generous space between sections

## Colors

A dark neutral base with a single saturated accent (aqua-mint) used strictly as signal; every other hue names a status role.

### Primary
- **Aqua Mint** (#2dd4bf): Live/active state — the "live" pill, active tab borders, primary button fill, donut/bar chart fills. Its rarity is the point: it marks what is happening now.

### Secondary
- **Sky Blue** (#4f8ff7): Secondary gradient partner in the brand icon (linear-gradient with aqua-mint); used sparingly alongside aqua-mint in the brand mark and progress fills.

### Neutral
- **Deep Ink** (#0b1224): Page background (`--bg`). The deepest surface; everything else lifts off it.
- **Surface Slate** (#131b32): Card and panel container background (`--panel`). The default surface for contained content.
- **Surface Deep** (#0f1730): Elevated sub-surface — topbar background, input fields, toolbar selects (`--panel2`). One step darker than Surface Slate to indicate containment without shadows.
- **Border Steel** (#232d4a): All card, input, topbar, and table borders (`--border`). The sole depth mechanism alongside color steps.
- **Near White** (#eef1f8): Primary body text (`--text`). High contrast against Deep Ink.
- **Slate Gray** (#8b93ab): Muted secondary text — labels, captions, sub-text (`--muted`). Tinted blue-gray, never neutral gray.

### Named Rules
**The One Voice Rule.** The primary accent (aqua-mint) covers ≤10% of any given screen. Its rarity is the point; never use it for decoration or background fields.

## Typography

**Display Font:** Arial (with Helvetica, sans-serif fallback)
**Body Font:** Arial (with Helvetica, sans-serif fallback)
**Label/Mono Font:** None distinct; labels reuse body in uppercase at small sizes.

**Character:** A single utilitarian face throughout. Hierarchy is carried by size, weight, and letter-spacing rather than by mixing typefaces — appropriate for a dispatch panel where legibility at small sizes matters more than expression.

### Hierarchy
- **Display** (400, 1.05rem, 1.2, tracking 0.03em): Brand/product name in the topbar and login card. Smallest "display" role in the system.
- **Headline** (400, 1rem, 1.2, tracking 0.02em): Card section headings (e.g. "OCUPAÇÃO POR LED").
- **Title** (400, 0.85rem, 1.2): Login/form field prominence and modal titles.
- **Body** (400, 0.78rem, 1.4): Default paragraph and table cell text. Max comfortable measure well under 65ch given compact panels.
- **Label** (700, 0.66rem, 1.2, tracking 0.05em, uppercase): Field labels, KPI captions, table headers. Small caps are the system's label voice.

## Layout

Container: `.wrap` max-width 1400px, centered, 20px padding. Two-column split at desktop (`.grid`: 2fr / 1fr, gap 18px) collapsing to a single column at 980px; a secondary `.grid2` (1fr / 1fr) follows the same breakpoint. Vertical rhythm: margin-bottom 18px between cards and major blocks; cards carry internal padding of 22px. No defined spacing scale — spacing values are ad-hoc per component (topbar padding 16px 22px, pill padding 8px 14px, toast padding 10px 14px). Mobile: stack to one column below 980px; `.spot-row` collapses to 1fr below 560px; `.ledrow` label narrows to 90px.

## Elevation & Depth

Flat by default. Depth is conveyed through tonal layering (Deep Ink → Surface Slate → Surface Deep) and 1px Border Steel edges, not shadows. The only shadows in the system are the notification panel (`box-shadow: 0 12px 32px rgba(0,0,0,.5)`) and toasts (`box-shadow: 0 8px 24px rgba(0,0,0,.35)`) — ambient, structural overlays that float above the page. No offset shadows, no hard block shadows anywhere else.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover) or as structural overlays (toasts, notification panel); never as card depth.

## Shapes

Form language is rounded but disciplined. Cards use a 16px radius; topbar and pill-shaped badges use 20px; small badges and segment chips use 20px; inputs, selects, and toast actions use 4–8px; track segments and status dots use 6–8px and 50% respectively. No sharp 0px corners except where a segment abuts a track edge (border-radius: 6px 6px 0 0 on bar fills). Borders are uniformly 1px Border Steel; clipping is overflow:hidden on tracks and donut segments.

## Components

All components are refined and restrained: subtle borders, muted small labels, small-caps voice, no gradient text, no glass decoration.

### Buttons
- **Shape:** 6px radius (`{rounded.md}`)
- **Primary:** aqua-mint fill on deep-ink text, padding 6px 12px, font-weight 700; gradient teal→blue on login submit and brand icon. Hover: teal brightens.
- **Hover / Focus:** border shifts to aqua-mint for ghost/toolbar buttons; primary deepens slightly. No heavy transforms.
- **Secondary / Ghost / Tertiary:** surface-deep background, near-white text, 1px border-steel; danger variants use coral-red fill at 12% opacity with coral-red border at 40% opacity.

### Cards / Containers
- **Corner Style:** 16px radius (`{rounded.card}`)
- **Background:** Surface Slate (`{colors.surface-slate}`)
- **Shadow Strategy:** Flat; 1px Border Steel border only. Reference Elevation section.
- **Border:** 1px solid Border Steel
- **Internal Padding:** 22px (`.card`); sub-headings above body with 4px heading-to-body gap and 18px bottom margin.

### Inputs / Fields
- **Style:** Surface Deep background, near-white text, 1px Border Steel stroke, 4–8px radius.
- **Focus:** No custom focus ring beyond the incumbent border; no glow.
- **Error / Disabled:** `.spot-msg.erro` uses coral-red fill at 12% opacity with coral-red border at 40% opacity; no distinct disabled token beyond muted text.

### Navigation
- **Style:** `.topbar` — Surface Deep background, 1px Border Steel, 14px radius, 16px 22px padding, flex row with space-between. `.tab` — 9px radius, surface-deep background, border-steel, muted text; active state uses aqua-mint fill at 12% with aqua-mint text at 40% opacity and bold weight. Mobile treatment: wraps with gap 14px.

### Toast
- **Style:** Surface Deep background, 1px Border Steel, 10px radius, 4px left accent border (amber default, coral-red for error).
- **Shadow:** 0 8px 24px rgba(0,0,0,.35) — structural overlay.
- **Position:** Fixed top-center, draggable by title.

## Do's and Don'ts

### Do:
- **Do** use aqua-mint (≤10% of screen) only for live/active signal.
- **Do** separate panels with 1px Border Steel and tonal steps rather than shadows.
- **Do** set labels in uppercase at 0.66rem, weight 700, tracking 0.05em.

### Don't:
- **Don't** add kicker/eyebrow labels above headings; the heading carries its own weight.
- **Don't** use gradient text or glass/blur decoration.
- **Don't** add offset (zero-blur) block shadows outside a neobrutalist world.
- **Don't** reassert token hex values in prose; the frontmatter is normative.
