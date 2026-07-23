import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  filterExternalMirrors,
  handleRequest,
  mapParticularReservations,
  mapPublicReservations,
  safeError,
} from "./index.ts";

const NOW = new Date("2026-07-17T15:00:00.000Z");
const URL = "https://example.supabase.co/functions/v1/calendar-ical/availability";
const PUBLIC_URL = "https://example.supabase.co/functions/v1/calendar-ical/public-availability";

Deno.test("operations feed includes only particular reservations", () => {
  assertEquals(mapParticularReservations([
    { id: "particular-a", family_id: "particular", start_date: "2026-07-20", end_date: "2026-07-22" },
    { id: "family-a", family_id: "papas", start_date: "2026-07-23", end_date: "2026-07-25" },
    { id: "family-b", family_id: "quiroz-ayala", start_date: "2026-07-26", end_date: "2026-07-28" },
  ]), [{
    identity: "family:particular-a",
    start_date: "2026-07-20",
    end_date: "2026-07-22",
  }]);
});

Deno.test("public feed includes every family reservation without family metadata", () => {
  assertEquals(mapPublicReservations([
    { id: "particular-a", family_id: "particular", start_date: "2026-07-20", end_date: "2026-07-22" },
    { id: "family-a", family_id: "papas", start_date: "2026-07-23", end_date: "2026-07-25" },
    { id: "family-b", family_id: "quiroz-ayala", start_date: "2026-07-26", end_date: "2026-07-28" },
  ]), [
    { identity: "family:particular-a", start_date: "2026-07-20", end_date: "2026-07-22" },
    { identity: "family:family-a", start_date: "2026-07-23", end_date: "2026-07-25" },
    { identity: "family:family-b", start_date: "2026-07-26", end_date: "2026-07-28" },
  ]);
});

Deno.test("external mirrors and provider duplicates do not create a second reservation", () => {
  const family = [
    { identity:"family:a", start_date:"2026-08-01", end_date:"2026-08-03" },
  ];
  const external = [
    { identity:"external:airbnb:a", start_date:"2026-08-01", end_date:"2026-08-03" },
    { identity:"external:airbnb:b", start_date:"2026-08-07", end_date:"2026-08-09" },
    { identity:"external:booking:c", start_date:"2026-08-07", end_date:"2026-08-09" },
  ];
  assertEquals(filterExternalMirrors(family, external), [
    { identity:"external:airbnb:b", start_date:"2026-08-07", end_date:"2026-08-09" },
  ]);
});

Deno.test("operations availability route retains opaque reservation identities", async () => {
  const response = await handleRequest(new Request(URL), {
    now: () => NOW,
    identitySecret: "test-identity-secret",
    loadAvailability: async () => ({
      reservations: [{ identity: "family:private-a", start_date: "2026-07-20", end_date: "2026-07-22" }],
      externalEvents: [{ identity: "external:private-b", start_date: "2026-08-01", end_date: "2026-08-03" }],
      syncStatus: [
        { source: "airbnb", status: "ok", last_success_at: "2026-07-17T14:50:00.000Z" },
        { source: "booking", status: "ok", last_success_at: "2026-07-17T14:55:00.000Z" },
      ],
    }),
  });

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("access-control-allow-origin"), "*");
  assertEquals(response.headers.get("cache-control"), "no-store, max-age=0");
  assertEquals(response.headers.get("x-content-type-options"), "nosniff");
  const body = await response.text();
  assertStringIncludes(body, '"status":"live"');
  assertStringIncludes(body, '"reservedRanges"');
  assertStringIncludes(body, '"reservationId":"rsv_');
  assertStringIncludes(body, '"blockedRanges"');
  for (const privateTerm of ["uid", "note", "guest", "family_id", "external_uid"]) {
    assertFalse(body.toLowerCase().includes(privateTerm));
  }
});

Deno.test("public Linktree route returns only binary blocked ranges from all sources", async () => {
  let requestedAudience = "";
  const response = await handleRequest(new Request(PUBLIC_URL), {
    now: () => NOW,
    identitySecret: "test-identity-secret",
    loadAvailability: async (_window, audience) => {
      requestedAudience = audience;
      return {
        reservations: [
          { identity: "family:private-a", start_date: "2026-07-20", end_date: "2026-07-22" },
          { identity: "family:private-b", start_date: "2026-07-24", end_date: "2026-07-26" },
        ],
        externalEvents: [{ identity: "external:private-c", start_date: "2026-08-01", end_date: "2026-08-03" }],
        syncStatus: [
          { source: "airbnb", status: "ok", last_success_at: "2026-07-17T14:50:00.000Z" },
          { source: "booking", status: "ok", last_success_at: "2026-07-17T14:55:00.000Z" },
        ],
      };
    },
  });

  assertEquals(requestedAudience, "public");
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "no-store, max-age=0");
  const body = await response.text();
  assertStringIncludes(body, '"blockedRanges"');
  assertFalse(body.includes("reservedRanges"));
  assertFalse(body.includes("reservationId"));
  for (const privateTerm of ["private", "uid", "note", "guest", "family_id", "external_uid"]) {
    assertFalse(body.toLowerCase().includes(privateTerm));
  }
});

Deno.test("availability failure is generic and never reflects secret URLs", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await handleRequest(new Request(URL), {
      now: () => NOW,
      loadAvailability: () => Promise.reject(new Error("https://private.example/secret.ics\nSERVICE_ROLE_KEY")),
    });
    assertEquals(response.status, 503);
    const body = await response.text();
    assertEquals(JSON.parse(body), {
      version: 1,
      status: "unavailable",
      error: "Disponibilidad temporalmente no disponible",
    });
    assertFalse(body.includes("private.example"));
    assertFalse(body.includes("SERVICE_ROLE_KEY"));
  } finally {
    console.error = originalError;
  }
});

Deno.test("CORS preflight and unsupported methods are controlled", async () => {
  const preflight = await handleRequest(new Request(URL, { method: "OPTIONS" }));
  assertEquals(preflight.status, 204);
  assertEquals(preflight.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");

  const unsupported = await handleRequest(new Request(URL, { method: "POST" }));
  assertEquals(unsupported.status, 404);
  assertEquals(await unsupported.json(), { error: "Ruta no encontrada" });
});

Deno.test("safe errors remove URLs and newlines before logging", () => {
  const output = safeError(new Error("fetch https://private.example/feed.ics\nfailed"));
  assertFalse(output.includes("private.example"));
  assertFalse(output.includes("\n"));
  assertStringIncludes(output, "[url]");
});
