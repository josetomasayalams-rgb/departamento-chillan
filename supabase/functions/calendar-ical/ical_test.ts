import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildFamilyCalendar, parseExternalCalendar } from "./ical.ts";

Deno.test("family feed uses exclusive checkout dates and hides private data", () => {
  const output = buildFamilyCalendar([{
    id: "123",
    start_date: "2026-07-20",
    end_date: "2026-07-24",
    created_at: "2026-07-13T15:00:00Z",
  }]);

  assertStringIncludes(output, "UID:reserva-familiar-123@departamento-chillan");
  assertStringIncludes(output, "PRODID:-//Departamento Chillan//Calendario Familiar//ES");
  assertStringIncludes(output, "DTSTART;VALUE=DATE:20260720");
  assertStringIncludes(output, "DTEND;VALUE=DATE:20260724");
  assertStringIncludes(output, "SUMMARY:No disponible");
  assertStringIncludes(output, "STATUS:CONFIRMED");
  assertFalse(output.includes("Papás"));
  assertFalse(/(?<!\r)\n/.test(output));
});

Deno.test("external feeds preserve only source, uid and date range", async () => {
  const fixture = await Deno.readTextFile(
    new URL("../../fixtures/airbnb.ics", import.meta.url),
  );
  const events = await parseExternalCalendar(fixture, "airbnb");

  assertEquals(events.length, 1);
  assertEquals(events[0].start_date, "2026-07-20");
  assertEquals(events[0].end_date, "2026-07-24");
  assertEquals(events[0].external_uid.length, "airbnb:".length + 64);
  assertFalse(events[0].external_uid.includes("airbnb-fixture-1"));
  assertFalse(JSON.stringify(events).includes("Huesped de prueba"));
});

Deno.test("cancelled external events are ignored", async () => {
  const fixture = await Deno.readTextFile(
    new URL("../../fixtures/booking.ics", import.meta.url),
  );
  const events = await parseExternalCalendar(fixture, "booking");

  assertEquals(events.length, 1);
  assertEquals(events[0].external_uid.length, "booking:".length + 64);
  assertFalse(events[0].external_uid.includes("booking-fixture-active"));
});
