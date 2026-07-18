import {
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  availabilityFreshness,
  availabilityWindow,
  buildAvailabilityPayload,
  buildPublicAvailabilityPayload,
  isValidIsoDate,
  mergeBlockedRanges,
  normalizeReservedRanges,
  publicReservationId,
  santiagoDate,
} from "./availability.ts";

const NOW = new Date("2026-07-17T15:00:00.000Z");
const IDENTITY_SECRET = "test-identity-secret";
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
    { identity: "one", start_date: "2026-07-16", end_date: "2026-07-18" },
    { identity: "two", start_date: "2026-07-18", end_date: "2026-07-21" },
    { identity: "three", start_date: "2026-07-20", end_date: "2026-07-24" },
    { identity: "four", start_date: "2028-01-01", end_date: "2028-01-05" },
  ], WINDOW), [{ startDate: "2026-07-17", endDate: "2026-07-24" }]);
});

Deno.test("reserved ranges expose stable opaque identities and remove identity duplicates", async () => {
  const ranges = await normalizeReservedRanges([
    { identity: "family:private-a", start_date: "2026-07-20", end_date: "2026-07-22" },
    { identity: "family:private-a", start_date: "2026-07-20", end_date: "2026-07-22" },
    { identity: "external:provider:private-b", start_date: "2026-07-22", end_date: "2026-07-24" },
  ], WINDOW, IDENTITY_SECRET);
  assertEquals(ranges, [
    {
      reservationId: await publicReservationId("family:private-a", IDENTITY_SECRET),
      startDate: "2026-07-20",
      endDate: "2026-07-22",
    },
    {
      reservationId: await publicReservationId("external:provider:private-b", IDENTITY_SECRET),
      startDate: "2026-07-22",
      endDate: "2026-07-24",
    },
  ]);
  assertFalse(JSON.stringify(ranges).includes("private"));
});

Deno.test("reserved ranges preserve the original check-in for an active stay", async () => {
  const ranges = await normalizeReservedRanges([{
    identity: "external:active",
    start_date: "2026-07-16",
    end_date: "2026-07-18",
  }], WINDOW, IDENTITY_SECRET);
  assertEquals(ranges, [{
    reservationId: await publicReservationId("external:active", IDENTITY_SECRET),
    startDate: "2026-07-16",
    endDate: "2026-07-18",
  }]);
});

Deno.test("availability unifies family, Airbnb and Booking without source details", async () => {
  const payload = await buildAvailabilityPayload({
    reservations: [{ identity: "family:a", start_date: "2026-07-20", end_date: "2026-07-22" }],
    externalEvents: [
      { identity: "external:air:a", start_date: "2026-07-21", end_date: "2026-07-24" },
      { identity: "external:book:b", start_date: "2026-08-01", end_date: "2026-08-03" },
    ],
    syncStatus: LIVE_SYNC,
    identitySecret: IDENTITY_SECRET,
    now: NOW,
  });

  assertEquals(payload.status, "live");
  assertEquals(payload.lastSuccessfulSyncAt, "2026-07-17T14:50:00.000Z");
  assertEquals(payload.reservedRanges, [
    { reservationId: await publicReservationId("family:a", IDENTITY_SECRET), startDate: "2026-07-20", endDate: "2026-07-22" },
    { reservationId: await publicReservationId("external:air:a", IDENTITY_SECRET), startDate: "2026-07-21", endDate: "2026-07-24" },
    { reservationId: await publicReservationId("external:book:b", IDENTITY_SECRET), startDate: "2026-08-01", endDate: "2026-08-03" },
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

Deno.test("public availability exposes only merged reserved or available dates", async () => {
  const payload = await buildPublicAvailabilityPayload({
    reservations: [{ identity: "family:a", start_date: "2026-07-20", end_date: "2026-07-22" }],
    externalEvents: [{ identity: "external:air:a", start_date: "2026-07-21", end_date: "2026-07-24" }],
    syncStatus: LIVE_SYNC,
    identitySecret: IDENTITY_SECRET,
    now: NOW,
  });

  assertEquals(payload.blockedRanges, [
    { startDate: "2026-07-20", endDate: "2026-07-24" },
  ]);
  assertFalse("reservedRanges" in payload);
  const publicBody = JSON.stringify(payload).toLowerCase();
  for (const privateTerm of ["reservationid", "airbnb", "booking", "family", "source", "uid", "note", "guest"]) {
    assertFalse(publicBody.includes(privateTerm));
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

Deno.test("stale payload retains the last valid blocked ranges", async () => {
  const payload = await buildAvailabilityPayload({
    reservations: [],
    externalEvents: [{ identity: "external:stale", start_date: "2026-09-02", end_date: "2026-09-05" }],
    syncStatus: [{ ...LIVE_SYNC[0], status: "error" }, LIVE_SYNC[1]],
    identitySecret: IDENTITY_SECRET,
    now: NOW,
  });
  assertEquals(payload.status, "stale");
  assertEquals(payload.blockedRanges, [{ startDate: "2026-09-02", endDate: "2026-09-05" }]);
});
