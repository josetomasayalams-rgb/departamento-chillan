# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A shared reservation calendar for a family apartment in Chillán, Chile. Vanilla JS — **no framework, no build step, and no package.json**. Dependency-free Node checks and Deno tests provide the repository verification harness. The UI is Spanish (`lang="es"`), week starts Monday, five families each with a fixed color.

Do not add a build pipeline, bundler, or test framework unless asked. The "no build" property is intentional.

`AGENTS.md` is the canonical orientation map. Use `ARCHITECTURE.md` and `docs/architecture/LAYERS.md` for current boundaries instead of duplicating new rules here.

## Run / deploy

```bash
cd "PLATAFORMAS CHILLAN/Reservas familiares"
python3 -m http.server 8000   # open http://localhost:8000 (http, NOT file://)
make ci
make gc
```

`file://` breaks the dynamic ES-module Supabase import and relative paths — always serve over http. The deployed artifact is the static directory described in `docs/guides/DEPLOYMENT.md`; `assets/chillan-bg.jpg` must ship with it.

## Architecture

The one thing that spans files and isn't obvious from a single read: **the storage backend is chosen at runtime**, not at build/config time.

- `app.js` exposes `CONFIG.supabaseUrl` / `CONFIG.supabaseAnonKey` at the top. **Empty = local mode** (localStorage); **filled = live mode** (Supabase, cross-device realtime).
- `initStore()` builds `state.store` with the *same interface* (`all()`, `add()`, `remove()`, `onChange()`) in either mode. Everything else in the app calls only `state.store` — it never knows which backend is active. New persistence backends = add one branch in `initStore`, nothing else changes.
- Live mode loads Supabase lazily via `await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")` — only fetched when keys are present, so local mode stays dependency-free.
- Realtime: live mode uses a Supabase `postgres_changes` channel; local mode uses the `storage` event for cross-tab sync. Both call `load()` on change.

**Primary data model** (`schema.sql`): `reservations` — `id` (uuid), `family_id` (text), `start_date`, `end_date` (date, `end >= start` constraint), `note`, `created_at`. The migrations add the external-calendar and synchronization tables. The public client credentials are not an authorization boundary; the current policy assumes a trusted family group, as documented in `docs/SECURITY.md`. **One selected date-range can pick multiple families** — `saveReservation()` inserts one row *per family*, all sharing dates and note.

**Render model**: `render()` fully rebuilds `#grid` every time on any data/view change (cheap; it's one month). Each cell filters `reservations` to those overlapping that day, sorts by family index for stable lane order, and draws `.seg` bars with `.start`/`.end`/`.pill` classes depending on whether the day is the segment's first/last/both. `CONFIG.maxLanes` caps visible bars per cell, then shows `+N`.

## Configuration lives in `app.js`, not CSS

- `CONFIG.families` — the family list, ids, names, and **colors**. Colors are applied inline from JS (`seg.style.background`, legend dots, swatches), so changing a family's color is a one-line edit in `CONFIG.families`, not a CSS change.
- `CONFIG.weekStart` (1=Mon), `yearMin`/`yearMax`, `maxLanes`.

CSS design tokens are CSS custom properties under `:root` in `styles.css` (`--glass-bg`, `--round`, `--text`, …) and the `.glass` / `.glass-soft` utilities carry the "Liquid Glass" look via `backdrop-filter`. Responsive cutoff is one `@media (max-width:560px)` block that collapses segment labels.

## Notes

- `ruvector.db` in the root is **not part of this app** — it's an unreferenced artifact (no code imports or reads it). Ignore it; do not wire it in.
- The large `oficial-nevados_…copy.jpg` is a source photo; the optimized background used by the app is `assets/chillan-bg.jpg`.
