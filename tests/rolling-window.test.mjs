import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import app from "../app.js";

const {
  CHECKIN_TIME,
  CHECKOUT_TIME,
  calendarSyncView,
  crossCalendarConflicts,
  externalEventsWithoutFamilyMirrors,
  reconcileRollingView,
  reservationTimingForDate,
  reservationVisibleOnDate,
  rollingMonthWindow,
} = app;
const stylesSource = fs.readFileSync("styles.css", "utf8");

test("oculta bloqueos que vuelven desde Airbnb o Booking cuando ya existe la reserva familiar", () => {
  const reservations = [
    { id:"family-a", start_date:"2026-08-01", end_date:"2026-08-03" },
  ];
  const externalEvents = [
    { source:"airbnb", external_uid:"a", start_date:"2026-08-01", end_date:"2026-08-03" },
    { source:"booking", external_uid:"b", start_date:"2026-08-07", end_date:"2026-08-09" },
    { source:"airbnb", external_uid:"c", start_date:"2026-08-07", end_date:"2026-08-09" },
  ];
  assert.deepEqual(externalEventsWithoutFamilyMirrors(reservations, externalEvents), [
    { source:"airbnb", external_uid:"c", start_date:"2026-08-07", end_date:"2026-08-09" },
  ]);
});

test("señala cruces parciales que no se pueden resolver automáticamente", () => {
  const reservations = [
    { id:"family-a", start_date:"2026-08-01", end_date:"2026-08-02" },
  ];
  const externalEvents = [
    { source:"airbnb", start_date:"2026-08-01", end_date:"2026-08-03" },
    { source:"booking", start_date:"2026-08-07", end_date:"2026-08-09" },
  ];
  const conflicts = crossCalendarConflicts(reservations, externalEvents);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].event.source, "airbnb");
});

test("distingue sincronización en vivo, atrasada e incompleta", () => {
  const now = Date.parse("2026-07-23T20:45:00.000Z");
  const current = [
    { source:"airbnb", status:"ok", last_success_at:"2026-07-23T20:30:00.000Z" },
    { source:"booking", status:"ok", last_success_at:"2026-07-23T20:31:00.000Z" },
  ];
  assert.equal(calendarSyncView(current, now).status, "live");
  assert.equal(calendarSyncView(current, now + 60 * 60 * 1000).status, "stale");
  assert.equal(calendarSyncView(current.slice(0, 1), now).status, "unavailable");
});

test("mantiene visible la sincronización en la navegación móvil", () => {
  assert.match(
    stylesSource,
    /\.nav \.btn:not\(\.icon\):not\(\.primary\):not\(#today\):not\(#sync-now\):not\(#undo\)\{ display:none; \}/,
  );
  assert.match(stylesSource, /\.nav #sync-now\{ grid-column:1 \/ span 2; grid-row:3; width:100%; \}/);
});

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

test("muestra check-in 15:00 y check-out 12:00 en el día real de salida", () => {
  const reservation = { start_date: "2026-08-07", end_date: "2026-08-09" };
  assert.equal(CHECKIN_TIME, "15:00");
  assert.equal(CHECKOUT_TIME, "12:00");
  assert.deepEqual(reservationTimingForDate(reservation, "2026-08-07"), {
    isStart: true, isEnd: false, label: "Check-in", time: "15:00",
  });
  assert.deepEqual(reservationTimingForDate(reservation, "2026-08-08"), {
    isStart: false, isEnd: false, label: "Reserva", time: null,
  });
  assert.deepEqual(reservationTimingForDate(reservation, "2026-08-09"), {
    isStart: false, isEnd: true, label: "Check-out", time: "12:00",
  });
  assert.equal(reservationVisibleOnDate(reservation, "2026-08-09"), true);
  assert.equal(reservationVisibleOnDate(reservation, "2026-08-10"), false);
});

test("permite mostrar un check-out y un nuevo check-in en la misma fecha libre", () => {
  const outgoing = { start_date: "2026-08-07", end_date: "2026-08-09" };
  const incoming = { start_date: "2026-08-09", end_date: "2026-08-11" };
  assert.equal(reservationTimingForDate(outgoing, "2026-08-09").label, "Check-out");
  assert.equal(reservationTimingForDate(incoming, "2026-08-09").label, "Check-in");
});

test("conserva las etiquetas horarias legibles en el calendario móvil y el formulario", () => {
  const styles = fs.readFileSync("styles.css", "utf8");
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(styles, /\.seg-kind\{/);
  assert.match(styles, /\.seg-time\{/);
  assert.match(styles, /\.cell\.lanes-2\{ min-height:118px; \}/);
  assert.match(html, /Check-in · 15:00/);
  assert.match(html, /Check-out · 12:00/);
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
