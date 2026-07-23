import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildFamilyCalendar, isFamilyFeedUid, parseExternalCalendar } from "./ical.ts";

Deno.test("family feed uses exclusive checkout dates and hides private data", () => {
  const privateReservation = {
    id: "123",
    start_date: "2026-08-07",
    end_date: "2026-08-09",
    created_at: "2026-07-13T15:00:00Z",
    family_id: "papas",
    note: "Cumple privado",
  };
  const output = buildFamilyCalendar([privateReservation]);

  assertStringIncludes(output, "UID:reserva-familiar-123@departamento-chillan");
  assertStringIncludes(
    output,
    "PRODID:-//Departamento Chillan//Calendario Familiar//ES",
  );
  assertStringIncludes(output, "DTSTART;VALUE=DATE:20260807");
  assertStringIncludes(output, "DTEND;VALUE=DATE:20260809");
  assertStringIncludes(output, "SUMMARY:No disponible");
  assertStringIncludes(output, "STATUS:CONFIRMED");
  assertStringIncludes(output, "TRANSP:OPAQUE");
  assertFalse(output.includes("Papás"));
  assertFalse(output.includes("papas"));
  assertFalse(output.includes("Cumple privado"));
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

Deno.test("events originating in the family feed are not imported back", async () => {
  const body = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:reserva-familiar-123e4567-e89b-12d3-a456-426614174000@departamento-chillan
DTSTART;VALUE=DATE:20260801
DTEND;VALUE=DATE:20260803
SUMMARY:No disponible
END:VEVENT
END:VCALENDAR`;
  assertEquals(isFamilyFeedUid("reserva-familiar-123e4567-e89b-12d3-a456-426614174000@departamento-chillan"), true);
  assertEquals(await parseExternalCalendar(body, "airbnb"), []);
});
