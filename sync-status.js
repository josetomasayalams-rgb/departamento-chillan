(function exposeReservationSync(root) {
  "use strict";

  const PROVIDER_DELAYS = Object.freeze({ booking: 2, airbnb: 3 });

  function unfoldIcalLines(body) {
    return String(body || "")
      .replace(/\r\n[ \t]/g, "")
      .replace(/\n[ \t]/g, "")
      .split(/\r?\n/);
  }

  function parseIcalEvents(body) {
    const events = [];
    let current = null;
    for (const line of unfoldIcalLines(body)) {
      if (line === "BEGIN:VEVENT") {
        current = {};
        continue;
      }
      if (line === "END:VEVENT") {
        if (current) events.push(current);
        current = null;
        continue;
      }
      if (!current) continue;
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      const rawName = line.slice(0, separator);
      const name = rawName.split(";", 1)[0].toUpperCase();
      current[name] = line.slice(separator + 1).trim();
    }
    return events;
  }

  function compactIsoDate(value) {
    return String(value || "").replaceAll("-", "");
  }

  function expectedUid(reservation) {
    return `reserva-familiar-${reservation.id}@departamento-chillan`;
  }

  function applyAvailabilityUpdate(current, changes, { version, changedAt }) {
    const has = (key) => Object.prototype.hasOwnProperty.call(changes, key);
    const datesChanged =
      (has("start_date") && changes.start_date !== current.start_date) ||
      (has("end_date") && changes.end_date !== current.end_date);
    if (!datesChanged) return { ...current, ...changes };
    return {
      ...current,
      ...changes,
      availability_version: version,
      availability_changed_at: changedAt,
      feed_verified_at: null,
      airbnb_verified_at: null,
      booking_verified_at: null,
    };
  }

  function verifyAvailabilityVersion(body, reservations) {
    if (!Array.isArray(reservations) || reservations.length === 0) {
      return {
        ok: false,
        missing: [],
        reason: "No hay reservas para verificar.",
      };
    }
    const events = new Map(
      parseIcalEvents(body).map((event) => [event.UID, event]),
    );
    const missing = [];
    for (const reservation of reservations) {
      const uid = expectedUid(reservation);
      const event = events.get(uid);
      const matches = event &&
        event.DTSTART === compactIsoDate(reservation.start_date) &&
        event.DTEND === compactIsoDate(reservation.end_date) &&
        event.STATUS === "CONFIRMED" &&
        event.TRANSP === "OPAQUE";
      if (!matches) missing.push(reservation.id);
    }
    return {
      ok: missing.length === 0,
      missing,
      reason: missing.length
        ? "El feed todavía no contiene todas las fechas esperadas."
        : null,
    };
  }

  function providerState(
    { provider, changedAt, verifiedAt, now = Date.now() },
  ) {
    const delayHours = PROVIDER_DELAYS[provider];
    if (!delayHours) throw new Error(`Proveedor desconocido: ${provider}`);
    const changedMs = Date.parse(changedAt || "");
    const verifiedMs = Date.parse(verifiedAt || "");
    if (
      Number.isFinite(changedMs) && Number.isFinite(verifiedMs) &&
      verifiedMs >= changedMs
    ) {
      return {
        status: "verified",
        deadline: new Date(changedMs + delayHours * 3600000).toISOString(),
      };
    }
    if (!Number.isFinite(changedMs)) {
      return { status: "review_required", deadline: null };
    }
    const deadlineMs = changedMs + delayHours * 3600000;
    return {
      status: now < deadlineMs ? "pending" : "review_required",
      deadline: new Date(deadlineMs).toISOString(),
    };
  }

  root.ReservationSync = Object.freeze({
    PROVIDER_DELAYS,
    unfoldIcalLines,
    parseIcalEvents,
    applyAvailabilityUpdate,
    verifyAvailabilityVersion,
    providerState,
  });
})(globalThis);
