import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import app from "../app.js";

const { reconcileRollingView, rollingMonthWindow } = app;

test("construye una planificación de 30 días que cruza al mes siguiente", () => {
  const range = rollingMonthWindow("2026-07-18");
  assert.equal(range.start, "2026-07-18");
  assert.equal(range.endInclusive, "2026-08-16");
  assert.equal(range.endExclusive, "2026-08-17");
  assert.equal(range.dates.length, 30);
  assert.equal(range.dates[14], "2026-08-01");
  assert.equal(new Set(range.dates).size, 30);
});

test("señala el inicio de mes sólo en dorado, sin franjas ni tintes mensuales", () => {
  const appSource = fs.readFileSync("app.js", "utf8");
  const styles = fs.readFileSync("styles.css", "utf8");
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(appSource, /startsMonth \? " month-start"/);
  assert.match(styles, /\.cell\.month-start\{[^}]*251,191,36/s);
  assert.doesNotMatch(`${appSource}\n${styles}\n${html}`, /month-span|month-tone/);
});

test("el seguimiento diario avanza la ventana y la navegación manual la conserva", () => {
  assert.deepEqual(
    reconcileRollingView({ start: "2026-07-18", followsToday: true }, "2026-07-19"),
    { start: "2026-07-19", followsToday: true },
  );
  assert.deepEqual(
    reconcileRollingView({ start: "2026-06-01", followsToday: false }, "2026-07-19"),
    { start: "2026-06-01", followsToday: false },
  );
});
