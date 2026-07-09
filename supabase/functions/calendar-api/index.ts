import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const allowedOrigins = new Set([
  "https://josetomasayalams-rgb.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "access-control-allow-origin": allowedOrigins.has(origin) || isLocal ? origin : "https://josetomasayalams-rgb.github.io",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}

function encodeBase64Url(value: Uint8Array) {
  let text = "";
  value.forEach((byte) => { text += String.fromCharCode(byte); });
  return btoa(text).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

const encoder = new TextEncoder();

async function signSession(scope: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { scope, iat: now, exp: now + 24 * 60 * 60, iss: "chillan-calendar-api" };
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(Deno.env.get("CALENDAR_SESSION_SECRET") || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${body}`)));
  return { token: `${header}.${body}.${encodeBase64Url(signature)}`, expiresAt: new Date(payload.exp * 1000).toISOString(), scope };
}

async function verifySession(req: Request, scopes: string[]) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(Deno.env.get("CALENDAR_SESSION_SECRET") || ""), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), encoder.encode(`${header}.${body}`));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(body)));
  return payload.exp > Math.floor(Date.now() / 1000) && scopes.includes(payload.scope) ? payload : null;
}

function pinFor(scope: string) {
  if (scope === "family-writer") return Deno.env.get("FAMILY_PIN");
  if (scope === "ops-worker") return Deno.env.get("OPS_PIN");
  if (scope === "ops-admin") return Deno.env.get("OPS_ADMIN_PIN");
  return undefined;
}

async function clientKey(req: Request) {
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const salt = Deno.env.get("RATE_LIMIT_SALT") || "calendar-rate-limit";
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}:${ip}`)));
  return encodeBase64Url(digest).slice(0, 43);
}

async function isRateLimited(admin: any, scope: string, key: string) {
  const { data } = await admin.from("calendar_pin_attempts").select("attempts,window_started_at").eq("scope", scope).eq("client_key", key).maybeSingle();
  if (!data) return false;
  const withinWindow = Date.now() - new Date(data.window_started_at).getTime() < 15 * 60 * 1000;
  return withinWindow && data.attempts >= 5;
}

async function recordPinFailure(admin: any, scope: string, key: string) {
  const { data } = await admin.from("calendar_pin_attempts").select("attempts,window_started_at").eq("scope", scope).eq("client_key", key).maybeSingle();
  const withinWindow = data && Date.now() - new Date(data.window_started_at).getTime() < 15 * 60 * 1000;
  await admin.from("calendar_pin_attempts").upsert({
    scope, client_key: key, attempts: withinWindow ? data.attempts + 1 : 1,
    window_started_at: withinWindow ? data.window_started_at : new Date().toISOString(),
  });
}

function scopeFor(app: unknown) {
  return app === "family" ? "family-writer" : app === "ops" ? "ops-worker" : app === "ops-admin" ? "ops-admin" : null;
}

function cleanText(value: unknown, max = 500) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, headers);

  try {
    const body = await req.json();
    const action = body?.action;
    const admin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", { auth: { persistSession: false } });

    if (action === "session.create") {
      const scope = scopeFor(body.app);
      const supplied = String(body.pin || "");
      const key = await clientKey(req);
      if (!scope || !pinFor(scope) || await isRateLimited(admin, scope, key)) return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429, headers);
      if (supplied !== pinFor(scope)){
        await recordPinFailure(admin, scope, key);
        return json({ error: "Clave incorrecta" }, 401, headers);
      }
      await admin.from("calendar_pin_attempts").delete().eq("scope", scope).eq("client_key", key);
      return json(await signSession(scope), 200, headers);
    }

    if (action === "family.public.list") {
      const { data, error } = await admin.from("family_calendar_public").select("id,family_id,start_date,end_date").order("start_date");
      if (error) throw error;
      return json({ reservations: data || [] }, 200, headers);
    }
    if (action === "ops.public.list") {
      const [rentals, cleanings] = await Promise.all([
        admin.from("ops_rentals_public").select("id,source,checkin_date,checkout_date,status").order("checkin_date"),
        admin.from("ops_cleanings_public").select("id,rental_id,scheduled_date,status").order("scheduled_date"),
      ]);
      if (rentals.error) throw rentals.error;
      if (cleanings.error) throw cleanings.error;
      return json({ rentals: rentals.data || [], cleanings: cleanings.data || [], comments: [] }, 200, headers);
    }

    if (action.startsWith("family.")) {
      if (!await verifySession(req, ["family-writer"])) return json({ error: "Sesión vencida. Ingresa la clave nuevamente." }, 401, headers);
      if (action === "family.list") {
        const { data, error } = await admin.from("reservations").select("*").order("start_date");
        if (error) throw error;
        return json({ reservations: data || [] }, 200, headers);
      }
      if (action === "family.create") {
        const r = body.reservation || {};
        const { data, error } = await admin.rpc("calendar_create_reservation", {
          p_id: r.id, p_family_id: r.family_id, p_start_date: r.start_date, p_end_date: r.end_date, p_note: cleanText(r.note),
        });
        if (error) throw error;
        return json({ reservation: data }, 201, headers);
      }
      if (action === "family.delete") {
        const { error } = await admin.rpc("calendar_delete_reservation", { p_id: body.id });
        if (error) throw error;
        return json({ ok: true }, 200, headers);
      }
    }

    if (action.startsWith("ops.")) {
      const session = await verifySession(req, ["ops-worker", "ops-admin"]);
      if (!session) return json({ error: "Sesión vencida. Ingresa la clave nuevamente." }, 401, headers);
      const isAdmin = session.scope === "ops-admin";
      if (action === "ops.list") {
        const [rentals, cleanings, comments] = await Promise.all(isAdmin ? [
          admin.from("rentals").select("*").order("checkin_date"),
          admin.from("cleanings").select("*").order("scheduled_date"),
          admin.from("cleaning_comments").select("*").order("created_at"),
        ] : [
          admin.from("ops_rentals_public").select("id,source,checkin_date,checkout_date,status").order("checkin_date"),
          admin.from("ops_cleanings_public").select("id,rental_id,scheduled_date,status").order("scheduled_date"),
          admin.from("cleaning_comments").select("*").order("created_at"),
        ]);
        if (rentals.error) throw rentals.error;
        if (cleanings.error) throw cleanings.error;
        if (comments.error) throw comments.error;
        return json({ rentals: rentals.data || [], cleanings: cleanings.data || [], comments: comments.data || [] }, 200, headers);
      }
      if (action === "ops.rental.upsert") {
        if (!isAdmin) return json({ error: "Solo administración puede modificar arriendos." }, 403, headers);
        const r = body.rental || {};
        const { data, error } = await admin.rpc("calendar_upsert_rental", {
          p_id: r.id, p_source: r.source || "direct", p_reference: cleanText(r.reference, 100), p_guest_name: cleanText(r.guest_name, 160),
          p_checkin_date: r.checkin_date, p_checkout_date: r.checkout_date, p_notes: cleanText(r.notes), p_status: r.status || "scheduled",
        });
        if (error) throw error;
        return json({ rental: data }, 200, headers);
      }
      if (action === "ops.rental.delete") {
        if (!isAdmin) return json({ error: "Solo administración puede eliminar arriendos." }, 403, headers);
        const { error } = await admin.from("rentals").delete().eq("id", body.id);
        if (error) throw error;
        return json({ ok: true }, 200, headers);
      }
      if (action === "ops.cleaning.upsert") {
        const c = body.cleaning || {};
        if (!isAdmin && !["pending", "done"].includes(c.status)) return json({ error: "Estado no permitido." }, 403, headers);
        const { data, error } = await admin.rpc("calendar_update_cleaning", {
          p_id: c.id, p_rental_id: c.rental_id, p_status: c.status, p_scheduled_date: c.scheduled_date, p_scheduled_time: c.scheduled_time,
        });
        if (error) throw error;
        return json({ cleaning: data }, 200, headers);
      }
      if (action === "ops.cleaning.delete") {
        if (!isAdmin) return json({ ok: true }, 200, headers);
        const { error } = await admin.from("cleanings").delete().eq("id", body.id);
        if (error && error.code !== "PGRST116") throw error;
        return json({ ok: true }, 200, headers);
      }
      if (action === "ops.comment.create") {
        const c = body.comment || {};
        const { data, error } = await admin.from("cleaning_comments").insert({
          id: c.id, cleaning_id: c.cleaning_id, author: isAdmin ? "admin" : "equipo", body: cleanText(c.body, 500),
        }).select().single();
        if (error) throw error;
        return json({ comment: data }, 201, headers);
      }
    }
    return json({ error: "Acción no permitida" }, 400, headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /solapa|conflict|exclus/i.test(message) ? 409 : 400;
    return json({ error: message }, status, headers);
  }
});
