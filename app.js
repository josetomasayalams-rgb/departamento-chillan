// =====================================================================
//  Reservas · Departamento Chillán
//  Vanilla JS. MODO LOCAL (localStorage) sin configurar nada; con claves
//  de Supabase pasa a MODO LIVE (sincroniza en tiempo real). Ver README.md.
//
//  UX: elige familia en el desplegable → toca LLEGADA → toca SALIDA.
//  Días pasados y del margen Airbnb quedan bloqueados.
// =====================================================================

const CONFIG = {
  // 👇 Pega aquí tus claves de Supabase (README.md). Vacío = modo local.
  supabaseUrl: "https://uimqusoylxpyljbfqumm.supabase.co",
  supabaseAnonKey: "sb_publishable_B_MIa8pWGFjzLhdzLoi61A_kffCRo8_",

  families: [
    { id: "papas",          name: "Papás",          color: "#A855F7" },
    { id: "quiroz-ayala",   name: "Quiroz Ayala",   color: "#10B981" },
    { id: "ayala-gonzalez", name: "Ayala Gonzalez", color: "#F59E0B" },
    { id: "cattan-ayala",   name: "Cattan Ayala",   color: "#EC4899" },
    { id: "coco",           name: "Coco",           color: "#3B82F6" },
    { id: "particular",     name: "Reserva particular", color: "#F97316", adminOnly: true },
  ],

  externalSources: {
    airbnb: { name: "Airbnb", color: "#E85D75" },
    booking: { name: "Booking", color: "#1684D6" },
  },

  familyFeedUrl: "https://uimqusoylxpyljbfqumm.supabase.co/functions/v1/calendar-ical/calendario-familiar.ics",
  providerAdminUrls: {
    airbnb: "https://www.airbnb.cl/multicalendar/1729206776074121490/availability-settings",
    booking: "https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/sync/index.html?hotel_id=16884094&lang=es",
  },

  weekStart: 1,          // 1 = lunes, 0 = domingo
  rollingDays: 30,       // hoy + 29 días para una planificación mensual continua
  yearMin: 2020,
  yearMax: 2040,
  maxLanes: 3,           // barras visibles por celda antes de "+N"
  airbnbMarginDays: 4,   // primer día reservable = hoy + N (margen Airbnb)
};

const VERSION = "30";  // marca visible (pestaña + badge) para detectar si hay caché
const MON_SHORT = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const WD = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const CHECKIN_TIME = "15:00";
const CHECKOUT_TIME = "12:00";
const LS_KEY = "chillan-reservations";
const MAX_DATE = `${CONFIG.yearMax}-12-31`;   // tope de fechas reservables

// ---------- Estado ----------
const state = {
  view: { start: null, followsToday: true },
  reservations: [],
  externalEvents: [],
  syncStatus: [],
  store: null,
  brush: { families: [], start: null, end: null, hover: null },
  editingId: null,
  selectionError: null,
  live: false,
  admin: false,        // modo admin: fechas sin restricción + multi-familia
  firstBookable: null,
  loadError: null,
  feedChecks: new Map(),
  syncing: false,
  menuIdx: 0,
  undo: [],          // pila de inversas (máx 7) para Deshacer
  rollingWindowHandle: null,
};

// ---------- Helpers fecha / familia / id ----------
function pad(n){ return String(n).padStart(2,"0"); }
function isoOf(y, m, d){ return `${y}-${pad(m+1)}-${pad(d)}`; }       // m 0-based
function today(){
  const d = new Date();
  return { y:d.getFullYear(), m:d.getMonth() };
}
function todayIso(){
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}
function parseISO(s){ const [y,m,d] = s.split("-").map(Number); return {y,m:m-1,d}; }
function fam(id){ return CONFIG.families.find(f => f.id === id); }
function famIdx(id){ return CONFIG.families.findIndex(f => f.id === id); }
function selectableFamilies(){ return CONFIG.families.filter(f => state.admin || !f.adminOnly); }
function firstBookableIso(){
  const d = new Date();
  d.setDate(d.getDate() + CONFIG.airbnbMarginDays);
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}
function pretty(iso){ const { m, d } = parseISO(iso); return `${d} ${MON_SHORT[m]}`; }
function daysBetween(a, b){
  const da = parseISO(a), db = parseISO(b);
  return Math.round((Date.UTC(db.y, db.m, db.d) - Date.UTC(da.y, da.m, da.d)) / 86400000);
}
function addDays(iso, amount){
  const { y, m, d } = parseISO(iso);
  const date = new Date(Date.UTC(y, m, d + amount));
  return isoOf(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
function rollingMonthWindow(startIso, days=CONFIG.rollingDays){
  const dates = Array.from({ length: days }, (_, index) => addDays(startIso, index));
  return {
    start: startIso,
    endExclusive: addDays(startIso, days),
    endInclusive: dates[dates.length - 1],
    dates,
  };
}

function reservationVisibleOnDate(reservation, dateIso){
  return reservation.start_date <= dateIso && reservation.end_date >= dateIso;
}

function reservationTimingForDate(reservation, dateIso){
  const isStart = reservation.start_date === dateIso;
  const isEnd = reservation.end_date === dateIso;
  return {
    isStart,
    isEnd,
    label: isStart ? "Check-in" : isEnd ? "Check-out" : "Reserva",
    time: isStart ? CHECKIN_TIME : isEnd ? CHECKOUT_TIME : null,
  };
}

function reconcileRollingView(view, currentDate=todayIso()){
  if (view?.followsToday === false) return { start: view.start, followsToday: false };
  return { start: currentDate, followsToday: true };
}
function syncDailyPlanningWindow(){
  const nextView = reconcileRollingView(state.view);
  const nextFirstBookable = firstBookableIso();
  const changed = nextView.start !== state.view.start
    || nextView.followsToday !== state.view.followsToday
    || nextFirstBookable !== state.firstBookable;
  if (!changed) return false;
  state.view = nextView;
  state.firstBookable = nextFirstBookable;
  render();
  return true;
}
function sourceInfo(source){
  return CONFIG.externalSources[source] || { name:"Externo", color:"#64748B" };
}
function overlaps(aStart, aEnd, bStart, bEnd){ return aStart < bEnd && aEnd > bStart; }
function reservationRangeKey(item){
  return `${item?.start_date || ""}|${item?.end_date || ""}`;
}
function externalEventsWithoutFamilyMirrors(reservations, externalEvents){
  const familyRanges = new Set((reservations || []).map(reservationRangeKey));
  const seenRanges = new Set();
  return [...(externalEvents || [])]
    .sort((left, right) =>
      (left.start_date || "").localeCompare(right.start_date || "") ||
      (left.end_date || "").localeCompare(right.end_date || "") ||
      (left.source || "").localeCompare(right.source || "")
    )
    .filter(event => {
      const key = reservationRangeKey(event);
      if (!event?.start_date || !event?.end_date || familyRanges.has(key) || seenRanges.has(key)) return false;
      seenRanges.add(key);
      return true;
    });
}
function crossCalendarConflicts(reservations, externalEvents){
  return (reservations || []).flatMap(reservation =>
    (externalEvents || [])
      .filter(event => overlaps(
        reservation.start_date,
        reservation.end_date,
        event.start_date,
        event.end_date,
      ))
      .map(event => ({ reservation, event }))
  );
}
function calendarSyncView(syncStatus, now=Date.now()){
  const required = ["airbnb", "booking"].map(source =>
    (syncStatus || []).find(item => item.source === source)
  );
  if (required.some(item => !item)) {
    return { status:"unavailable", lastSuccessAt:null, detail:"Falta el estado de Airbnb o Booking" };
  }
  const successes = required.map(item => Date.parse(item.last_success_at || ""));
  if (successes.some(value => !Number.isFinite(value))) {
    return { status:"unavailable", lastSuccessAt:null, detail:"Aún no existe una sincronización completa" };
  }
  const oldestSuccess = Math.min(...successes);
  const failed = required.filter(item => item.status !== "ok");
  const stale = now - oldestSuccess > 45 * 60 * 1000;
  return {
    status: failed.length || stale ? "stale" : "live",
    lastSuccessAt:new Date(oldestSuccess).toISOString(),
    detail:failed.length
      ? `${failed.map(item => sourceInfo(item.source).name).join(" y ")} requieren revisión`
      : stale ? "La última sincronización tiene más de 45 minutos" : "Airbnb y Booking están al día",
  };
}
function findConflict(start, end, ignoreId = null){
  const familyConflict = state.reservations.find(r =>
    r.id !== ignoreId && overlaps(start, end, r.start_date, r.end_date));
  if (familyConflict) return { type:"family", item:familyConflict };
  const externalConflict = state.externalEvents.find(r =>
    overlaps(start, end, r.start_date, r.end_date));
  return externalConflict ? { type:"external", item:externalConflict } : null;
}
function conflictMessage(conflict){
  if (!conflict) return "";
  if (conflict.type === "external"){
    return `El rango se cruza con un bloqueo de ${sourceInfo(conflict.item.source).name}.`;
  }
  const family = fam(conflict.item.family_id);
  return `El rango se cruza con una reserva de ${family?.name || "otra familia"}.`;
}
function brushColor(){
  const f = state.brush.families[0] ? fam(state.brush.families[0]) : null;
  return f ? f.color : "#9aa6ff";
}
// UUID v4 válido para Postgres; con fallback si crypto.randomUUID no existe
// (contextos no seguros: http en LAN, file://).
function uuid(){
  if (crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2,"0"));
  return h.slice(0,4).join("")+"-"+h.slice(4,6).join("")+"-"+h.slice(6,8).join("")
       +"-"+h.slice(8,10).join("")+"-"+h.slice(10,16).join("");
}

function nowIso(){ return new Date().toISOString(); }
function availabilityGroup(version){
  return state.reservations.filter(r => r.availability_version === version);
}
function formatSyncTime(value){
  if (!value) return "N/D";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/D";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone:"America/Santiago",
    day:"2-digit",
    month:"short",
    hour:"2-digit",
    minute:"2-digit",
  }).format(date);
}

// ---------- Store: Supabase o LocalStorage ---------------------------
function localStore(){
  return {
    async all(){ return {
      reservations: JSON.parse(localStorage.getItem(LS_KEY) || "[]"),
      externalEvents: [],
      syncStatus: [],
    }; },
    async add(recs){
      const list = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      localStorage.setItem(LS_KEY, JSON.stringify([...list, ...recs]));
    },
    async remove(id){
      const list = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      localStorage.setItem(LS_KEY, JSON.stringify(list.filter(r => r.id !== id)));
    },
    async update(id, changes){
      const list = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      localStorage.setItem(LS_KEY, JSON.stringify(list.map(r => {
        if (r.id !== id) return r;
        return ReservationSync.applyAvailabilityUpdate(r, changes, {
          version:uuid(),
          changedAt:nowIso(),
        });
      })));
    },
    async markVerified(version, target){
      const field = `${target}_verified_at`;
      const list = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      localStorage.setItem(LS_KEY, JSON.stringify(list.map(r =>
        r.availability_version === version ? { ...r, [field]:nowIso() } : r
      )));
    },
    async requestSync(){ return { accepted:false, reason:"local" }; },
    onChange(cb){ window.addEventListener("storage", e => { if (e.key === LS_KEY) cb(); }); },
  };
}

function unavailableStore(reason){
  const fail = async () => { throw new Error(reason); };
  return {
    async all(){ return { reservations:[], externalEvents:[], syncStatus:[] }; },
    add:fail,
    remove:fail,
    update:fail,
    markVerified:fail,
    requestSync:fail,
    onChange(){ return () => {}; },
  };
}

async function initStore(){
  const badge = document.getElementById("mode-badge");
  let live = false, configuredButFailed = false;

  if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey){
    try{
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
      state.store = {
        async all(){
          const [reservations, externalEvents, syncStatus] = await Promise.all([
            sb.from("reservations").select("*").is("deleted_at", null).order("start_date"),
            sb.from("external_calendar_events").select("source,external_uid,start_date,end_date,last_seen_at").order("start_date"),
            sb.from("calendar_sync_status").select("source,last_success_at,last_attempt_at,status,event_count,error_message"),
          ]);
          if (reservations.error) throw reservations.error;
          if (externalEvents.error) throw externalEvents.error;
          if (syncStatus.error) throw syncStatus.error;
          return {
            reservations: reservations.data || [],
            externalEvents: externalEvents.data || [],
            syncStatus: syncStatus.data || [],
          };
        },
        async add(recs){ const { error } = await sb.from("reservations").upsert(recs.map(rec => ({ ...rec, deleted_at:null }))); if (error) throw error; },
        async remove(id){ const { error } = await sb.from("reservations").update({ deleted_at:nowIso() }).eq("id", id); if (error) throw error; },
        async update(id, changes){ const { error } = await sb.from("reservations").update({ ...changes, deleted_at:null }).eq("id", id); if (error) throw error; },
        async markVerified(version, target){
          const field = `${target}_verified_at`;
          const { error } = await sb.from("reservations")
            .update({ [field]:nowIso() })
            .eq("availability_version", version)
            .is("deleted_at", null);
          if (error) throw error;
        },
        async requestSync(){
          const { data, error } = await sb.rpc("request_calendar_ical_sync");
          if (error) throw error;
          return data || { accepted:true };
        },
        onChange(cb){
          sb.channel("family-calendar")
            .on("postgres_changes", { event:"*", schema:"public", table:"reservations" }, () => cb())
            .on("postgres_changes", { event:"*", schema:"public", table:"external_calendar_events" }, () => cb())
            .on("postgres_changes", { event:"*", schema:"public", table:"calendar_sync_status" }, () => cb())
            .subscribe();
        },
      };
      live = true;
    }catch(err){
      // Con backend configurado se falla cerrado: no crear datos divergentes locales.
      console.error("Supabase init falló:", err);
      configuredButFailed = true;
      state.store = unavailableStore("No se pudo conectar al calendario compartido");
    }
  }
  if (!state.store) state.store = localStore();

  state.live = live;
  state.loadError = configuredButFailed ? "No se pudo conectar a Supabase" : null;
  updateModeBadge();
  state.store.onChange(scheduleLoad);
}

let reloadTimer = null;
function scheduleLoad(){
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => load(), 160);
}

async function load(){
  try{
    const data = await state.store.all();
    state.reservations = data.reservations;
    state.externalEvents = externalEventsWithoutFamilyMirrors(data.reservations, data.externalEvents);
    state.syncStatus = data.syncStatus;
    state.loadError = null;
  }catch(err){
    console.error(err);
    state.loadError = (err && err.message) ? err.message : String(err);
  }
  updateModeBadge();
  updateSyncUI();
  render();   // siempre renderiza (con lo último que tenga) y muestra el error si hubo
  schedulePendingFeedChecks();
}

function schedulePendingFeedChecks(){
  if (!state.live) return;
  const versions = new Set(state.reservations
    .filter(r => r.availability_version && !r.feed_verified_at)
    .map(r => r.availability_version));
  versions.forEach(version => {
    if (state.feedChecks.has(version)) return;
    state.feedChecks.set(version, { status:"queued", error:null });
    setTimeout(() => verifyFeedPublication(version), 0);
  });
}

async function verifyFeedPublication(version){
  if (!state.live || !version) return false;
  const group = availabilityGroup(version);
  if (!group.length) return false;
  if (group.every(r => isVerifiedSince(r.feed_verified_at, r.availability_changed_at))) return true;
  if (state.feedChecks.get(version)?.status === "verifying") return false;
  state.feedChecks.set(version, { status:"verifying", error:null });
  try{
    const url = new URL(CONFIG.familyFeedUrl);
    url.searchParams.set("verify", `${version}-${Date.now()}`);
    const response = await fetch(url, { cache:"no-store" });
    if (!response.ok) throw new Error(`El feed respondió HTTP ${response.status}`);
    const result = ReservationSync.verifyAvailabilityVersion(await response.text(), group);
    if (!result.ok) throw new Error(result.reason || "La reserva aún no aparece en el feed");
    await state.store.markVerified(version, "feed");
    state.feedChecks.set(version, { status:"verified", error:null });
    await load();
    return true;
  }catch(err){
    state.feedChecks.set(version, {
      status:"error",
      error:(err && err.message) ? err.message : String(err),
    });
    render();
    return false;
  }
}

function updateModeBadge(){
  const badge = document.getElementById("mode-badge");
  if (!badge) return;
  const failedSources = state.syncStatus.filter(item => item.status === "error");
  let text = state.live ? "● Modo live · sincronizado" : "○ Modo local · solo este dispositivo";
  if (state.loadError) text = `⚠ ${state.loadError}`;
  else if (failedSources.length) text = `⚠ ${failedSources.map(item => sourceInfo(item.source).name).join(" y ")} sin actualizar`;
  badge.textContent = `${text}  ·  v${VERSION}`;
  badge.classList.toggle("live", state.live && !state.loadError && !failedSources.length);
  badge.title = failedSources.map(item => `${sourceInfo(item.source).name}: ${item.error_message || "error"}`).join("\n");
}

function updateSyncUI(){
  const badge = document.getElementById("sync-badge");
  const button = document.getElementById("sync-now");
  if (!badge || !button) return;
  button.disabled = state.syncing || !state.live;
  button.textContent = state.syncing ? "Sincronizando…" : "↻ Sincronizar";
  badge.classList.remove("live", "warn");
  if (state.syncing){
    badge.textContent = "↻ Consultando Airbnb, Booking y el feed familiar…";
    return;
  }
  if (!state.live){
    badge.textContent = "○ Sin publicación externa en modo local";
    badge.classList.add("warn");
    return;
  }
  const view = calendarSyncView(state.syncStatus);
  const conflicts = crossCalendarConflicts(state.reservations, state.externalEvents);
  if (conflicts.length){
    badge.classList.add("warn");
    badge.textContent = `⚠ ${conflicts.length} cruce entre calendarios · revisar`;
    badge.title = "Una reserva familiar se cruza con Airbnb o Booking. Sincronizar no elimina el cruce: hay que corregir una de las reservas en su origen.";
    return;
  }
  badge.classList.toggle("live", view.status === "live");
  badge.classList.toggle("warn", view.status !== "live");
  badge.textContent = view.status === "live"
    ? `● En vivo · última sincronización ${formatSyncTime(view.lastSuccessAt)}`
    : `⚠ ${view.detail}`;
  badge.title = view.status === "live"
    ? "Airbnb y Booking se importaron correctamente. Las reservas familiares se publican en el feed iCal."
    : view.detail;
}

function latestSyncAttempt(){
  const attempts = state.syncStatus
    .map(item => Date.parse(item.last_attempt_at || ""))
    .filter(Number.isFinite);
  return attempts.length ? Math.max(...attempts) : 0;
}

function wait(milliseconds){
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function synchronizeCalendars(){
  if (state.syncing || !state.live) return;
  state.syncing = true;
  updateSyncUI();
  const previousAttempt = latestSyncAttempt();
  try{
    const request = await state.store.requestSync();
    const shouldPoll = request?.accepted !== false;
    for (let attempt = 0; attempt < (shouldPoll ? 8 : 1); attempt += 1){
      await wait(attempt === 0 ? 500 : 1000);
      await load();
      if (!shouldPoll || latestSyncAttempt() > previousAttempt) break;
    }
    const versions = [...new Set(state.reservations
      .filter(reservation => reservation.availability_version && !reservation.feed_verified_at)
      .map(reservation => reservation.availability_version))];
    for (const version of versions) await verifyFeedPublication(version);
    const view = calendarSyncView(state.syncStatus);
    const conflicts = crossCalendarConflicts(state.reservations, state.externalEvents);
    alert(conflicts.length
      ? `La sincronización terminó, pero hay ${conflicts.length} cruce entre una reserva familiar y Airbnb o Booking. Revisa las fechas en el calendario y corrige la reserva equivocada en su origen.`
      : view.status === "live"
      ? `Sincronización lista. Airbnb y Booking fueron consultados por última vez el ${formatSyncTime(view.lastSuccessAt)}. El feed familiar también fue comprobado.`
      : `La revisión terminó, pero requiere atención: ${view.detail}.`);
  }catch(err){
    alert("No se pudo completar la sincronización: " + ((err && err.message) || String(err)));
  }finally{
    state.syncing = false;
    updateSyncUI();
  }
}

// En dispositivos sin hover (touch) no bindeamos mouseenter/mouseleave: la
// preview de brush por hover es desktop-only. En touch el brush-bar muestra
// el rango y se actualiza por onCellClick → render.
const HAS_HOVER = typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;
function render(){
  renderNav();
  renderFamilySelect();
  renderGrid();
  updateHintBar();
  updateBrushBar();
  updatePreview();
  updateSyncUI();
}

// Contenido estático que no cambia: se arma una sola vez al iniciar.
function buildStatic(){
  document.getElementById("weekdays").innerHTML = WD.map(d => `<div>${d}</div>`).join("");
  renderReservationOptions();
}

function renderReservationOptions(){
  const families = CONFIG.families.map(f =>
    `<span class="chip"><span class="dot" style="background:${f.color}"></span>${f.name}</span>`
  ).join("");
  const sources = Object.entries(CONFIG.externalSources).map(([id, source]) =>
    `<span class="chip source-chip" data-source="${id}"><span class="dot" style="background:${source.color}"></span>${source.name}</span>`
  ).join("");
  document.getElementById("legend").innerHTML = families + sources;
  document.getElementById("fs-menu").innerHTML = selectableFamilies().map(fm => `
    <button type="button" class="fs-row" role="option" tabindex="-1" data-fam="${fm.id}" style="--c:${fm.color}">
      <span class="dot" style="background:${fm.color}"></span>${fm.name}
    </button>`).join("");
}

function renderNav(){
  const range = rollingMonthWindow(state.view.start);
  const label = document.getElementById("range-label");
  label.textContent = `${pretty(range.start)} — ${pretty(range.endInclusive)}`;
  label.title = `Planificación de ${CONFIG.rollingDays} días consecutivos`;
  label.classList.toggle("following-today", state.view.followsToday);
}

function renderFamilySelect(){
  const trig = document.getElementById("fs-trigger");
  const ids = state.brush.families, first = ids[0] ? fam(ids[0]) : null;
  let label, color;
  if (ids.length === 0){ label = "Elegir familia"; color = "rgba(255,255,255,.18)"; }
  else if (ids.length === 1){ label = first.name; color = first.color; }
  else { label = ids.length + " familias"; color = first.color; }
  document.getElementById("fs-label").textContent = label;
  document.getElementById("fs-dot").style.background = color;
  trig.style.setProperty("--c", first ? first.color : "transparent");
  trig.classList.toggle("selected", ids.length > 0);
  // marca las filas elegidas (check visual) — clave para multi-selección en admin
  document.querySelectorAll("#fs-menu .fs-row").forEach(row => {
    const on = ids.includes(row.dataset.fam);
    row.classList.toggle("selected", on);
    row.setAttribute("aria-selected", String(on));
  });
}

function renderGrid(){
  const windowRange = rollingMonthWindow(state.view.start);
  const firstParts = parseISO(windowRange.start);
  const first = new Date(firstParts.y, firstParts.m, firstParts.d);
  const lead = (first.getDay() - CONFIG.weekStart + 7) % 7;
  const totalCells = Math.ceil((lead + windowRange.dates.length) / 7) * 7;

  const n = new Date();
  const todayStr = isoOf(n.getFullYear(), n.getMonth(), n.getDate());

  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  grid.dataset.windowStart = windowRange.start;
  grid.dataset.windowEnd = windowRange.endInclusive;
  grid.dataset.windowDays = String(windowRange.dates.length);
  for (let i=0; i<totalCells; i++){
    const dateIndex = i - lead;
    const cell = document.createElement("div");
    if (dateIndex < 0 || dateIndex >= windowRange.dates.length){
      cell.className = "cell blank";
      grid.appendChild(cell);
      continue;
    }
    const dateStr = windowRange.dates[dateIndex];
    const { y, m, d: dayNum } = parseISO(dateStr);
    const startsMonth = dayNum === 1;
    const blocked = state.admin ? false : (dateStr < state.firstBookable);
    cell.className = "cell" + (dateStr === todayStr ? " today" : "") + (blocked ? " blocked" : "")
      + (startsMonth ? " month-start" : "");
    cell.dataset.date = dateStr;
    cell.dataset.month = `${y}-${pad(m + 1)}`;
    if (blocked) cell.title = "No disponible (margen Airbnb)";

    const num = document.createElement("div");
    num.className = "num";
    num.innerHTML = `<span>${dayNum}</span>${dateIndex === 0 || startsMonth ? `<small class="month-marker${startsMonth ? " prominent" : ""}">${MON_SHORT[m]}</small>` : ""}`;
    cell.appendChild(num);

    const familyItems = state.reservations
      .filter(r => reservationVisibleOnDate(r, dateStr))
      .map(r => ({ ...r, kind:"family" }));
    const externalItems = state.externalEvents
      .filter(r => reservationVisibleOnDate(r, dateStr))
      .map(r => ({ ...r, id:`${r.source}:${r.external_uid}`, kind:"external" }));
    const dayItems = [...familyItems, ...externalItems].sort((a,b) => {
      if (a.kind !== b.kind) return a.kind === "family" ? -1 : 1;
      if (a.kind === "family") return famIdx(a.family_id) - famIdx(b.family_id);
      return a.source.localeCompare(b.source);
    });
    if (dayItems.length) cell.classList.add(`lanes-${Math.min(dayItems.length, CONFIG.maxLanes)}`);

    const segs = document.createElement("div");
    segs.className = "segments";
    dayItems.slice(0, CONFIG.maxLanes).forEach(r => {
      const f = r.kind === "external"
        ? sourceInfo(r.source)
        : (fam(r.family_id) || { name:"?", color:"#888" });
      const timing = reservationTimingForDate(r, dateStr);
      const { isStart, isEnd } = timing;
      const cls = ["seg", isStart && "start", isEnd && "end",
                   (isStart && isEnd) && "pill", r.kind === "external" && "external"].filter(Boolean).join(" ");
      const seg = document.createElement("div");
      seg.className = cls;
      seg.style.background = f.color;
      const kind = document.createElement("span");
      kind.className = "seg-kind";
      kind.textContent = timing.label;
      seg.appendChild(kind);
      if (timing.time){
        const time = document.createElement("span");
        time.className = "seg-time";
        time.textContent = timing.time;
        seg.appendChild(time);
      }
      seg.setAttribute("aria-label", `${f.name}: ${timing.label}${timing.time ? ` ${timing.time}` : " en curso"}`);
      seg.dataset.id = r.id;
      seg.title = r.kind === "external"
        ? `${f.name} · ${r.start_date} ${CHECKIN_TIME} → ${r.end_date} ${CHECKOUT_TIME}`
        : `${f.name} · ${r.start_date} ${CHECKIN_TIME} → ${r.end_date} ${CHECKOUT_TIME}${r.note ? " · " + r.note : ""}`;
      seg.addEventListener("click", e => { e.stopPropagation(); openPopover(r, seg); });
      segs.appendChild(seg);
    });
    if (dayItems.length > CONFIG.maxLanes){
      const more = document.createElement("div");
      more.className = "seg pill";
      more.style.background = "rgba(255,255,255,.25)";
      more.textContent = `+${dayItems.length - CONFIG.maxLanes}`;
      segs.appendChild(more);
    }
    cell.appendChild(segs);

    if (!blocked){
      cell.addEventListener("click", () => onCellClick(dateStr));
      if (HAS_HOVER){
        cell.addEventListener("mouseenter", () => { if (state.brush.start){ state.brush.hover = dateStr; updatePreview(); } });
        cell.addEventListener("mouseleave", () => { if (state.brush.hover){ state.brush.hover = null; updatePreview(); } });
      }
    }
    grid.appendChild(cell);
  }
}

// ---------- Selector de familia + selección en calendario ------------
function focusRow(i){
  const rows = [...document.querySelectorAll("#fs-menu .fs-row")];
  if (!rows.length) return;
  state.menuIdx = (i + rows.length) % rows.length;
  rows[state.menuIdx].focus();
}

function toggleMenu(open, autofocus = true){
  const menu = document.getElementById("fs-menu");
  const trig = document.getElementById("fs-trigger");
  const show = (typeof open === "boolean") ? open : menu.hidden;
  menu.hidden = !show;
  trig.classList.toggle("open", show);
  trig.setAttribute("aria-expanded", String(show));
  if (show && autofocus){ state.menuIdx = 0; requestAnimationFrame(() => focusRow(0)); }
}

function selectFamily(id){
  const selectedFamily = fam(id);
  if (!selectedFamily || (selectedFamily.adminOnly && !state.admin)) return;
  const b = state.brush;
  if (state.admin){
    if (selectedFamily.adminOnly){
      b.families = b.families.includes(id) ? [] : [id];
    } else {
      b.families = b.families.filter(familyId => !fam(familyId)?.adminOnly);
      const i = b.families.indexOf(id);
      if (i >= 0) b.families.splice(i,1); else b.families.push(id);   // acumula (multi)
    }
  } else {
    b.families = (b.families[0] === id) ? [] : [id];                // single (toggle)
  }
  b.start = b.end = b.hover = null;
  state.selectionError = null;
  if (!state.admin) toggleMenu(false);   // admin: deja abierto para elegir más
  render();
}

function onCellClick(dateStr){
  const b = state.brush;
  if (!b.families.length) return;
  if (!state.admin && dateStr < state.firstBookable) return;   // admin reserva en cualquier fecha
  state.selectionError = null;
  if (!b.start || dateStr <= b.start){
    const dayConflict = findConflict(dateStr, addDays(dateStr, 1));
    if (dayConflict){ state.selectionError = conflictMessage(dayConflict); render(); return; }
    b.start = dateStr;
    b.end = null;
  } else {
    const conflict = findConflict(b.start, dateStr);
    if (conflict){ state.selectionError = conflictMessage(conflict); render(); return; }
    b.end = dateStr;
  }
  b.hover = null;
  render();
}

function updatePreview(){
  const b = state.brush, root = document.getElementById("grid");
  root.style.setProperty("--brush", brushColor());
  const cells = root.querySelectorAll(".cell[data-date]");
  if (!b.start){
    cells.forEach(c => c.classList.remove("in-range","range-start","range-end","range-checkout","single"));
    return;
  }
  const end = (b.hover && b.hover > b.start) ? b.hover : b.end;
  cells.forEach(c => {
    const d = c.dataset.date;
    c.classList.toggle("range-start", d === b.start);
    c.classList.toggle("range-checkout", Boolean(end) && d === end);
    c.classList.toggle("single", !end && d === b.start);
    c.classList.toggle("in-range", Boolean(end) && d > b.start && d < end);
  });
}

function updateHintBar(){
  const el = document.getElementById("hint-bar"), b = state.brush;
  let txt;
  if (state.loadError) txt = "⚠️ No se pudieron cargar las reservas: " + state.loadError;
  else if (state.selectionError) txt = `⚠️ ${state.selectionError}`;
  else if (!b.families.length) txt = "👆 Elige una familia arriba para empezar a reservar";
  else if (!b.start) txt = `Toca el día de CHECK-IN · ${CHECKIN_TIME}`;
  else if (!b.end) txt = `Toca el día de CHECK-OUT · ${CHECKOUT_TIME} · esa fecha quedará libre`;
  else txt = `Check-in ${pretty(b.start)} ${CHECKIN_TIME} → Check-out ${pretty(b.end)} ${CHECKOUT_TIME} · toca Confirmar`;
  el.textContent = txt;
  el.classList.toggle("active", b.families.length > 0 && !state.loadError);
}

function updateBrushBar(){
  const bar = document.getElementById("brush-bar"), b = state.brush;
  if (!b.start){ bar.classList.remove("show"); return; }
  bar.classList.add("show");
  const range = b.end
    ? `Check-in ${pretty(b.start)} ${CHECKIN_TIME} → Check-out ${pretty(b.end)} ${CHECKOUT_TIME}`
    : `Check-in ${pretty(b.start)} ${CHECKIN_TIME} · elige check-out`;
  const n = b.end ? daysBetween(b.start, b.end) : 0;
  bar.querySelector(".bb-fam").textContent = b.families.length === 1
    ? (fam(b.families[0])?.name || "")
    : (b.families.length + " familias");
  bar.querySelector(".bb-range").textContent = b.end ? `${range} · ${n} ${n===1?"noche":"noches"}` : range;
  const confirm = bar.querySelector(".bb-confirm");
  confirm.style.background = brushColor();
  confirm.disabled = !b.end;
}

async function confirmBrush(){
  const b = state.brush;
  if (!b.start || !b.end || !b.families.length) return;
  const conflict = findConflict(b.start, b.end);
  if (conflict){ state.selectionError = conflictMessage(conflict); render(); return; }
  const recs = b.families.map(family_id => ({
    id: uuid(), family_id, start_date: b.start, end_date: b.end, note: ""
  }));
  try{
    await state.store.add(recs);
    pushUndo({ op:"remove", recs });
    b.start = b.end = b.hover = null;
    await load();
  }catch(err){ alert("Error al guardar: " + err.message); }
}

function cancelSelection(){
  state.brush.start = state.brush.end = state.brush.hover = null;
  state.selectionError = null;
  render();
}

// ---------- Deshacer (máx 7 pasos) ----------
// Cada cambio de datos deja su inversa en state.undo. Deshacer aplica y descarta.
function pushUndo(entry){
  state.undo.push(entry);
  if (state.undo.length > 7) state.undo.shift();   // tope de 7
  updateUndoBtn();
}
async function doUndo(){
  const entry = state.undo.pop();
  if (!entry) return;
  try{
    if (entry.op === "remove"){           // el cambio fue un ALTA → borrar esos ids
      for (const r of entry.recs) await state.store.remove(r.id);
    } else if (entry.op === "add"){       // el cambio fue una BAJA → reinsertar
      await state.store.add(entry.recs);
    } else if (entry.op === "update"){
      await state.store.update(entry.before.id, entry.before);
    }
    await load();
  }catch(err){
    state.undo.push(entry);               // si falla, devuelve el paso a la pila
    alert("No se pudo deshacer: " + err.message);
  }
  updateUndoBtn();
}
function updateUndoBtn(){
  const btn = document.getElementById("undo");
  if (!btn) return;
  btn.disabled = state.undo.length === 0;
  btn.textContent = state.undo.length ? `↩ Deshacer (${state.undo.length})` : "↩ Deshacer";
}

// ---------- Modo admin (clave 2407): fechas sin restricción + multi-familia ----------
function toggleAdmin(){
  if (state.admin){
    state.admin = false;
    state.brush.families = state.brush.families
      .filter(id => !fam(id)?.adminOnly)
      .slice(0,1);   // vuelve a selección simple y retira opciones exclusivas de admin
  } else {
    const key = prompt("Clave de admin:");
    if (key === null) return;
    if (key === "2407") state.admin = true;
    else { alert("Clave incorrecta"); return; }
  }
  updateAdminUI();
  render();
}
function updateAdminUI(){
  const btn = document.getElementById("admin");
  if (btn){
    btn.textContent = state.admin ? "🔓 Admin ON" : "🔒 Admin";
    btn.classList.toggle("on", state.admin);
  }
  document.body.classList.toggle("admin-mode", state.admin);
  renderReservationOptions();
}

// ---------- Modal nueva / editar reserva -----------------------------
function openModal({ start, end, reservation = null }){
  const modal = document.getElementById("modal");
  const startEl = document.getElementById("start");
  const endEl = document.getElementById("end");
  const minD = state.admin ? `${CONFIG.yearMin}-01-01` : state.firstBookable;
  state.editingId = reservation?.id || null;
  startEl.min = minD; startEl.max = MAX_DATE;
  endEl.min = addDays(start || minD, 1); endEl.max = MAX_DATE;
  startEl.value = start; endEl.value = end;
  document.getElementById("note").value = reservation?.note || "";
  document.getElementById("hint").textContent = "";
  document.getElementById("modal-title").textContent = reservation ? "Editar reserva" : "Nueva reserva";
  document.getElementById("save").textContent = reservation ? "Guardar cambios" : "Guardar";

  const fc = document.getElementById("fam-checks");
  fc.innerHTML = selectableFamilies().map(f => `
    <label class="fam-opt">
      <input type="${reservation ? "radio" : "checkbox"}" name="modal-family" value="${f.id}" ${reservation?.family_id === f.id ? "checked" : ""}>
      <span class="swatch" style="background:${f.color}"></span>
      <span class="nm">${f.name}</span>
    </label>`).join("");

  modal.hidden = false;
  requestAnimationFrame(() => startEl.focus());
}

function closeModal(){
  document.getElementById("modal").hidden = true;
  state.editingId = null;
}

async function saveReservation(){
  const ids = [...document.querySelectorAll("#fam-checks input:checked")].map(c => c.value);
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  const note = document.getElementById("note").value.trim();
  const hint = document.getElementById("hint");

  if (!ids.length){ hint.textContent = "Selecciona al menos una familia."; return; }
  if (!start || !end){ hint.textContent = "Faltan fechas."; return; }
  if (end <= start){ hint.textContent = "La salida debe ser posterior a la llegada."; return; }
  if (!state.admin && start < state.firstBookable){ hint.textContent = "Esa fecha está dentro del margen no disponible."; return; }
  if (end > MAX_DATE){ hint.textContent = `La fecha no puede ser posterior a ${MAX_DATE}.`; return; }

  const beforeEdit = state.editingId ? state.reservations.find(r => r.id === state.editingId) : null;
  const datesUnchanged = Boolean(beforeEdit && beforeEdit.start_date === start && beforeEdit.end_date === end);
  const conflict = datesUnchanged ? null : findConflict(start, end, state.editingId);
  if (conflict){ hint.textContent = conflictMessage(conflict); return; }

  try{
    const editedId = state.editingId;
    let requestedVersion = null;
    if (state.editingId){
      const before = beforeEdit;
      if (!before) throw new Error("La reserva ya no existe");
      const after = { ...before, family_id:ids[0], start_date:start, end_date:end, note };
      await state.store.update(before.id, {
        family_id:after.family_id,
        start_date:after.start_date,
        end_date:after.end_date,
        note:after.note,
      });
      pushUndo({ op:"update", before, after });
    } else {
      requestedVersion = uuid();
      const changedAt = nowIso();
      const recs = ids.map(family_id => {
        const record = {
          id:uuid(), family_id, start_date:start, end_date:end, note,
          availability_version:requestedVersion,
        };
        return state.live ? record : {
          ...record,
          availability_changed_at:changedAt,
          feed_verified_at:null,
          airbnb_verified_at:null,
          booking_verified_at:null,
        };
      });
      await state.store.add(recs);
      pushUndo({ op:"remove", recs });
    }
    closeModal();
    await load();
    const saved = editedId ? state.reservations.find(r => r.id === editedId) : null;
    const version = saved?.availability_version || requestedVersion;
    if (state.live && version) await verifyFeedPublication(version);
  }catch(err){
    hint.textContent = "Error al guardar: " + err.message;
  }
}

function isVerifiedSince(verifiedAt, changedAt){
  const verified = Date.parse(verifiedAt || "");
  const changed = Date.parse(changedAt || "");
  return Number.isFinite(verified) && Number.isFinite(changed) && verified >= changed;
}

function providerSyncView(r, provider){
  const info = sourceInfo(provider);
  const verifiedAt = r[`${provider}_verified_at`];
  const derived = ReservationSync.providerState({
    provider,
    changedAt:r.availability_changed_at,
    verifiedAt,
  });
  if (derived.status === "verified") return {
    status:"verified",
    label:"Verificado",
    detail:formatSyncTime(verifiedAt),
    name:info.name,
  };
  if (derived.status === "pending") return {
    status:"pending",
    label:`Pendiente en ${info.name}`,
    detail:`Revisar antes de ${formatSyncTime(derived.deadline)}`,
    name:info.name,
  };
  return {
    status:"review-required",
    label:"Revisión requerida",
    detail:`${info.name} · plazo ${formatSyncTime(derived.deadline)}`,
    name:info.name,
  };
}

function renderExternalSync(r){
  if (!state.live){
    return `<section class="external-sync local-sync" aria-label="Sincronización externa">
      <h3>Sincronización externa</h3>
      <p><strong>Solo este dispositivo</strong> · no se publica en Airbnb ni Booking.</p>
    </section>`;
  }
  const check = state.feedChecks.get(r.availability_version);
  const feedCurrent = isVerifiedSince(r.feed_verified_at, r.availability_changed_at);
  let feedStatus = "verifying", feedLabel = "Verificando publicación", feedDetail = "Comprobando el feed familiar";
  if (feedCurrent){
    feedStatus = "verified";
    feedLabel = "Publicado en feed";
    feedDetail = formatSyncTime(r.feed_verified_at);
  } else if (check?.status === "error"){
    feedStatus = "error";
    feedLabel = "Error de publicación";
    feedDetail = escapeHtml(check.error || "No se pudo comprobar el feed");
  }
  const providers = [providerSyncView(r, "booking"), providerSyncView(r, "airbnb")];
  const allVerified = feedCurrent && providers.every(item => item.status === "verified");
  return `<section class="external-sync" aria-label="Sincronización externa">
    <div class="sync-heading">
      <h3>Sincronización externa</h3>
      <span class="sync-overall ${allVerified ? "verified" : "pending"}">${allVerified ? "Verificado" : "Pendiente externo"}</span>
    </div>
    <p class="sync-changed">Último cambio: ${formatSyncTime(r.availability_changed_at)}</p>
    <div class="sync-row ${feedStatus}">
      <span class="sync-dot" aria-hidden="true"></span>
      <span><strong>${feedLabel}</strong><small>${feedDetail}</small></span>
      ${feedStatus === "error" ? `<button type="button" class="sync-retry" data-sync-retry>Reintentar</button>` : ""}
    </div>
    ${providers.map((item, index) => {
      const provider = index === 0 ? "booking" : "airbnb";
      return `<div class="sync-row ${item.status}">
        <span class="sync-dot" aria-hidden="true"></span>
        <span><strong>${item.label}</strong><small>${item.detail}</small></span>
        <div class="sync-actions">
          <a href="${CONFIG.providerAdminUrls[provider]}" target="_blank" rel="noopener noreferrer">Abrir ${item.name}</a>
          ${item.status === "verified" ? "" : `<button type="button" data-sync-provider="${provider}">Marcar ${item.name} verificado</button>`}
        </div>
      </div>`;
    }).join("")}
    <p class="sync-note">Airbnb y Booking revisan iCal en sus propios plazos. El estado solo cambia a verificado después de una revisión manual.</p>
  </section>`;
}

function bindExternalSyncActions(pop, r){
  const retry = pop.querySelector("[data-sync-retry]");
  if (retry) retry.addEventListener("click", async () => {
    retry.disabled = true;
    await verifyFeedPublication(r.availability_version);
    pop.hidden = true;
  });
  pop.querySelectorAll("[data-sync-provider]").forEach(button => {
    button.addEventListener("click", async () => {
      const provider = button.dataset.syncProvider;
      const name = sourceInfo(provider).name;
      if (!confirm(`¿Confirmas que revisaste ${name} y las fechas están bloqueadas correctamente?`)) return;
      try{
        button.disabled = true;
        await state.store.markVerified(r.availability_version, provider);
        await load();
        pop.hidden = true;
      }catch(err){
        button.disabled = false;
        alert(`No se pudo marcar ${name}: ${err.message}`);
      }
    });
  });
}

// ---------- Detalle de reserva / bloqueo externo --------------------
function openPopover(r, anchor){
  const pop = document.getElementById("pop");
  if (r.kind === "external"){
    const source = sourceInfo(r.source);
    pop.innerHTML = `
      <div class="ptitle"><span class="dot" style="display:inline-block;background:${source.color};margin-right:6px"></span>${source.name}</div>
      <div class="prow"><span>Check-in</span><b>${escapeHtml(pretty(r.start_date))} ${CHECKIN_TIME}</b></div>
      <div class="prow"><span>Check-out</span><b>${escapeHtml(pretty(r.end_date))} ${CHECKOUT_TIME}</b></div>`;
    pop.hidden = false;
    positionPopover(pop, anchor);
    return;
  }
  const f = fam(r.family_id) || { name:"?", color:"#888" };
  const canModify = !f.adminOnly || state.admin;
  pop.innerHTML = `
    <div class="ptitle"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${f.color};margin-right:6px"></span>${f.name}</div>
    <div class="prow"><span>Check-in</span><b>${escapeHtml(pretty(r.start_date))} ${CHECKIN_TIME}</b></div>
    <div class="prow"><span>Check-out</span><b>${escapeHtml(pretty(r.end_date))} ${CHECKOUT_TIME}</b></div>
    ${r.note ? `<div class="prow"><span>Nota</span><b>${escapeHtml(r.note)}</b></div>` : ""}
    ${renderExternalSync(r)}
    ${canModify ? `<div class="pactions">
      <button class="pedit">Editar</button>
      <button class="pdel">Eliminar</button>
    </div>` : ""}`;
  pop.hidden = false;
  positionPopover(pop, anchor);
  bindExternalSyncActions(pop, r);
  if (!canModify) return;
  pop.querySelector(".pedit").addEventListener("click", () => {
    pop.hidden = true;
    openModal({ start:r.start_date, end:r.end_date, reservation:r });
  });
  pop.querySelector(".pdel").addEventListener("click", async () => {
    try{ await state.store.remove(r.id); pushUndo({ op:"add", recs:[r] }); pop.hidden = true; await load(); }
    catch(err){ alert("No se pudo eliminar: " + err.message); }
  });
}

function positionPopover(pop, anchor){
  // Mobile (≤560px): bottom sheet — el CSS ya fija left/right/bottom con !important.
  if (window.innerWidth <= 560){
    pop.style.left = "";
    pop.style.top = "";
    return;
  }
  const r = anchor.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + 6;
  const popRect = pop.getBoundingClientRect();
  const pw = popRect.width;
  const ph = popRect.height;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  pop.style.left = Math.max(8, left) + "px";
  pop.style.top = Math.max(8, top) + "px";
}

function escapeHtml(s){ return s.replace(/[&<>"']/g, c =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

// ---------- Navegación ----------
function move(delta){
  const minStart = `${CONFIG.yearMin}-01-01`;
  const maxStart = `${CONFIG.yearMax}-12-01`;
  const candidate = addDays(state.view.start, delta * CONFIG.rollingDays);
  const start = candidate < minStart ? minStart : candidate > maxStart ? maxStart : candidate;
  state.view = { start, followsToday: false };
  render();
}

// ---------- Eventos ----------
function bind(){
  document.getElementById("prev").addEventListener("click", () => move(-1));
  document.getElementById("next").addEventListener("click", () => move(1));
  document.getElementById("today").addEventListener("click", () => {
    state.view = { start: todayIso(), followsToday: true };
    state.firstBookable = firstBookableIso();
    render();
  });
  document.getElementById("add").addEventListener("click", () => {
    openModal({ start: state.firstBookable, end: addDays(state.firstBookable, 1) });
  });

  // desplegable de familia: clic, teclado y cierre al perder foco
  document.getElementById("fs-trigger").addEventListener("click", () => toggleMenu());
  document.getElementById("fs-menu").addEventListener("click", e => {
    const row = e.target.closest(".fs-row"); if (!row) return;
    selectFamily(row.dataset.fam);
  });

  document.getElementById("brush-confirm").addEventListener("click", confirmBrush);
  document.getElementById("undo").addEventListener("click", doUndo);
  document.getElementById("admin").addEventListener("click", toggleAdmin);
  document.getElementById("sync-now").addEventListener("click", synchronizeCalendars);
  document.getElementById("brush-cancel").addEventListener("click", cancelSelection);

  document.getElementById("cancel").addEventListener("click", closeModal);
  document.getElementById("save").addEventListener("click", saveReservation);
  document.getElementById("start").addEventListener("change", e => {
    if (!e.target.value) return;
    const end = document.getElementById("end");
    end.min = addDays(e.target.value, 1);
    if (!end.value || end.value <= e.target.value) end.value = addDays(e.target.value, 1);
  });
  document.getElementById("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
  document.getElementById("fam-checks").addEventListener("change", e => {
    const input = e.target.closest("input");
    if (!input?.checked) return;
    const selectedFamily = fam(input.value);
    const options = [...document.querySelectorAll("#fam-checks input")];
    if (selectedFamily?.adminOnly){
      options.forEach(option => { if (option !== input) option.checked = false; });
    } else {
      options.forEach(option => {
        if (fam(option.value)?.adminOnly) option.checked = false;
      });
    }
  });

  // cerrar popover y menú al hacer click fuera
  document.addEventListener("click", e => {
    const pop = document.getElementById("pop");
    if (!pop.hidden && !pop.contains(e.target) && !e.target.classList.contains("seg")) pop.hidden = true;
    if (!document.getElementById("fam-select").contains(e.target)) toggleMenu(false);
  });
  // teclado: flechas en el desplegable abierto; ESC cierra todo
  document.addEventListener("keydown", e => {
    const menu = document.getElementById("fs-menu");
    if (!menu.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")){
      e.preventDefault();
      focusRow((state.menuIdx ?? 0) + (e.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (e.key === "Escape"){
      closeModal();
      cancelSelection();
      toggleMenu(false);
      document.getElementById("pop").hidden = true;
    }
  });
  // popover es position:fixed → al hacer scroll/resize se despega; ocultarlo.
  // (el menú de familia es position:absolute, no se despega → no hace falta cerrarlo)
  window.addEventListener("scroll", () => { document.getElementById("pop").hidden = true; }, true);
  window.addEventListener("resize", () => { document.getElementById("pop").hidden = true; });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible"){
      syncDailyPlanningWindow();
      load();
    }
  });
}

// ---------- Lock screen con clave familiar ----------
function applyLockState(){
  const lock = document.getElementById("lock");
  if (!lock) return;
  lock.hidden = false;
  document.body.classList.add("locked");
  const first = document.querySelector("#lock-pins .lock-pin");
  if (first) first.focus();
}

function setupLock(){
  const FAMILY_KEY = "9014";
  const lock = document.getElementById("lock");
  const pins = Array.from(document.querySelectorAll("#lock-pins .lock-pin"));
  const err = document.getElementById("lock-err");
  if (!lock || pins.length !== 4) return;

  // La clave familiar es siempre obligatoria al abrir la plataforma.
  applyLockState();

  function getCode(){ return pins.map(p => p.value).join(""); }
  function clearPins(){
    pins.forEach(p => { p.value = ""; p.classList.remove("filled", "wrong"); });
    pins[0].focus();
  }
  function fail(msg){
    err.textContent = msg;
    pins.forEach(p => p.classList.add("wrong"));
    setTimeout(() => {
      pins.forEach(p => p.classList.remove("wrong"));
      clearPins();
    }, 550);
  }
  function success(){
    lock.classList.add("unlocking");
    document.body.classList.remove("locked");
    setTimeout(() => {
      lock.hidden = true;
      err.textContent = "";
    }, 600);
  }

  pins.forEach((pin, i) => {
    pin.addEventListener("input", () => {
      pin.value = pin.value.replace(/\D/g, "").slice(0, 1);
      pin.classList.toggle("filled", pin.value.length === 1);
      if (pin.value && i < pins.length - 1){
        pins[i + 1].focus();
      }
      if (i === pins.length - 1 && getCode().length === pins.length){
        if (getCode() === FAMILY_KEY) success();
        else fail("Clave incorrecta");
      }
    });
    pin.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !pin.value && i > 0){
        pins[i - 1].focus();
        pins[i - 1].value = "";
        pins[i - 1].classList.remove("filled");
      }
      if (e.key === "ArrowLeft" && i > 0){ e.preventDefault(); pins[i - 1].focus(); }
      if (e.key === "ArrowRight" && i < pins.length - 1){ e.preventDefault(); pins[i + 1].focus(); }
    });
    pin.addEventListener("paste", e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      const digits = text.replace(/\D/g, "").split("").slice(0, pins.length);
      digits.forEach((d, j) => { pins[j].value = d; pins[j].classList.add("filled"); });
      const last = Math.min(digits.length, pins.length) - 1;
      pins[Math.max(0, last)].focus();
      if (digits.length === pins.length){
        if (digits.join("") === FAMILY_KEY) success();
        else fail("Clave incorrecta");
      }
    });
  });
}

// ---------- Init ----------
async function main(){
  try{
    state.view = { start: todayIso(), followsToday: true };
    state.firstBookable = firstBookableIso();
    document.title += "  ·  v" + VERSION;   // marca en la pestaña para detectar caché
    bind();
    buildStatic();
    await initStore();
    await load();
    updateUndoBtn();
    updateAdminUI();
    setupLock();
    clearInterval(state.rollingWindowHandle);
    state.rollingWindowHandle = setInterval(syncDailyPlanningWindow, 60 * 1000);
    // el desplegable parte CERRADO; se abre/toca con la flecha (toggle confiable)
  }catch(err){
    console.error("Init error:", err);
    state.loadError = (err && err.message) ? err.message : String(err);
    render();
  }
}

if (typeof document !== "undefined") main();

if (typeof module !== "undefined" && module.exports){
  module.exports = {
    CHECKIN_TIME,
    CHECKOUT_TIME,
    reconcileRollingView,
    reservationTimingForDate,
    reservationVisibleOnDate,
    rollingMonthWindow,
    calendarSyncView,
    externalEventsWithoutFamilyMirrors,
    crossCalendarConflicts,
  };
}
