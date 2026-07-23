import ical, {
  ICalCalendarMethod,
  ICalEventStatus,
  ICalEventTransparency,
} from "npm:ical-generator@11.0.0";
import * as nodeIcal from "npm:node-ical@0.26.1";

export type CalendarSource = "airbnb" | "booking";

export interface FamilyReservation {
  id: string;
  start_date: string;
  end_date: string;
  created_at?: string | null;
}

export interface ExternalCalendarEvent {
  external_uid: string;
  start_date: string;
  end_date: string;
}

const SANTIAGO_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isoDateToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(value: string, days: number): string {
  const date = isoDateToUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toSantiagoDate(value: Date, dateOnly: boolean): string {
  if (dateOnly || (value as Date & { dateOnly?: true }).dateOnly) {
    return value.toISOString().slice(0, 10);
  }

  const parts = Object.fromEntries(
    SANTIAGO_DATE_FORMATTER.formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(isoDateToUtc(value).getTime());
}

async function hashedUid(source: CalendarSource, uid: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${source}:${uid}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${source}:${hex}`;
}

export function isFamilyFeedUid(uid: string): boolean {
  return /^reserva-familiar-[0-9a-f-]+@departamento-chillan$/i.test(
    String(uid || "").trim(),
  );
}

export function buildFamilyCalendar(reservations: FamilyReservation[]): string {
  const calendar = ical({
    name: "Disponibilidad Departamento Chillan",
    method: ICalCalendarMethod.PUBLISH,
    prodId: "//Departamento Chillan//Calendario Familiar//ES",
    scale: "GREGORIAN",
  });

  for (const reservation of reservations) {
    if (!validIsoDate(reservation.start_date) || !validIsoDate(reservation.end_date)) continue;

    const normalizedEnd = reservation.end_date > reservation.start_date
      ? reservation.end_date
      : addDays(reservation.start_date, 1);
    const stamp = reservation.created_at ? new Date(reservation.created_at) : new Date();

    calendar.createEvent({
      id: `reserva-familiar-${reservation.id}@departamento-chillan`,
      start: isoDateToUtc(reservation.start_date),
      end: isoDateToUtc(normalizedEnd),
      allDay: true,
      stamp: Number.isNaN(stamp.getTime()) ? new Date() : stamp,
      summary: "No disponible",
      status: ICalEventStatus.CONFIRMED,
      transparency: ICalEventTransparency.OPAQUE,
    });
  }

  return calendar.toString().replace(/\r?\n/g, "\r\n");
}

export async function parseExternalCalendar(
  body: string,
  source: CalendarSource,
): Promise<ExternalCalendarEvent[]> {
  const parsed = nodeIcal.sync.parseICS(body);
  const events: ExternalCalendarEvent[] = [];

  for (const [fallbackUid, component] of Object.entries(parsed)) {
    if (!component || component.type !== "VEVENT" || component.status === "CANCELLED") continue;
    if (!(component.start instanceof Date)) continue;

    const dateOnly = component.datetype === "date" || Boolean(component.start.dateOnly);
    const startDate = toSantiagoDate(component.start, dateOnly);
    const endDate = component.end instanceof Date
      ? toSantiagoDate(component.end, dateOnly || Boolean(component.end.dateOnly))
      : addDays(startDate, 1);
    const normalizedEnd = endDate > startDate ? endDate : addDays(startDate, 1);
    const uid = String(component.uid || fallbackUid || `${startDate}-${normalizedEnd}`);
    if (isFamilyFeedUid(uid)) continue;

    events.push({
      external_uid: await hashedUid(source, uid),
      start_date: startDate,
      end_date: normalizedEnd,
    });
  }

  return events.sort((a, b) =>
    a.start_date.localeCompare(b.start_date) || a.external_uid.localeCompare(b.external_uid)
  );
}
