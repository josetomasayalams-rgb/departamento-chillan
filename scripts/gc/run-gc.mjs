import { execFileSync } from "node:child_process";
import fs from "node:fs";

const docs = ["ARCHITECTURE.md", "docs/architecture/LAYERS.md", "docs/SECURITY.md", "docs/STACK.md"];
const source = ["app.js", "schema.sql", "supabase/functions/calendar-ical/index.ts", "supabase/functions/calendar-ical/ical.ts"];
const failures = docs.filter((file) => !fs.existsSync(file)).map((file) => `Documentation drift: missing ${file}`);

function lastChange(file) {
  try {
    const worktree = execFileSync("git", ["status", "--porcelain", "--", file], { encoding: "utf8" }).trim();
    if (worktree) return Number.POSITIVE_INFINITY;
    const timestamp = execFileSync("git", ["log", "-1", "--format=%ct", "--", file], { encoding: "utf8" }).trim();
    return timestamp ? Number(timestamp) : 0;
  } catch {
    return fs.statSync(file).mtimeMs;
  }
}

if (failures.length === 0) {
  const newestSource = Math.max(...source.map(lastChange));
  const staleDocs = docs.filter((file) => lastChange(file) < newestSource);
  if (staleDocs.length) {
    failures.push(`Documentation drift: review ${staleDocs.join(", ")} after source changes; update the system of record or document why behavior did not change.`);
  }
}
if (failures.length) throw new Error(failures.join("\n"));
console.log("GC scan passed (architecture and documentation are current).");
