import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260720170000_calendar_integrity_hardening.sql",
  "utf8",
);
const edge = readFileSync("supabase/functions/calendar-ical/index.ts", "utf8");

test("writes require one of the two authenticated administrators", () => {
  assert.match(migration, /josetomasayalams@gmail\.com/);
  assert.match(migration, /scamussotomayor@gmail\.com/);
  assert.match(migration, /revoke all on public\.reservations from anon/i);
  assert.match(migration, /to authenticated[\s\S]*is_calendar_admin/i);
  assert.doesNotMatch(migration, /create policy "public write"/i);
});

test("deletes are recoverable and feeds exclude deleted reservations", () => {
  assert.match(app, /update\(\{ deleted_at:nowIso\(\) \}\)/);
  assert.match(app, /is\("deleted_at", null\)/);
  assert.match(edge, /\.is\("deleted_at", null\)/);
  assert.match(migration, /calendar_change_log is append-only/);
});

test("configured production never falls back to divergent local writes", () => {
  assert.match(app, /unavailableStore\("No se pudo conectar al calendario compartido"\)/);
  assert.match(app, /requireAuthorizedSession/);
});

