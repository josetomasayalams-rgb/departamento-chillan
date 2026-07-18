export const AVAILABILITY_TIMEZONE = "America/Santiago";
export const AVAILABILITY_VERSION = 1;
export const AVAILABILITY_MONTHS = 12;
export const AVAILABILITY_STALE_AFTER_MINUTES = 45;

const REQUIRED_SOURCES = ["airbnb", "booking"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface AvailabilityRangeInput {
  identity: string;
  start_date: string;
  end_date: string;
}

export interface AvailabilitySyncInput {
  source: string;
  status: string;
  last_success_at: string | null;
}

export interface AvailabilityWindow {
  from: string;
  to: string;
  endExclusive: true;
}

export interface AvailabilityPayload {
  version: 1;
  timezone: typeof AVAILABILITY_TIMEZONE;
  generatedAt: string;
  range: AvailabilityWindow;
  status: "live" | "stale" | "unavailable";
  lastSuccessfulSyncAt: string | null;
  reservedRanges: Array<{ reservationId: string; startDate: string; endDate: string }>;
  blockedRanges: Array<{ startDate: string; endDate: string }>;
}

function isoParts(value: string): { year: number; month: number; day: number } | null {
  if (!ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

export function isValidIsoDate(value: string): boolean {
  return isoParts(value) !== null;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonthsClamped(value: string, months: number): string {
  const parts = isoParts(value);
  if (!parts) throw new Error("Invalid availability date");
  const first = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return formatUtcDate(new Date(Date.UTC(
    first.getUTCFullYear(),
    first.getUTCMonth(),
    Math.min(parts.day, lastDay),
  )));
}

export function santiagoDate(now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: AVAILABILITY_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function availabilityWindow(now: Date): AvailabilityWindow {
  const from = santiagoDate(now);
  return { from, to: addMonthsClamped(from, AVAILABILITY_MONTHS), endExclusive: true };
}

function normalizeDateRanges(
  ranges: readonly AvailabilityRangeInput[],
  window: AvailabilityWindow,
  clipToWindow = true,
): Array<AvailabilityRangeInput & { startDate: string; endDate: string }> {
  const clipped = ranges.flatMap((range) => {
    if (!range.identity) return [];
    if (!isValidIsoDate(range.start_date) || !isValidIsoDate(range.end_date)) return [];
    if (range.end_date <= range.start_date) return [];
    if (range.start_date >= window.to || range.end_date <= window.from) return [];
    const startDate = clipToWindow && range.start_date < window.from ? window.from : range.start_date;
    const endDate = clipToWindow && range.end_date > window.to ? window.to : range.end_date;
    return endDate > startDate ? [{ ...range, startDate, endDate }] : [];
  }).sort((left, right) =>
    left.startDate.localeCompare(right.startDate) ||
    left.endDate.localeCompare(right.endDate) ||
    left.identity.localeCompare(right.identity)
  );

  return clipped.filter((range, index) =>
    index === 0 ||
    range.identity !== clipped[index - 1].identity
  );
}

export async function publicReservationId(identity: string, secret: string): Promise<string> {
  if (!secret) throw new Error("Availability identity secret is required");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`availability:v1:${identity}`));
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `rsv_${hex.slice(0, 32)}`;
}

export async function normalizeReservedRanges(
  ranges: readonly AvailabilityRangeInput[],
  window: AvailabilityWindow,
  identitySecret: string,
): Promise<AvailabilityPayload["reservedRanges"]> {
  // Las estadías individuales preservan sus fechas originales para que una
  // reserva en curso no parezca cambiar cada medianoche en Operaciones.
  return await Promise.all(normalizeDateRanges(ranges, window, false).map(async (range) => ({
    reservationId: await publicReservationId(range.identity, identitySecret),
    startDate: range.startDate,
    endDate: range.endDate,
  })));
}

export function mergeBlockedRanges(
  ranges: readonly AvailabilityRangeInput[],
  window: AvailabilityWindow,
): AvailabilityPayload["blockedRanges"] {
  const normalized = normalizeDateRanges(ranges, window);

  const merged: AvailabilityPayload["blockedRanges"] = [];
  for (const range of normalized) {
    const current = merged.at(-1);
    if (!current || range.startDate > current.endDate) {
      merged.push({ startDate: range.startDate, endDate: range.endDate });
      continue;
    }
    if (range.endDate > current.endDate) current.endDate = range.endDate;
  }
  return merged;
}

function validSyncDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function availabilityFreshness(
  syncRows: readonly AvailabilitySyncInput[],
  now: Date,
): Pick<AvailabilityPayload, "status" | "lastSuccessfulSyncAt"> {
  const rows = REQUIRED_SOURCES.map((source) => syncRows.find((row) => row.source === source));
  if (rows.some((row) => !row)) return { status: "unavailable", lastSuccessfulSyncAt: null };

  const successfulDates = rows.map((row) => validSyncDate(row?.last_success_at ?? null));
  if (successfulDates.some((date) => !date)) {
    return { status: "unavailable", lastSuccessfulSyncAt: null };
  }

  const oldestSuccess = successfulDates.reduce((oldest, date) =>
    !oldest || (date && date < oldest) ? date : oldest
  , null as Date | null);
  const staleAfter = now.getTime() - AVAILABILITY_STALE_AFTER_MINUTES * 60_000;
  const stale = rows.some((row) => row?.status !== "ok") || (oldestSuccess?.getTime() ?? 0) < staleAfter;
  return {
    status: stale ? "stale" : "live",
    lastSuccessfulSyncAt: oldestSuccess?.toISOString() ?? null,
  };
}

export async function buildAvailabilityPayload(input: {
  reservations: readonly AvailabilityRangeInput[];
  externalEvents: readonly AvailabilityRangeInput[];
  syncStatus: readonly AvailabilitySyncInput[];
  identitySecret: string;
  now: Date;
}): Promise<AvailabilityPayload> {
  const range = availabilityWindow(input.now);
  const freshness = availabilityFreshness(input.syncStatus, input.now);
  const reservations = [...input.reservations, ...input.externalEvents];
  return {
    version: AVAILABILITY_VERSION,
    timezone: AVAILABILITY_TIMEZONE,
    generatedAt: input.now.toISOString(),
    range,
    ...freshness,
    reservedRanges: await normalizeReservedRanges(reservations, range, input.identitySecret),
    blockedRanges: mergeBlockedRanges(reservations, range),
  };
}
