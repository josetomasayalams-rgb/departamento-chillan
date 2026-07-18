import fs from "node:fs";

const required = ["index.html", "styles.css", "app.js", "manifest.webmanifest", "schema.sql"];
const failures = required.filter((file) => !fs.existsSync(file)).map((file) => `Missing ${file}: restore the static application contract.`);
const html = fs.readFileSync("index.html", "utf8");
if (!html.includes("styles.css")) failures.push("index.html must load styles.css: keep presentation separate from behavior.");
if (!html.includes("app.js")) failures.push("index.html must load app.js: keep the client entry point explicit.");
const app = fs.readFileSync("app.js", "utf8");
if (!app.includes("initStore")) failures.push("app.js must retain initStore(): UI persistence must stay behind state.store.");
const rules = {
  "app.js": (value) => value.startsWith("https://"),
  "supabase/functions/calendar-ical/index.ts": (value) => value.startsWith("npm:") || ["./ical.ts", "./availability.ts"].includes(value),
  "supabase/functions/calendar-ical/ical.ts": (value) => value.startsWith("npm:"),
  "supabase/functions/calendar-ical/availability.ts": () => false,
};
const importPattern = /\b(?:from\s+|import\s*(?:\(\s*)?)(['"])([^'"]+)\1/g;
for (const [file, allowed] of Object.entries(rules)) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const target = match[2];
    if (allowed(target)) continue;
    const line = source.slice(0, match.index).split("\n").length;
    failures.push(`VIOLATION: ${file}:${line} imports ${target} — its layer cannot import that target. See docs/architecture/LAYERS.md`);
  }
}
if (failures.length) throw new Error(failures.join("\n"));
console.log("Static contract and boundary lint passed.");
