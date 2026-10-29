---
target: critique a landing page
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:F:\\SAASLEDS\\frontend-index-html"
timestamp: 2026-10-29T20-17-24Z
slug: frontend-index-html
---
# Critique Report — frontend/index.html (slug: frontend-index-html)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | LIVE/OFFLINE badge + latency footer + toast + bell count; no loading spinners during API calls |
| 2 | Match System / Real World | 3 | pt-BR + domain terms (campanha, LED, veiculação); "planilha"/"exportar" jargon leaks, API errors surface raw |
| 3 | User Control and Freedom | 3 | Confirm dialogs, Sair logout, breadcrumb, modal backdrop dismiss; no undo on deletion |
| 4 | Consistency and Standards | 3 | Reusable component classes, consistent dark theme; duplicate Backup tab, tabs are divs not buttons |
| 5 | Error Prevention | 2 | Confirm before delete, form validation; inline edits auto-save on blur with no confirmation |
| 6 | Recognition Rather Than Recall | 3 | Status dots carry color + text labels; icon-only topbar nav (emoji, no text labels) |
| 7 | Flexibility and Efficiency | 1 | No keyboard shortcuts, no bulk actions beyond multi-select delete, no accelerators |
| 8 | Aesthetic and Minimalist Design | 3 | Color used only as signal, no decorative clutter; topbar is information-dense |
| 9 | Error Recovery | 2 | spot-msg ok/erro/auth variants; some errors use bare `alert()` |
| 10 | Help and Documentation | 0 | No help system, tooltips, documentation, or onboarding |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict

Authored for this product. The pt-BR language, "veiculação" domain, LED panel/campaign scheduling model, and KPI-first dispatch layout are specific to SaaS LED control — an unrelated product could not use this unchanged. Character is utilitarian and disciplined (dark surfaces, color-as-signal). The risk is not interchangeability but density without hierarchy: the topbar stacks LIVE, KPIs, city, profile, config, and notifications in one row, competing for attention.

## Overall Impression

What works: a cohesive, restrained dark design system where color carries meaning only as signal. What doesn't: the entry experience drops users into a complex ops surface with zero guidance, icon-only navigation, and no keyboard paths. Single biggest opportunity: reduce cognitive load on the dashboard by giving every icon a text label and adding contextual help — the interface currently assumes the user already knows it.

## What's Working

1. Disciplined color-as-signal system — aqua-mint stays rare (live/active only), amber/warn and coral-red/error are reserved; no decorative color. Matches DESIGN.md's "One Voice Rule."
2. Responsive layout — .grid (2fr/1fr) collapses to 1fr at 980px; .spot-row collapses at 560px; cards use consistent 16px radius and 22px padding.
3. Clear system status — LIVE/OFFLINE badge, latency footer, unread-notification bell count, and toast stack keep the user informed about connection and actions.

## Priority Issues

**[P1] Icon-only topbar navigation** — Topbar uses emoji-only buttons (📺 LEDs, 🗓️ Reservas, ⚙️ Configuração, 🔔 bell, 👤 profile) with no visible text labels. Jordan (first-timer) cannot tell what they do; Sam (screen reader) gets only emoji + title attribute. Fix: Add visible text labels to every topbar action button.

**[P1] No help, onboarding, or documentation** — After login the user lands on a dense dashboard with no tour, tooltips, or help entry. Heuristic 10 scores 0. Fix: Add contextual tooltips and a first-run onboarding flow.

**[P2] Information overload in the topbar** — KPI strip, city select, live badge, profile pill, config button, bell, and logout button all sit in one row with equal visual weight. Cognitive load checklist fails "single focus" and "visual hierarchy." Fix: Group secondary actions under a menu or split into tiers; one primary element, 2–3 secondary, rest muted.

**[P2] No keyboard shortcuts or accelerators** — Every action is mouse-driven. Alex (power user) faces a slow, patronizing workflow with no shortcuts, no bulk actions beyond delete, no customization. Fix: Add keyboard shortcuts for common actions (nav, save, close modal, dismiss toast).

**[P3] Inline table editing auto-saves on blur** — Campaign name fields save on onBlur with no confirm/cancel. Riley (edge case) can accidentally overwrite data by tabbing out. Fix: Add explicit Save/Cancel per row or a confirmation before persisting inline edits.

## Persona Red Flags

**Alex (Power User)** — No keyboard shortcuts detected. Multi-select delete requires clicking each checkbox individually, then a separate danger button. No bulk actions beyond deletion. Will abandon if daily use feels slow.

**Jordan (First-Timer)** — Login screen exposes demo credentials ("Demo: admin/admin123 · viewer/view123") in plain UI copy. No welcome, tour, or help after login; domain terms like "planilha" and "veiculação" are unexplained. Will abandon at step 2.

**Sam (Accessibility-Dependent)** — Icon-only nav buttons lack accessible text labels (emoji + title only). No visible custom focus indicators beyond browser default. Modal backdrop click closes — could trap keyboard users.

## Minor Observations

- Duplicate Backup tab appears twice in the config tabs (App.tsx:1249 and 1250).
- "Fechar todas" toast button only renders when >1 notification — inconsistent visibility.
- Offline mode is signaled only in the footer ("MODO OFFLINE") — no prominent banner explaining data is mock.
- Date inputs accept ISO but display via br() (DD/MM/YY) — format mismatch may confuse.
