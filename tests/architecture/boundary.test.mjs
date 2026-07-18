import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const RULES = {
  "app.js": { layer: "client", allowed: (value) => value.startsWith("https://") },
  "supabase/functions/calendar-ical/index.ts": { layer: "edge-http", allowed: (value) => value.startsWith("npm:") || ["./ical.ts", "./availability.ts"].includes(value) },
  "supabase/functions/calendar-ical/ical.ts": { layer: "ical-domain", allowed: (value) => value.startsWith("npm:") },
  "supabase/functions/calendar-ical/availability.ts": { layer: "availability-domain", allowed: () => false },
};
const IMPORT = /\b(?:from\s+|import\s*(?:\(\s*)?)(['"])([^'"]+)\1/g;
const known = JSON.parse(fs.readFileSync(new URL("./known-violations.json", import.meta.url), "utf8"));

function violations() {
  const found = [];
  for (const [file, rule] of Object.entries(RULES)) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT)) {
      const target = match[2];
      if (rule.allowed(target)) continue;
      const line = source.slice(0, match.index).split("\n").length;
      found.push({ file, line, imports: target, from_layer: rule.layer, to_layer: "forbidden" });
    }
  }
  return found;
}

test("no new architecture violations", () => {
  const all = violations();
  const allowed = new Set(known.map((item) => `${item.file}:${item.imports}`));
  const fresh = all.filter((item) => !allowed.has(`${item.file}:${item.imports}`));
  assert.equal(fresh.length, 0, fresh.map((item) => `VIOLATION: ${item.file}:${item.line} imports ${item.imports} — ${item.from_layer} cannot import ${item.to_layer}. See docs/architecture/LAYERS.md`).join("\n"));
  assert.ok(all.length <= known.length, "Violation count increased. Fix a violation; never extend the baseline.");
});
