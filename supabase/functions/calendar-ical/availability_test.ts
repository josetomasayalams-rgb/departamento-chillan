import {
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  availabilityFreshness,
  availabilityWindow,
  buildAvailabilityPayload,
  isValidIsoDate,
  mergeBlockedRanges,
  normalizeReservedRanges,
  santiagoDate,
} from "./availability.ts";

const NOW = new Date("2026-07-17T15:00:00.000Z");
const WINDOW = availabilityWindow(NOW);
const LIVE_SYNC = [
  { source: "airbnb", status: "ok", last_success_at: "2026-07-17T14:50:00.000Z" },
  { source: "booking", status: "ok", last_success_at: "2026-07-17T14:55:00.000Z" },
];

Deno.test("availability uses Santiago civil dates and a 12-month exclusive range", () => {
  assertEquals(santiagoDate(new Date("2026-07-17T02:30:00.000Z")), "2026-07-16");
  assertEquals(WINDOW, { from: "2026-07-17", to: "2027-07-17", endExclusive: true });
  assertEquals(availabilityWindow(new Date("2028-02-29T15:00:00.000Z")).to, "2029-02-28");
  assertEquals(isValidIsoDate("2026-02-29"), false);
  assertEquals(isValidIsoDate("2028-02-29"), true);
});

Deno.test("blocked ranges preserve exclusive checkout and merge overlaps and adjacency", () => {
  assertEquals(mergeBlockedRanges([
    { start_date: "2026-07-16", end_date: "2026-07-18" },
    { start_date: "2026-07-18", end_date: "2026-07-21" },
    { start_date: "2026-07-20", end_date: "2026-07-24" },
    { start_date: "2028-01-01", end_date: "2028-01-05" },
  ], WINDOW), [{ startDate: "2026-07-17", endDate: "2026-07-24" }]);
});

Deno.test("reserved ranges preserve adjacent stays and remove exact duplicates", () => {
  assertEquals(normalizeReservedRanges([
    { start_date: "2026-07-20", end_date: "2026-07-22" },
    { start_date: "2026-07-20", end_date: "2026-07-22" },
    { start_date: "2026-07-22", end_date: "2026-07-24" },
  ], WINDOW), [
    { startDate: "2026-07-20", endDate: "2026-07-22" },
    { startDate: "2026-07-22", endDate: "2026-07-24" },
  ]);
});

Deno.test("availability unifies family, Airbnb and Booking without source details", () => {
  const payload = buildAvailabilityPayload({
    reservations: [{ start_date: "2026-07-20", end_date: "2026-07-22" }],
    externalEvents: [
      { start_date: "2026-07-21", end_date: "2026-07-24" },
      { start_date: "2026-08-01", end_date: "2026-08-03" },
    ],
    syncStatus: LIVE_SYNC,
    now: NOW,
  });

  assertEquals(payload.status, "live");
  assertEquals(payload.lastSuccessfulSyncAt, "2026-07-17T14:50:00.000Z");
  assertEquals(payload.reservedRanges, [
    { startDate: "2026-07-20", endDate: "2026-07-22" },
    { startDate: "2026-07-21", endDate: "2026-07-24" },
    { startDate: "2026-08-01", endDate: "2026-08-03" },
  ]);
  assertEquals(payload.blockedRanges, [
    { startDate: "2026-07-20", endDate: "2026-07-24" },
    { startDate: "2026-08-01", endDate: "2026-08-03" },
  ]);
  const publicBody = JSON.stringify(payload);
  for (const privateTerm of ["airbnb", "booking", "family", "source", "uid", "note", "guest"]) {
    assertFalse(publicBody.toLowerCase().includes(privateTerm));
  }
});

Deno.test("freshness distinguishes live, retained stale data and unavailable sources", () => {
  assertEquals(availabilityFreshness(LIVE_SYNC, NOW).status, "live");
  assertEquals(availabilityFreshness([
    { ...LIVE_SYNC[0], status: "error" },
    LIVE_SYNC[1],
  ], NOW).status, "stale");
  assertEquals(availabilityFreshness([
    { ...LIVE_SYNC[0], last_success_at: "2026-07-17T10:00:00.000Z" },
    LIVE_SYNC[1],
  ], NOW).status, "stale");
  assertEquals(availabilityFreshness([LIVE_SYNC[0]], NOW), {
    status: "unavailable",
    lastSuccessfulSyncAt: null,
  });
  assertEquals(availabilityFreshness([
    LIVE_SYNC[0],
    { source: "booking", status: "pending", last_success_at: null },
  ], NOW).status, "unavailable");
});

Deno.test("stale payload retains the last valid blocked ranges", () => {
  const payload = buildAvailabilityPayload({
    reservations: [],
    externalEvents: [{ start_date: "2026-09-02", end_date: "2026-09-05" }],
    syncStatus: [{ ...LIVE_SYNC[0], status: "error" }, LIVE_SYNC[1]],
    now: NOW,
  });
  assertEquals(payload.status, "stale");
  assertEquals(payload.blockedRanges, [{ startDate: "2026-09-02", endDate: "2026-09-05" }]);
});
