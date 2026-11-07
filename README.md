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
cp .env.example .env.local   # optional: add Supabase keys to enable sign-in
npm run dev      # http://localhost:3000
npm test         # fit engine + database (RLS) tests
npm run build && npm run start
npm run lint
```

Without Supabase settings the app runs signed out on the demo data in `apps/web/src/lib/data.ts`. Pages move to the database as the milestones in `design/ROADMAP.md` land; the fit engine (`apps/web/src/lib/fit/`) is already real.
