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
  supabaseAnonKey: "sb_publishable_B_MIa8pWGFjzLhdzLoi61A_kffCRo8",

  families: [
    { id: "papas",          name: "Papás",          color: "#A855F7" },
    { id: "quiroz-ayala",   name: "Quiroz Ayala",   color: "#10B981" },
    { id: "ayala-gonzalez", name: "Ayala Gonzalez", color: "#F59E0B" },
    { id: "cattan-ayala",   name: "Cattan Ayala",   color: "#EC4899" },
    { id: "coco",           name: "Coco",           color: "#3B82F6" },
  ],

  weekStart: 1,          // 1 = lunes, 0 = domingo
  yearMin: 2020,
  yearMax: 2040,
  maxLanes: 3,           // barras visibles por celda antes de "+N"
  airbnbMarginDays: 4,   // primer día reservable = hoy + N (margen Airbnb)
};

const VERSION = "15";  // marca visible (pestaña + badge) para detectar si hay caché
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MON_SHORT = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const WD = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const LS_KEY = "chillan-reservations";
const MAX_DATE = `${CONFIG.yearMax}-12-31`;   // tope de fechas reservables

// ---------- Estado ----------
const state = {
  view: today(),
  reservations: [],
  store: null,
  brush: { families: [], start: null, end: null, hover: null },
  admin: false,        // modo admin: fechas sin restricción + multi-familia
  firstBookable: null,
  loadError: null,
  menuIdx: 0,
  undo: [],          // pila de inversas (máx 7) para Deshacer
};

// ---------- Helpers fecha / familia / id ----------
function pad(n){ return String(n).padStart(2,"0"); }
function isoOf(y, m, d){ return `${y}-${pad(m+1)}-${pad(d)}`; }       // m 0-based
function today(){
  const d = new Date();
  return { y:d.getFullYear(), m:d.getMonth() };
}
function parseISO(s){ const [y,m,d] = s.split("-").map(Number); return {y,m:m-1,d}; }
function fam(id){ return CONFIG.families.find(f => f.id === id); }
function famIdx(id){ return CONFIG.families.findIndex(f => f.id === id); }
function firstBookableIso(){
  const d = new Date();
  d.setDate(d.getDate() + CONFIG.airbnbMarginDays);
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}
function pretty(iso){ const { m, d } = parseISO(iso); return `${d} ${MON_SHORT[m]}`; }
function daysBetween(a, b){
  const da = parseISO(a), db = parseISO(b);
  return Math.round((Date.UTC(db.y, db.m, db.d) - Date.UTC(da.y, da.m, da.d)) / 86400000) + 1;
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

// ---------- Store: Supabase o LocalStorage ---------------------------
function localStore(){
  return {
    async all(){ return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); },
    async add(recs){
      const list = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      localStorage.setItem(LS_KEY, JSON.stringify([...list, ...recs]));
    },
    async remove(id){
      const list = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      localStorage.setItem(LS_KEY, JSON.stringify(list.filter(r => r.id !== id)));
    },
    onChange(cb){ window.addEventListener("storage", e => { if (e.key === LS_KEY) cb(); }); },
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
        async all(){ const { data, error } = await sb.from("reservations").select("*").order("start_date"); if (error) throw error; return data; },
        async add(recs){ const { error } = await sb.from("reservations").insert(recs); if (error) throw error; },
        async remove(id){ const { error } = await sb.from("reservations").delete().eq("id", id); if (error) throw error; },
        onChange(cb){ sb.channel("reservations").on("postgres_changes",
          { event:"*", schema:"public", table:"reservations" }, () => cb()).subscribe(); },
      };
      live = true;
    }catch(err){
      // CDN bloqueado / sin red / claves malas → caer a modo local en vez de morir
      console.error("Supabase init falló, usando modo local:", err);
      configuredButFailed = true;
    }
  }
  if (!live) state.store = localStore();

  badge.textContent = (live
    ? "● Modo live · sincronizado"
    : (configuredButFailed
        ? "⚠ Modo local (no se pudo conectar a Supabase)"
        : "○ Modo local · solo este dispositivo (configura Supabase para sincronizar)")) + "  ·  v" + VERSION;
  badge.classList.toggle("live", live);
  state.store.onChange(() => load());
}

async function load(){
  try{
    state.reservations = await state.store.all();
    state.loadError = null;
  }catch(err){
    console.error(err);
    state.loadError = (err && err.message) ? err.message : String(err);
  }
  render();   // siempre renderiza (con lo último que tenga) y muestra el error si hubo
}

// En dispositivos sin hover (touch) no bindeamos mouseenter/mouseleave: la
// preview de brush por hover es desktop-only. En touch el brush-bar muestra
// el rango y se actualiza por onCellClick → render.
const HAS_HOVER = window.matchMedia("(hover: hover)").matches;
function render(){
  renderNav();
  renderFamilySelect();
  renderGrid();
  updateHintBar();
  updateBrushBar();
  updatePreview();
}

// Contenido estático que no cambia: se arma una sola vez al iniciar.
function buildStatic(){
  document.getElementById("weekdays").innerHTML = WD.map(d => `<div>${d}</div>`).join("");
  document.getElementById("legend").innerHTML = CONFIG.families.map(f =>
    `<span class="chip"><span class="dot" style="background:${f.color}"></span>${f.name}</span>`
  ).join("");
  document.getElementById("fs-menu").innerHTML = CONFIG.families.map(fm => `
    <button type="button" class="fs-row" role="option" tabindex="-1" data-fam="${fm.id}" style="--c:${fm.color}">
      <span class="dot" style="background:${fm.color}"></span>${fm.name}
    </button>`).join("");
}

function renderNav(){
  const monthSel = document.getElementById("month");
  const yearSel = document.getElementById("year");
  if (!monthSel.options.length){
    MONTHS.forEach((m,i) => monthSel.add(new Option(m, i)));
    for (let y=CONFIG.yearMin; y<=CONFIG.yearMax; y++) yearSel.add(new Option(y, y));
  }
  monthSel.value = state.view.m;
  yearSel.value = state.view.y;
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
  const { y, m } = state.view;
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const lead = (first.getDay() - CONFIG.weekStart + 7) % 7;
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;

  const n = new Date();
  const todayStr = isoOf(n.getFullYear(), n.getMonth(), n.getDate());

  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  for (let i=0; i<totalCells; i++){
    const dayNum = i - lead + 1;
    const cell = document.createElement("div");
    if (dayNum < 1 || dayNum > daysInMonth){
      cell.className = "cell blank";
      grid.appendChild(cell);
      continue;
    }
    const dateStr = isoOf(y, m, dayNum);
    const blocked = state.admin ? false : (dateStr < state.firstBookable);
    cell.className = "cell" + (dateStr === todayStr ? " today" : "") + (blocked ? " blocked" : "");
    cell.dataset.date = dateStr;
    if (blocked) cell.title = "No disponible (margen Airbnb)";

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = dayNum;
    cell.appendChild(num);

    const dayRes = state.reservations
      .filter(r => r.start_date <= dateStr && r.end_date >= dateStr)
      .sort((a,b) => famIdx(a.family_id) - famIdx(b.family_id));

    const segs = document.createElement("div");
    segs.className = "segments";
    dayRes.slice(0, CONFIG.maxLanes).forEach(r => {
      const f = fam(r.family_id) || { name:"?", color:"#888" };
      const isStart = r.start_date === dateStr;
      const isEnd = r.end_date === dateStr;
      const cls = ["seg", isStart && "start", isEnd && "end",
                   (isStart && isEnd) && "pill"].filter(Boolean).join(" ");
      const seg = document.createElement("div");
      seg.className = cls;
      seg.style.background = f.color;
      seg.textContent = (isStart || isEnd) ? f.name : "";
      seg.dataset.id = r.id;
      seg.title = `${f.name} · ${r.start_date} → ${r.end_date}${r.note ? " · " + r.note : ""}`;
      seg.addEventListener("click", e => { e.stopPropagation(); openPopover(r, seg); });
      segs.appendChild(seg);
    });
    if (dayRes.length > CONFIG.maxLanes){
      const more = document.createElement("div");
      more.className = "seg pill";
      more.style.background = "rgba(255,255,255,.25)";
      more.textContent = `+${dayRes.length - CONFIG.maxLanes}`;
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
  const b = state.brush;
  if (state.admin){
    const i = b.families.indexOf(id);
    if (i >= 0) b.families.splice(i,1); else b.families.push(id);   // acumula (multi)
  } else {
    b.families = (b.families[0] === id) ? [] : [id];                // single (toggle)
  }
  b.start = b.end = b.hover = null;
  if (!state.admin) toggleMenu(false);   // admin: deja abierto para elegir más
  render();
}

function onCellClick(dateStr){
  const b = state.brush;
  if (!b.families.length) return;
  if (!state.admin && dateStr < state.firstBookable) return;   // admin reserva en cualquier fecha
  if (!b.start || dateStr < b.start){ b.start = dateStr; b.end = dateStr; }  // LLEGADA
  else { b.end = dateStr; }                                                   // SALIDA
  b.hover = null;
  render();
}

function updatePreview(){
  const b = state.brush, root = document.getElementById("grid");
  root.style.setProperty("--brush", brushColor());
  const cells = root.querySelectorAll(".cell[data-date]");
  if (!b.start){
    cells.forEach(c => c.classList.remove("in-range","range-start","range-end","single"));
    return;
  }
  const end = (b.hover && b.hover >= b.start) ? b.hover : b.end;
  const single = b.start === end;
  cells.forEach(c => {
    const d = c.dataset.date;
    c.classList.toggle("range-start", d === b.start && !single);
    c.classList.toggle("range-end", d === end && !single);
    c.classList.toggle("single", d === b.start && single);
    c.classList.toggle("in-range", d > b.start && d < end);
  });
}

function updateHintBar(){
  const el = document.getElementById("hint-bar"), b = state.brush;
  let txt;
  if (state.loadError) txt = "⚠️ No se pudieron cargar las reservas: " + state.loadError;
  else if (!b.families.length) txt = "👆 Elige una familia arriba para empezar a reservar";
  else if (!b.start) txt = "Toca el día de LLEGADA";
  else if (b.start === b.end) txt = "Toca el día de SALIDA, o confirma para 1 día";
  else txt = `Llegada ${pretty(b.start)} → Salida ${pretty(b.end)} · toca Confirmar`;
  el.textContent = txt;
  el.classList.toggle("active", b.families.length > 0 && !state.loadError);
}

function updateBrushBar(){
  const bar = document.getElementById("brush-bar"), b = state.brush;
  if (!b.start){ bar.classList.remove("show"); return; }
  bar.classList.add("show");
  const range = b.start === b.end
    ? `Llegada ${pretty(b.start)}`
    : `Llegada ${pretty(b.start)} → Salida ${pretty(b.end)}`;
  const n = daysBetween(b.start, b.end);
  bar.querySelector(".bb-fam").textContent = b.families.length === 1
    ? (fam(b.families[0])?.name || "")
    : (b.families.length + " familias");
  bar.querySelector(".bb-range").textContent = `${range} · ${n} ${n===1?"día":"días"}`;
  bar.querySelector(".bb-confirm").style.background = brushColor();
}

async function confirmBrush(){
  const b = state.brush;
  if (!b.start || !b.families.length) return;
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
    } else {                              // el cambio fue una BAJA → reinsertar
      await state.store.add(entry.recs);
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
    state.brush.families = state.brush.families.slice(0,1);   // vuelve a selección simple
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
}

// ---------- Modal nueva reserva (secundario) -------------------------
function openModal({ start, end }){
  const modal = document.getElementById("modal");
  const startEl = document.getElementById("start");
  const endEl = document.getElementById("end");
  const minD = state.admin ? `${CONFIG.yearMin}-01-01` : state.firstBookable;
  startEl.min = minD; startEl.max = MAX_DATE;
  endEl.min = minD;   endEl.max = MAX_DATE;
  startEl.value = start; endEl.value = end;
  document.getElementById("note").value = "";
  document.getElementById("hint").textContent = "";

  const fc = document.getElementById("fam-checks");
  fc.innerHTML = CONFIG.families.map(f => `
    <label class="fam-opt">
      <input type="checkbox" value="${f.id}">
      <span class="swatch" style="background:${f.color}"></span>
      <span class="nm">${f.name}</span>
    </label>`).join("");

  modal.hidden = false;
}

function closeModal(){ document.getElementById("modal").hidden = true; }

async function saveReservation(){
  const ids = [...document.querySelectorAll("#fam-checks input:checked")].map(c => c.value);
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  const note = document.getElementById("note").value.trim();
  const hint = document.getElementById("hint");

  if (!ids.length){ hint.textContent = "Selecciona al menos una familia."; return; }
  if (!start || !end){ hint.textContent = "Faltan fechas."; return; }
  if (end < start){ hint.textContent = "La fecha 'Hasta' no puede ser anterior a 'Desde'."; return; }
  if (!state.admin && start < state.firstBookable){ hint.textContent = "Esa fecha está dentro del margen no disponible."; return; }
  if (end > MAX_DATE){ hint.textContent = `La fecha no puede ser posterior a ${MAX_DATE}.`; return; }

  const recs = ids.map(family_id => ({
    id: uuid(), family_id, start_date: start, end_date: end, note
  }));
  try{
    await state.store.add(recs);
    pushUndo({ op:"remove", recs });
    closeModal();
    await load();
  }catch(err){
    hint.textContent = "Error al guardar: " + err.message;
  }
}

// ---------- Popover eliminar ----------
function openPopover(r, anchor){
  const pop = document.getElementById("pop");
  const f = fam(r.family_id) || { name:"?", color:"#888" };
  pop.innerHTML = `
    <div class="ptitle"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${f.color};margin-right:6px"></span>${f.name}</div>
    <div class="prow"><span>Llegada</span><b>${r.start_date}</b></div>
    <div class="prow"><span>Salida</span><b>${r.end_date}</b></div>
    ${r.note ? `<div class="prow"><span>Nota</span><b>${escapeHtml(r.note)}</b></div>` : ""}
    <button class="pdel">Eliminar reserva</button>`;
  pop.hidden = false;
  positionPopover(pop, anchor);
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
  const pw = 240;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (top + 180 > window.innerHeight - 8) top = r.top - 186;
  pop.style.left = Math.max(8, left) + "px";
  pop.style.top = Math.max(8, top) + "px";
}

function escapeHtml(s){ return s.replace(/[&<>"']/g, c =>
  ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

// ---------- Navegación ----------
function move(delta){                       // delta en meses
  let { y, m } = state.view;
  m += delta;
  while (m < 0){ m += 12; y--; }
  while (m > 11){ m -= 12; y++; }
  // clampear al mes-límite correcto (no solo el año)
  if (y < CONFIG.yearMin) state.view = { y: CONFIG.yearMin, m: 0 };
  else if (y > CONFIG.yearMax) state.view = { y: CONFIG.yearMax, m: 11 };
  else state.view = { y, m };
  render();
}

// ---------- Eventos ----------
function bind(){
  document.getElementById("prev").addEventListener("click", () => move(-1));
  document.getElementById("next").addEventListener("click", () => move(1));
  document.getElementById("today").addEventListener("click", () => { state.view = today(); render(); });
  document.getElementById("add").addEventListener("click", () => {
    openModal({ start: state.firstBookable, end: state.firstBookable });
  });
  document.getElementById("month").addEventListener("change", e => { state.view.m = +e.target.value; render(); });
  document.getElementById("year").addEventListener("change", e => { state.view.y = +e.target.value; render(); });

  // desplegable de familia: clic, teclado y cierre al perder foco
  document.getElementById("fs-trigger").addEventListener("click", () => toggleMenu());
  document.getElementById("fs-menu").addEventListener("click", e => {
    const row = e.target.closest(".fs-row"); if (!row) return;
    selectFamily(row.dataset.fam);
  });

  document.getElementById("brush-confirm").addEventListener("click", confirmBrush);
  document.getElementById("undo").addEventListener("click", doUndo);
  document.getElementById("admin").addEventListener("click", toggleAdmin);
  document.getElementById("brush-cancel").addEventListener("click", cancelSelection);

  document.getElementById("cancel").addEventListener("click", closeModal);
  document.getElementById("save").addEventListener("click", saveReservation);
  document.getElementById("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });

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
}

// ---------- Lock screen con clave familiar ----------
function setupLock(){
  const FAMILY_KEY = "9014";
  const lock = document.getElementById("lock");
  const pins = Array.from(document.querySelectorAll("#lock-pins .lock-pin"));
  const err = document.getElementById("lock-err");
  if (!lock || pins.length !== 4) return;

  document.body.classList.add("locked");
  pins[0].focus();

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
(async function main(){
  try{
    state.firstBookable = firstBookableIso();
    document.title += "  ·  v" + VERSION;   // marca en la pestaña para detectar caché
    bind();
    buildStatic();
    await initStore();
    await load();
    updateUndoBtn();
    updateAdminUI();
    setupLock();
    // el desplegable parte CERRADO; se abre/toca con la flecha (toggle confiable)
  }catch(err){
    console.error("Init error:", err);
    state.loadError = (err && err.message) ? err.message : String(err);
    render();
  }
})();
