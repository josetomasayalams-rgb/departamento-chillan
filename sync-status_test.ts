import {
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import "./sync-status.js";

const sync = (globalThis as typeof globalThis & {
  ReservationSync: {
    unfoldIcalLines(body: string): string[];
    applyAvailabilityUpdate(
      current: Record<string, string | null>,
      changes: Record<string, string>,
      metadata: { version: string; changedAt: string },
    ): Record<string, string | null>;
    verifyAvailabilityVersion(
      body: string,
      reservations: Array<Record<string, string>>,
    ): {
      ok: boolean;
      missing: string[];
      reason: string | null;
    };
    providerState(input: {
      provider: "airbnb" | "booking";
      changedAt: string;
      verifiedAt?: string | null;
      now: number;
    }): { status: string; deadline: string | null };
  };
}).ReservationSync;

const reservation = {
  id: "12345678-1234-4234-8234-123456789012",
  start_date: "2026-08-07",
  end_date: "2026-08-09",
};

Deno.test("unfolds folded iCal UIDs and verifies exclusive checkout", () => {
  const body = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:reserva-familiar-12345678-1234-4234-8234-123456789012@departame",
    " nto-chillan",
    "DTSTART;VALUE=DATE:20260807",
    "DTEND;VALUE=DATE:20260809",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  assertEquals(sync.verifyAvailabilityVersion(body, [reservation]), {
    ok: true,
    missing: [],
    reason: null,
  });
});

Deno.test("requires every family row in a shared availability version", () => {
  const body = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    `UID:reserva-familiar-${reservation.id}@departamento-chillan`,
    "DTSTART;VALUE=DATE:20260807",
    "DTEND;VALUE=DATE:20260809",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
  const second = { ...reservation, id: "22345678-1234-4234-8234-123456789012" };
  const result = sync.verifyAvailabilityVersion(body, [reservation, second]);
  assertFalse(result.ok);
  assertEquals(result.missing, [second.id]);
});

Deno.test("provider deadlines never become automatic verification", () => {
  const changedAt = "2026-07-16T12:00:00.000Z";
  const atOneHour = Date.parse("2026-07-16T13:00:00.000Z");
  const atTwoHours = Date.parse("2026-07-16T14:00:00.000Z");
  const atThreeHours = Date.parse("2026-07-16T15:00:00.000Z");

  assertEquals(
    sync.providerState({ provider: "booking", changedAt, now: atOneHour })
      .status,
    "pending",
  );
  assertEquals(
    sync.providerState({ provider: "booking", changedAt, now: atTwoHours })
      .status,
    "review_required",
  );
  assertEquals(
    sync.providerState({ provider: "airbnb", changedAt, now: atTwoHours })
      .status,
    "pending",
  );
  assertEquals(
    sync.providerState({ provider: "airbnb", changedAt, now: atThreeHours })
      .status,
    "review_required",
  );
  assertEquals(
    sync.providerState({
      provider: "airbnb",
      changedAt,
      verifiedAt: "2026-07-16T15:01:00.000Z",
      now: atThreeHours,
    }).status,
    "verified",
  );
});

Deno.test("date edits reset delivery tracking while note edits preserve it", () => {
  const current = {
    ...reservation,
    note: "Anterior",
    availability_version: "version-1",
    availability_changed_at: "2026-07-16T12:00:00.000Z",
    feed_verified_at: "2026-07-16T12:01:00.000Z",
    airbnb_verified_at: "2026-07-16T15:00:00.000Z",
    booking_verified_at: "2026-07-16T14:00:00.000Z",
  };
  const noteOnly = sync.applyAvailabilityUpdate(current, { note: "Nueva" }, {
    version: "version-2",
    changedAt: "2026-07-16T18:00:00.000Z",
  });
  assertEquals(noteOnly.availability_version, "version-1");
  assertEquals(noteOnly.airbnb_verified_at, current.airbnb_verified_at);

  const moved = sync.applyAvailabilityUpdate(current, {
    end_date: "2026-08-10",
  }, {
    version: "version-2",
    changedAt: "2026-07-16T18:00:00.000Z",
  });
  assertEquals(moved.availability_version, "version-2");
  assertEquals(moved.availability_changed_at, "2026-07-16T18:00:00.000Z");
  assertEquals(moved.feed_verified_at, null);
  assertEquals(moved.airbnb_verified_at, null);
  assertEquals(moved.booking_verified_at, null);
});
