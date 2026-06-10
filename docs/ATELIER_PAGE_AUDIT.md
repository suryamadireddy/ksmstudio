# ATELIER PAGE AUDIT

Read-only audit of how far the current `/atelier` code is from the planned page, and what is reusable. Every claim cites a real path. Where something is not in the code, it says so.

> **Important framing — there are two different "plans" in play.**
> The repo already contains a written build spec at `docs/atelier-page-build-spec.md` ("v2 architecture": two wings, Studio-Mind, taste spine, an interactive architecture diagram). **The current code was built to that spec.** The `[PLANNED /atelier PAGE]` in this audit request is a *different, newer* plan that adds three things the build-spec plan never had: (a) four named temperaments **Clay, August, Cedar, Wren**, (b) a **"four forms" fan** centerpiece, and (c) a top-level **"one idea all the way through"** worked example. The gap list (§3) is scored against *your* planned page, not the doc. Where the doc and your plan disagree, I flag it. Reconciling the two is itself a decision (see §5).

---

## 1. Project & house-style map

### Framework / tooling
- **Next.js App Router**, not Pages. Routes live under `app/` with `page.tsx` / `layout.tsx` conventions. Next `^15.0.0`, React `^19.0.0` (`package.json:14-19`).
- **TypeScript** `^5.6` (`package.json:27`), strict path alias `@/*` used throughout (e.g. `app/atelier/page.tsx:2`).
- **Tailwind CSS v4** via `@import "tailwindcss"` + `@theme` block (`app/globals.css:1-8`), PostCSS (`postcss.config.mjs`, `package.json:21-23`).
- **Anthropic SDK** `^0.99.0` is a real dependency (`package.json:13`) — used by the Kiln's live evaluator (`app/api/evaluate/route.ts`, `app/atelier/kiln/EvaluatorChat.tsx`).

### Routes (actual files)
- `app/page.tsx` — home. `app/aboutme/page.tsx` — about.
- `app/atelier/page.tsx` — **/atelier** (this audit's subject).
- `app/meridian/page.tsx` + `app/meridian/layout.tsx` — Meridian, with nested `app/meridian/globetrotter/page.tsx` and `app/meridian/atlas/page.tsx`.
- `app/dreamspace/page.tsx`, `app/placemaking/page.tsx` — standalone case studies.
- `app/api/evaluate/route.ts` — API route backing the Kiln chat.
- **There is no top-level `/kiln` route and no `/ksm-studio` route.** Kiln now lives *inside* Atelier at `app/atelier/kiln/` (the old `app/kiln/page.tsx` is deleted — see `git status` in the session). "KSM Studio" exists only as an **external** link `https://ksmstudio.vercel.app/...` (`app/atelier/kiln/KilnContent.tsx:13`).

### Shared layout & components
- **`ProjectShell`** (`app/components/project/ProjectShell.tsx`) — the page frame: `<main>` padding, the clickable `KSM` home mark, and an optional `title` rendered as `.project-display-mark`. Used by atelier, dreamspace, placemaking, and (via chrome) meridian.
- **`ProjectCaseStudy.tsx`** — exports `CaseStudySection` (a labeled, optionally sticky-rail section) and `CaseStudyProse` (the standard prose block, `text-[var(--color-fg-muted)]`). These are the workhorse layout primitives across every case study.
- Other shared building blocks in `app/components/project/`: `CaseStudyImage.tsx`, `CaseStudyScrollDeck.tsx`, `CaseStudySpecAccordion.tsx`, `ProjectEmbed.tsx` (iframe embed), `ProjectThread.tsx`.
- Home/work components: `app/components/Work.tsx`, `WorkCard.tsx`, `HeroIntro.tsx`, `HeroLinks.tsx`, `Background.tsx`, `ColorSchemeToggle.tsx`, `contentLayout.ts` (the `contentBleed` / `contentMeasure` width helpers).

### Design system — fonts
Loaded with `next/font` in `app/layout.tsx:11-16,48` and mapped to CSS vars in `app/globals.css:5-7`:
- **Serif / display:** Instrument Serif → `--font-serif`. Surfaced as the `.display` utility (`globals.css:247-252`) and the `font-serif` role lines.
- **Sans / body:** Geist Sans → `--font-sans` (body default, `globals.css:34`).
- **Mono / labels:** Geist Mono → `--font-mono`. Surfaced as the `.label` utility (`globals.css:60-67`).
- **Diagram exception:** `app/atelier/ArchitectureDiagram.tsx:11-22` loads its **own** fonts — **IBM Plex Mono + Spectral** via `next/font/google` — scoped to `.arch-diagram-wrap`. This is a deliberate fork sanctioned by the build spec §6 ("apply only the diagram's structure + interaction… don't fork the whole site's system"). So the site has *two* type registers: the Geist/Instrument site system, and the Plex-Mono/Spectral diagram system.

### Design system — color tokens
Canonical palette is defined **once** in `app/theme-colors.ts` (`THEME_CSS_VARS`) and applied inline on `<html>` by an init script (`app/layout.tsx:9,52`) plus the runtime `ColorSchemeToggle`. Dark is default; light is a warm paper scheme. Tokens (both schemes in `theme-colors.ts:5-24`, dark mirrored in `globals.css:12-22`):

```
--color-bg            --color-fg            --color-border
--color-bg-elevated   --color-fg-muted      --color-border-strong
                      --color-fg-subtle      --color-work-title-hover
```
- The **diagram does not use these**. It declares a private clay/paper palette on `.arch-diagram-wrap` (`ArchitectureDiagram.tsx:576-590`): `--paper #eceae3`, `--ink #221f1b`, `--clay #b25a3a` (single accent), `--clay-tint`, `--line`, etc. This matches the spec's §6 token table exactly.

### Reusable interactive components
- **No 3D globe exists in this repo.** The "globe" is the *subject* of Meridian/Atlas (rendered with `globe.gl` in the *external* hosted apps, surfaced here only via `ProjectEmbed` iframes and prose — `app/meridian/atlas/page.tsx:52`). There is no Three.js / WebGL / canvas globe component to reuse.
- Real in-repo interactive components:
  - `ArchitectureDiagram.tsx` — SVG diagram + slide-over panel (the Atelier centerpiece-diagram).
  - `RoomTiles.tsx` — clickable tile grid bound to shared selection state.
  - `ProjectThread.tsx` — the Meridian/Globetrotter/Atlas evolution accordion-thread (CSS in `globals.css:472-705`).
  - `CaseStudySpecAccordion.tsx` — horizontal-on-desktop / vertical-on-mobile expanding accordion (`globals.css:259-470`).
  - `CaseStudyScrollDeck.tsx` — scroll-driven deck (used by Meridian problems/solutions).
  - `app/atelier/kiln/KilnRunDemo.tsx` + `EvaluatorChat.tsx` — animated pipeline demo + a **live** LLM chat.

### Meridian / Globetrotter / Atlas shared thread — CONFIRMED
Your claim is correct. `app/meridian/layout.tsx` wraps everything under `/meridian` in `MeridianEvolutionChrome` (`app/meridian/MeridianEvolutionChrome.tsx`), which renders `ProjectShell` + `ProjectThread`. `ProjectThread.tsx:6` types the thread as exactly `"globetrotter" | "meridian" | "atlas"`, and its `STEPS` array (`ProjectThread.tsx:19-47`) hard-codes those three (2024 → 2025 → 2026, "the experiment / the product / the vision"). Because Globetrotter and Atlas are **nested routes under `/meridian`**, they inherit this layout automatically. **Dreamspace and Placemaking are *not* in the thread** — they each call `ProjectShell` directly (`dreamspace/page.tsx:82`, `placemaking/page.tsx:21`) with no thread.

---

## 2. Current `/atelier` state

`app/atelier/page.tsx` is a thin server component: `ProjectShell title="ATELIER"` wrapping the client component `AtelierPageContent` (`app/atelier/AtelierPageContent.tsx`). All section copy is inline as string consts in that file. There is **no** separate `ATELIER_PAGE_COPY.md` in the repo (the build spec references one, but only the spec doc itself exists at `docs/atelier-page-build-spec.md`).

**Current section order and exact headings** (`AtelierPageContent.tsx:73-180`):
1. Hook — two paragraphs, no heading (`HOOK`, lines 11-14).
2. `<h2>` **"Presentation is judgment"** (line 81).
3. `<h2>` **"How it starts"** (line 89).
4. `<h2>` **"The studio"** (line 96) — intro line only.
5. **`<ArchitectureDiagram>`** (lines 102-108) — the interactive diagram.
6. Four `<h3>` sub-sections (lines 110-143): **"Judgment — where ideas are tested"**, **"Production — where ideas are made"**, **"The Studio-Mind"**, **"The Gallery"**.
7. **`<RoomTiles>`** (line 146) — six clickable tiles under the label "The components".
8. Conditional deep-dive (lines 149-159): when a room tile is selected, renders either `<KilnContent>` (for `kiln`) or `<AtelierComponentIntro>` (for the others), with a fade-in.
9. `<h2>` **"What makes it mine"** (line 162).
10. `<h2>` **"Where it is now"** (line 169).
11. `<h2>` **"Closing gesture"** (line 176).

State: a single `selectedId` (`useState`) is shared between the diagram and the tiles (`AtelierPageContent.tsx:56-71`), so clicking a node or a tile drives the same selection.

**The diagram** (`ArchitectureDiagram.tsx`, `atelierArchitectureData.ts`):
- Fixed `viewBox="0 0 1000 700"`, `width:100%` SVG. Layered bottom-up exactly as planned: **TASTE** band at the base (`y=603`, with a clay spine-accent bar on the left edge, lines 511-534), **STUDIO-MIND** full-width band above it (`y=478`, lines 471-503), the **JUDGMENT** and **PRODUCTION** wings at the top (frames at lines 168-188; Vault/Kiln/Bench/Scrapped/Workshop nodes), and **GALLERY** as a narrow vertical box *outside* the Production frame, far right, "faces out" (lines 424-463).
- Eight clickable nodes (vault, kiln, workshop, bench, scrapped, gallery, studiomind, taste); copy in `PANEL_COPY` (`atelierArchitectureData.ts:20-69`).
- Edge semantics match the plan: solid clay Kiln→Workshop "to the floor" path, faint dashed Kiln→Bench/Scrapped verdicts, dashed verticals for "rests on / draws from", with a 3-item legend (lines 105-109, 566-573).
- **Slide-over panel overlays, does not resize:** panel + scrim are absolutely-positioned siblings inside a `position:relative` `.arch-stage`; SVG keeps `width:100%` (lines 641-670, 793-827). Dismiss via close button, scrim click, and `Esc` (lines 82-89, 537-555). Hover + active node states present (lines 690-701).
- **Mobile bottom sheet:** `@media (max-width:640px)` turns the panel into a bottom sheet (`translateY`, full width, 78% height) and allows horizontal scroll on the stage (lines 926-951).
- Cold-box aesthetic, single clay accent, paper grain via `.arch-stage::before` (lines 648-664).

**RoomTiles** (`RoomTiles.tsx`): six tiles (Vault, Kiln, Workshop, Bench, Scrapped, Gallery) from `ROOM_TILES` (`atelierArchitectureData.ts:80-103`). All currently render text-only placeholders — no tile has an `image` set, and `public/atelier/` is empty except `.gitkeep`.

---

## 3. Gap list — current code vs. YOUR planned page

Scored Present / Partial / Missing against the `[PLANNED /atelier PAGE]` in the request.

| # | Planned piece | Status | Evidence / what's needed |
|---|---|---|---|
| A | **Section order:** hook → presentation is judgment → how it starts → the studio → one idea all the way through → what makes it mine → where it is now → closing gesture | **Partial** | Hook, "presentation is judgment," "how it starts," "the studio," "what makes it mine," "where it is now," "closing gesture" are all present in this order (`AtelierPageContent.tsx:73-180`). The **"one idea all the way through" slot is missing** as a top-level section (see D). Current page also inserts the diagram + RoomTiles + conditional deep-dive between "the studio" and "what makes it mine," which the planned order doesn't enumerate. |
| B | **Hook** | **Present** | `HOOK`, two paragraphs incl. "I direct; the studio is the crew." (`AtelierPageContent.tsx:11-14`). |
| C | **"Presentation is judgment"** thesis | **Present** | `<h2>` + `PRESENTATION_IS_JUDGMENT` (lines 16-18, 80-86). |
| D | **"How it starts"** (see the idea before you judge it) | **Present** | `<h2>` + `HOW_IT_STARTS` — "I get to see the thing before I do the heavy thinking about it" (lines 20-22, 88-93). |
| E | **"The studio": Judgment wing** | **Present** | `<h3>` "Judgment — where ideas are tested" + prose (lines 112-118). Also a diagram node + tile. |
| F | **"The studio": Production wing with four temperaments Clay, August, Cedar, Wren** | **Missing** | The Production wing exists as prose + a single diagram node **"Workshop"** ("the manifester → coding-agent handoff", `ArchitectureDiagram.tsx:388-422`; `PRODUCTION` copy lines 32-34). **The four temperaments do not exist anywhere** — `grep` for `august\|cedar\|wren\|temperament` returns nothing in `app/`, `content/`, or `docs/`. "Clay" appears only as the diagram's accent *color*, not a character. Needs: net-new concept — four named sub-agents, their copy, and a representation (nodes? tiles? a sub-fan?). Note this also contradicts the build-spec model, where Production is one room ("Workshop"). |
| G | **"The studio": the Studio-Mind** | **Present** | `<h3>` "The Studio-Mind" + prose (lines 127-134); diagram band; `PANEL_COPY.studiomind`. |
| H | **"The studio": the Gallery** | **Present** | `<h3>` "The Gallery" + prose (lines 135-142); diagram node "faces out"; tile. |
| I | **"One idea all the way through" — a worked example linking to /meridian** | **Partial** | The content *exists* but is **buried**: it's a "Worked example" section *inside* `KilnContent` (`app/atelier/kiln/KilnContent.tsx:150-167`), which only renders when the user clicks the **Kiln** room tile. It links to `/meridian` (line 163) and the external GeoNews exhibit (line 159). It is **not** a top-level Atelier section, and it's framed as a Kiln example, not an end-to-end "one idea all the way through" walk. Needs: promote/duplicate to a standalone Atelier section between "the studio" and "what makes it mine." |
| J | **"What makes it mine" (the taste spine)** | **Present** | `<h2>` + `WHAT_MAKES_IT_MINE` (lines 44-46, 161-166). Reinforced by the diagram's TASTE spine + `PANEL_COPY.taste`. |
| K | **"Where it is now"** | **Present** | `<h2>` + `WHERE_IT_IS_NOW` (lines 48-50, 168-173). |
| L | **Closing gesture** | **Present** | `<h2>` "Closing gesture" + `CLOSING_GESTURE` teasing the physical practice / director story (lines 52-54, 175-180). |
| M | **Centerpiece: curated "four forms" fan** (lit atmosphere / bold poster / drafted detail study / spare line sketch; fan them out, choose the cut) | **Missing** | No such component, data, or asset exists. The four forms appear only as *prose* inside `PRESENTATION_IS_JUDGMENT` ("a quick sketch… a single hard sentence… a rough prototype… a comparison", line 17) — conceptually adjacent but the named four (atmosphere/poster/detail study/line sketch) and the fan-and-choose interaction are absent. `public/atelier/` holds no source imagery. This is the single largest net-new build. |
| N | **Interactive architecture diagram** (cold/precise; layered bottom→top: taste base, Studio-Mind above, two wings above, Gallery facing out; click node → slide-over **overlay** not resize; bottom sheet on mobile) | **Present** | `ArchitectureDiagram.tsx` satisfies every stated property — see §2. This is essentially done and is your strongest existing asset. Minor caveats only: a vestigial `.arch-stage--open` class is toggled (line 109) though the panel overlays regardless; the diagram uses its own Plex-Mono/Spectral + clay palette rather than the site tokens (intentional per build-spec §6). |

**Headline:** the narrative skeleton, the taste-spine framing, and the interactive diagram are in good shape. The three things that define *your* newer plan over the in-repo build spec — **the four temperaments (F), the four-forms fan (M), and a surfaced "one idea all the way through" (I)** — are the real gap.

---

## 4. Reusable components & patterns you already have

- **Page scaffold:** `ProjectShell` + `CaseStudySection` + `CaseStudyProse` (`app/components/project/`). Every new Atelier section should use these for free house-style consistency.
- **The interactive diagram + slide-over pattern:** `ArchitectureDiagram.tsx` + `atelierArchitectureData.ts`. Overlay panel, scrim, Esc handling, mobile bottom sheet, hover/active states, legend — all built. Reuse as-is; this is the model for any "click → panel" interaction (incl. wiring temperaments if you choose nodes/tiles).
- **Shared selection state:** the `selectedId` lift in `AtelierPageContent.tsx:56-71` already unifies diagram + tiles. A temperament UI can plug into the same pattern.
- **`RoomTiles.tsx`:** clickable tile grid with active/hover transitions and optional per-tile `image`. A four-temperaments or four-forms grid could fork this rather than start cold.
- **Deep-dive copy slots:** `AtelierComponentIntro.tsx` (per-room intro copy, with placeholder art frames) and `KilnContent.tsx` / `KilnRunDemo.tsx` / `EvaluatorChat.tsx` (the Kiln deep dive, incl. the live `/api/evaluate` chat and the existing `/meridian` worked-example links).
- **Expanding / fanning UI precedents (for the "fan"):** `CaseStudySpecAccordion.tsx` (`globals.css:259-470`) and `ProjectThread.tsx` (`globals.css:472-705`) both already implement "several tiles, one expands/leads, others recede" with `flex-grow` transitions. A "four forms fan" is closest in spirit to these — they're the natural base to adapt rather than inventing the interaction from scratch.
- **External-link styling:** the underlined link treatment is duplicated in `meridian/page.tsx:103`, `dreamspace/page.tsx:71`, and `KilnContent.tsx:16` — reuse that class string for any new /meridian link.
- **Not available:** a 3D globe (lives in the external Meridian/Atlas apps only); any four-forms imagery (`public/atelier/` is empty).

---

## 5. Shortest honest path to the planned page

Ordered by leverage; the first item is a decision, not code.

1. **Reconcile the two plans first (decision, ~0 code).** `docs/atelier-page-build-spec.md` and your `[PLANNED /atelier PAGE]` disagree on three points: Production-as-one-Workshop vs. four temperaments; diagram-as-centerpiece vs. four-forms-fan-as-centerpiece; worked-example-inside-Kiln vs. a top-level section. Decide which governs before building, or you'll build against a spec the code already contradicts.

2. **Surface "one idea all the way through" (small, mostly a move).** The copy and the `/meridian` + GeoNews links already exist in `KilnContent.tsx:150-167`. Lift that into a standalone `CaseStudySection` in `AtelierPageContent.tsx`, placed between "The studio" block and "What makes it mine." Reframe from "Kiln worked example" to an end-to-end walk. Low risk, high narrative payoff.

3. **Add the four temperaments — Clay, August, Cedar, Wren (medium, net-new content + light UI).** Decide the representation: (a) prose sub-points under "Production," (b) four tiles forked from `RoomTiles.tsx`, or (c) four nodes inside the Production frame of the diagram wired to `PANEL_COPY`. Cheapest is (a)+(b) reusing existing patterns; (c) is more work because it changes the diagram's settled structure. Either way you must write their names, role lines, and panel copy — none exists today.

4. **Build the "four forms" fan centerpiece (largest, fully net-new).** No component, no interaction, no assets. Scope: (i) source or create the four visuals — lit atmosphere, bold poster, drafted detail study, spare line sketch — and drop them in `public/atelier/` (currently empty); (ii) build a fan-out / choose-the-cut interaction. Adapt `CaseStudySpecAccordion` or `ProjectThread`'s `flex-grow` "one-leads" mechanic rather than starting from zero. This is the long pole; estimate it independently of everything above.

5. **Diagram: leave it (done).** It already meets the planned spec. Optional tidy: drop the vestigial `.arch-stage--open` toggle (`ArchitectureDiagram.tsx:109`); decide whether the Plex-Mono/Spectral + clay palette should stay forked (it's intentional and looks deliberate — recommend keeping).

**Honest summary:** you are ~70% of the way on narrative + diagram, but the three elements that make *this* plan distinct from the one already implemented — the temperaments, the fan, and a foregrounded worked example — are roughly one small move, one medium content+UI task, and one substantial net-new component. The fan is the real cost; everything else is reuse and reordering.
