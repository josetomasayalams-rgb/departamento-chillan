import { createClient } from "npm:@supabase/supabase-js@2.110.3";
import {
  buildFamilyCalendar,
  type CalendarSource,
  parseExternalCalendar,
} from "./ical.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SYNC_SECRET = Deno.env.get("SYNC_SECRET") || "";
const MAX_ICAL_BYTES = 5 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Error de sincronizacion";
  return message
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 240);
}

async function fetchCalendar(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Departamento-Chillan-Calendar/1.0" },
    });
    if (!response.ok) throw new Error(`El proveedor respondio HTTP ${response.status}`);

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_ICAL_BYTES) throw new Error("El calendario supera el tamano permitido");

    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_ICAL_BYTES) {
      throw new Error("El calendario supera el tamano permitido");
    }
    if (!body.includes("BEGIN:VCALENDAR")) throw new Error("La respuesta no es un calendario iCal");
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function serveFamilyFeed(): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("reservations")
    .select("id,start_date,end_date,created_at")
    .order("start_date");

  if (error) {
    console.error("family-feed-query", safeError(error));
    return jsonResponse({ error: "No se pudo generar el calendario" }, 503);
  }

  const calendar = buildFamilyCalendar(data || []);
  return new Response(calendar, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=\"calendario-familiar.ics\"",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function syncCalendars(): Promise<Response> {
  if (!SYNC_SECRET) return jsonResponse({ error: "Sincronizacion no configurada" }, 503);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sources: Array<{ source: CalendarSource; url: string | undefined }> = [
    { source: "airbnb", url: Deno.env.get("AIRBNB_ICAL_URL") },
    { source: "booking", url: Deno.env.get("BOOKING_ICAL_URL") },
  ];
  const results: Record<string, { ok: boolean; count?: number; error?: string }> = {};

  await Promise.all(sources.map(async ({ source, url }) => {
    try {
      if (!url) throw new Error("URL iCal no configurada");
      const body = await fetchCalendar(url);
      const events = await parseExternalCalendar(body, source);
      const { data, error } = await supabase.rpc("replace_external_calendar_events", {
        p_source: source,
        p_events: events,
      });
      if (error) throw error;
      results[source] = { ok: true, count: Number(data || 0) };
    } catch (error) {
      const message = safeError(error);
      console.error(`calendar-sync-${source}`, message);
      results[source] = { ok: false, error: message };
      await supabase.rpc("record_calendar_sync_error", {
        p_source: source,
        p_error_message: message,
      });
    }
  }));

  const allOk = Object.values(results).every((result) => result.ok);
  return jsonResponse({ ok: allOk, sources: results }, allOk ? 200 : 207);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (request.method === "GET" && path.endsWith("/calendario-familiar.ics")) {
    return await serveFamilyFeed();
  }

  if (request.method === "POST" && path.endsWith("/sync")) {
    const suppliedSecret = request.headers.get("x-sync-secret") || "";
    if (!SYNC_SECRET || suppliedSecret !== SYNC_SECRET) {
      return jsonResponse({ error: "No autorizado" }, 401);
    }
    return await syncCalendars();
  }

  return jsonResponse({ error: "Ruta no encontrada" }, 404);
});
