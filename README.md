# FitDNA

**Know your fit. Before you buy.**

FitDNA builds a *Fit Passport* from a guided phone body scan plus a few reference garments you already own, then predicts how tops and jackets across every marketplace will fit you — with a Purchase Confidence Score that blends fit, price history, condition and seller reliability.

## Repo layout

- `apps/web` — Next.js 16 app (App Router, Tailwind v4). Screens implemented from the design mockups:
  - `/` Wardrobe dashboard: reference garments, recent predictions, passport nudge
  - `/passport` Fit Passport: measurements, fit preferences, reference garment slots
  - `/search` Marketplace search with Purchase Confidence Score and "fits me" filter
  - `/search/[id]` Fit map v1 for a listing (coloured zones, no cloth physics)
- `design/` — `ROADMAP.md` (plan, stack, legal gates), `DESIGN-dell-1996.md` (visual system spec), and `support.js` (generated design-canvas runtime; do not edit)

Visual language is the Dell '96 catalog system: black page frame, ribbon cards, eight-colour tint family used as fit-zone colours, Arial Black / Helvetica / Times stack, hard shadows only.

## Run

```bash
cd apps/web
npm install
npm run dev      # http://localhost:3000
npm run build && npm run start
npm run lint
```

All data is currently static mock data in `apps/web/src/lib/data.ts`. Swap it for the Fit Passport / fit-engine API when the backend lands (see the roadmap in the design project).
