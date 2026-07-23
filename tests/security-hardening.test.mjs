import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260720170000_calendar_integrity_hardening.sql",
  "utf8",
);
const edge = readFileSync("supabase/functions/calendar-ical/index.ts", "utf8");
const pinAccessMigration = readFileSync(
  "supabase/migrations/20260721120000_family_pin_access.sql",
  "utf8",
);
const manualSyncMigration = readFileSync(
  "supabase/migrations/20260723210000_calendar_manual_sync_request.sql",
  "utf8",
);

test("the family PIN is the only interactive access gate", () => {
  assert.match(app, /const FAMILY_KEY = "9014"/);
  assert.doesNotMatch(app, /signInWithOAuth|requireAuthorizedSession|AUTHORIZED_EMAILS/);
  assert.match(pinAccessMigration, /to anon/);
  assert.match(pinAccessMigration, /grant select, insert, update on public\.reservations to anon/i);
});

test("deletes are recoverable and feeds exclude deleted reservations", () => {
  assert.match(app, /update\(\{ deleted_at:nowIso\(\) \}\)/);
  assert.match(app, /is\("deleted_at", null\)/);
  assert.match(edge, /\.is\("deleted_at", null\)/);
  assert.match(migration, /calendar_change_log is append-only/);
});

test("configured production never falls back to divergent local writes", () => {
  assert.match(app, /unavailableStore\("No se pudo conectar al calendario compartido"\)/);
  assert.match(app, /configuredButFailed = true/);
});

test("manual sync reuses the protected cron function without exposing its secret", () => {
  assert.match(manualSyncMigration, /security definer/i);
  assert.match(manualSyncMigration, /public\.invoke_calendar_ical_sync\(\)/);
  assert.match(manualSyncMigration, /grant execute .* to anon, authenticated/i);
  assert.doesNotMatch(app, /SYNC_SECRET|x-sync-secret/);
});
