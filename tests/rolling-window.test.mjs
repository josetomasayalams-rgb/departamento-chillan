import assert from "node:assert/strict";
import test from "node:test";
import app from "../app.js";

const { reconcileRollingView, rollingMonthWindow } = app;

test("construye una planificación de 31 días aunque cambie el mes", () => {
  const range = rollingMonthWindow("2026-07-18");
  assert.equal(range.start, "2026-07-18");
  assert.equal(range.endInclusive, "2026-08-17");
  assert.equal(range.endExclusive, "2026-08-18");
  assert.equal(range.dates.length, 31);
  assert.equal(range.dates[14], "2026-08-01");
  assert.equal(new Set(range.dates).size, 31);
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
