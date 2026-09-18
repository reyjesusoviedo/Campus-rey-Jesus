(async () => {
  const { sb, esc, fmtDate, toast, requireUser, renderShell, initials, whatsappMessage, copy } = Campus;
  const me = await requireUser();
  renderShell(me, "escritorio"); if (window.Shell && ["coordinator", "teacher"].includes(me.profile.role)) Shell.render(me, "escritorio", "Calendario");
  const role = me.profile.role, coord = role === "coordinator", staff = coord || role === "teacher";
  if (!staff) { location.replace("panel.html"); return; }
  const app = document.getElementById("app"), dialog = document.getElementById("dialog");
  document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
  function openDialog(title, html, onMount) { document.getElementById("dialog-title").textContent = title; document.getElementById("dialog-body").innerHTML = html; dialog.showModal(); onMount && onMount(dialog); }

  const PALETTE = ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#be185d", "#0e7490", "#4d7c0f", "#9f1239"];
  const WD = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"], WDS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const S = { groups: [], sessions: [], staffList: [], matCount: {}, week: startOfWeek(new Date()), view: "week", sel: null, q: "" };
  function startOfWeek(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const gcolor = g => g.color || PALETTE[Math.abs([...g.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % PALETTE.length];
  const tname = id => (S.staffList.find(p => p.id === id)?.full_name || S.names?.[id] || "");

  async function load() {
    if (staff) await sb.rpc("ensure_recurring_sessions", { p_days: 14 }).then(() => {}, () => {});
    if (coord) sb.rpc("cleanup_enrollments").then(() => {}, () => {});
    S.pendingQ = 0; if (staff) { const r = await sb.from("course_questions").select("id", { count: "exact", head: true }).is("answer", null); S.pendingQ = r.count || 0; }
    const from = S.view === "week" ? S.week : new Date(S.week.getFullYear(), S.week.getMonth(), 1), to = S.view === "week" ? addDays(S.week, 7) : new Date(S.week.getFullYear(), S.week.getMonth() + 1, 1);
    const [g, s, p] = await Promise.all([
      sb.from("groups").select("*, memberships(user_id, role)").order("name"),
      sb.from("sessions").select("id, group_id, title, starts_at, status, recording_url, auto_created, objectives").gte("starts_at", addDays(from, -1).toISOString()).lt("starts_at", addDays(to, 1).toISOString()).order("starts_at"),
      coord ? sb.from("profiles").select("id, full_name, role").in("role", ["teacher", "coordinator"]).order("full_name") : Promise.resolve({ data: [] })
    ]);
    if (g.error) { app.innerHTML = `<p class="notice">No se pudo cargar: ${esc(g.error.message)}</p>`; return; }
    S.groups = g.data || []; S.sessions = s.data || []; S.staffList = p.data || [];
    const tids = [...new Set(S.groups.map(x => x.teacher_id).filter(Boolean))].filter(id => !S.staffList.some(x => x.id === id));
    S.names = S.names || {}; if (tids.length) { const r = await sb.from("profiles").select("id, full_name").in("id", tids); (r.data || []).forEach(x => S.names[x.id] = x.full_name); }
    const sids = S.sessions.map(x => x.id); S.matCount = {};
    if (sids.length) { const m = await sb.from("materials").select("session_id").in("session_id", sids); (m.data || []).forEach(x => S.matCount[x.session_id] = (S.matCount[x.session_id] || 0) + 1); }
    render();
  }

  function render() {
    const first = me.profile.full_name.split(" ")[0];
    const wkEnd = addDays(S.week, 6);
    const label = S.view === "week" ? `Semana del ${S.week.getDate()} al ${wkEnd.getDate()} de ${wkEnd.toLocaleDateString("es-ES", { month: "long" })}` : S.week.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    const teaching = new Set(S.sessions.map(x => S.groups.find(g => g.id === x.group_id)?.teacher_id).filter(Boolean)).size;
    app.innerHTML = `
      <div class="esc-top"><div><h1>Hola, ${esc(first)}</h1><p>${label} · ${S.sessions.length} clases${coord ? ` · ${teaching} maestros dando clase` : ""}</p></div>
        <div class="r"><button class="button secondary small" id="b-group">+ Grupo</button><button class="button secondary small" id="b-session">+ Clase</button>${coord ? `<a class="button teal small" href="equipo.html">+ Invitar maestro</a>` : ""}</div></div>
      <div class="alerts" id="alerts">${alertsHtml()}</div>
      <div class="esc-grid ${coord ? "" : "no-teachers"}">
        <div class="esc-card"><h3>Grupos <span class="lk">${S.groups.length}</span></h3><div class="glist" id="glist">${S.groups.map(groupHtml).join("") || `<p class="meta">Aún no hay grupos.</p>`}</div></div>
        <div class="esc-card"><div class="calbar"><h3>${S.view === "week" ? "Esta semana" : "Mes"}</h3><div class="r"><button class="button secondary small" data-nav="-1">‹</button><button class="button secondary small" data-nav="0">Hoy</button><button class="button secondary small" data-nav="1">›</button><button class="button secondary small" id="b-view">${S.view === "week" ? "Mes" : "Semana"}</button></div></div>${S.view === "week" ? weekHtml() : monthHtml()}</div>
        ${coord ? `<div class="esc-card"><h3>Maestros <span class="lk">${S.staffList.length}</span></h3><div class="tlist" id="tlist">${S.staffList.map(teacherHtml).join("")}</div><p class="meta" style="margin:8px 0 0;font-size:11px">Arrastra un maestro sobre un grupo para asignarlo, o pulsa el grupo → Asignar.</p></div>` : ""}
      </div>
      <details class="students"><summary>Alumnos <span class="tag closed" id="st-count"></span><input type="search" id="st-q" placeholder="Buscar alumno…"></summary><div id="st-body"><p class="meta">Cargando…</p></div></details>`;
    bind();
  }

  function alertsHtml() {
    const out = [];
    S.groups.filter(g => !g.teacher_id).forEach(g => out.push(`<span class="alert">⚠ <b>${esc(g.name)}</b> no tiene maestro <button data-assign="${g.id}">Asignar →</button></span>`));
    if (S.pendingQ) out.push(`<span class="alert info">🙋 <b>${S.pendingQ}</b> pregunta${S.pendingQ === 1 ? "" : "s"} de cursos libres sin responder <a href="equipo.html">Responder →</a></span>`);
    S.sessions.filter(x => x.status === "scheduled" && new Date(x.starts_at) > Date.now() && new Date(x.starts_at) < Date.now() + 3 * 86400e3 && !S.matCount[x.id]).forEach(x => out.push(`<span class="alert warn">📄 ${esc(WDS[new Date(x.starts_at).getDay()])} · <b>${esc(x.title)}</b> sin material <a href="preparar.html?id=${x.id}">Preparar →</a></span>`));
    return out.join("");
  }
  function groupHtml(g) {
    const st = g.memberships.filter(m => m.role === "student").length, gu = g.memberships.filter(m => m.role === "guest").length;
    return `<div class="g ${S.sel === g.id ? "sel" : ""}" data-g="${g.id}" style="--gc:${gcolor(g)}"><i></i><div><b>${esc(g.name)}</b><small class="${g.teacher_id ? "" : "bad"}">${g.teacher_id ? esc(tname(g.teacher_id)) : "Sin maestro"}${g.schedule_text ? " · " + esc(g.schedule_text) : ""}</small><small>${st} alumnos${gu ? ` · ${gu} invitados` : ""}</small></div></div>`;
  }
  function teacherHtml(p) {
    const gs = S.groups.filter(g => g.teacher_id === p.id);
    const next = S.sessions.filter(x => gs.some(g => g.id === x.group_id) && new Date(x.starts_at) > Date.now() - 3600e3).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
    return `<div class="t" draggable="true" data-t="${p.id}"><span class="avatar teal">${esc(initials(p.full_name))}</span><div class="nm"><b>${esc(p.full_name)}</b><small>${p.role === "coordinator" ? "Coordinación" : next ? "Próxima: " + fmtDate(next.starts_at, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : gs.length ? "Sin clases próximas" : "Sin grupo"}</small></div>${gs.length ? `<span class="dots">${gs.map(g => `<i style="background:${gcolor(g)}" title="${esc(g.name)}"></i>`).join("")}</span>` : p.role === "coordinator" ? `<span class="tag" style="background:#faf0d6;color:#7a5c14">Coord.</span>` : `<span class="tag">Disponible</span>`}</div>`;
  }
  function evHtml(x) {
    const g = S.groups.find(y => y.id === x.group_id) || {}; const d = new Date(x.starts_at); const live = x.status === "live"; const prepared = !!S.matCount[x.id];
    return `<div class="ev ${live ? "live" : ""} ${x.status === "closed" ? "closed" : ""} ${g.teacher_id ? "" : "nomaestro"} ${S.sel && S.sel !== g.id ? "dim" : ""}" draggable="${x.status === "scheduled"}" data-ev="${x.id}" style="--gc:${gcolor(g)}">${prepared ? `<span class="ic" title="Material preparado">📄</span>` : ""}${live ? `<span class="ic">●</span>` : ""}<b>${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · ${esc(x.title)}</b><small>${esc(g.name || "")}${g.teacher_id ? " · " + esc(tname(g.teacher_id).split(" ")[0]) : ""}</small>${g.teacher_id ? "" : `<small class="bad">Sin maestro</small>`}${x.status === "closed" ? `<small>${x.recording_url ? "Grabada" : "Terminada"}</small>` : live ? `<small style="color:var(--teal-dark);font-weight:800">En directo</small>` : x.auto_created ? `<small>Creada automáticamente</small>` : prepared ? `<small>Preparada</small>` : `<small>Sin material</small>`}</div>`;
  }
  function weekHtml() {
    const today = new Date();
    const heads = [], days = [];
    for (let i = 0; i < 7; i++) { const d = addDays(S.week, i); const evs = S.sessions.filter(x => sameDay(new Date(x.starts_at), d)); heads.push(`<div class="dh ${sameDay(d, today) ? "today" : ""} ${evs.length ? "" : "empty"}">${WDS[d.getDay()]}<b>${d.getDate()}</b></div>`); days.push(`<div class="day" data-day="${d.toISOString()}">${evs.map(evHtml).join("")}</div>`); }
    return `<div class="cal">${heads.join("")}${days.join("")}</div>`;
  }
  function monthHtml() {
    const y = S.week.getFullYear(), m = S.week.getMonth(), first = new Date(y, m, 1), start = startOfWeek(first), today = new Date(); const cells = [];
    for (let i = 0; i < 42; i++) { const d = addDays(start, i); if (i >= 35 && d.getMonth() !== m) break; const evs = S.sessions.filter(x => sameDay(new Date(x.starts_at), d)); cells.push(`<div class="mday ${d.getMonth() !== m ? "out" : ""}" data-day="${d.toISOString()}"><b style="${sameDay(d, today) ? "color:var(--teal-dark)" : ""}">${d.getDate()}</b>${evs.map(x => { const g = S.groups.find(q => q.id === x.group_id) || {}; return `<div class="mev ${S.sel && S.sel !== g.id ? "dim" : ""}" data-ev="${x.id}" style="--gc:${gcolor(g)}" title="${esc(x.title)}">${new Date(x.starts_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} ${esc(x.title)}</div>`; }).join("")}</div>`); }
    return `<div class="month">${WDS.slice(1).concat(WDS[0]).map(w => `<div class="dh">${w}</div>`).join("")}${cells.join("")}</div>`;
  }

  function bind() {
    app.querySelector("#b-group").addEventListener("click", newGroupDialog);
    app.querySelector("#b-session").addEventListener("click", () => Shell.quickClassDialog(me));
    app.querySelector("#b-view").addEventListener("click", () => { S.view = S.view === "week" ? "month" : "week"; load(); });
    app.querySelectorAll("[data-nav]").forEach(b => b.addEventListener("click", () => { const n = Number(b.dataset.nav); if (n === 0) S.week = startOfWeek(new Date()); else if (S.view === "week") S.week = addDays(S.week, 7 * n); else S.week = startOfWeek(new Date(S.week.getFullYear(), S.week.getMonth() + n, 1)); load(); }));
    app.querySelectorAll("[data-assign]").forEach(b => b.addEventListener("click", () => assignDialog(S.groups.find(g => g.id === b.dataset.assign))));
    app.querySelectorAll("[data-g]").forEach(el => {
      el.addEventListener("click", () => { S.sel = S.sel === el.dataset.g ? null : el.dataset.g; render(); if (S.sel) groupDialog(S.groups.find(g => g.id === S.sel)); });
      el.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("text/teacher")) { e.preventDefault(); el.classList.add("over"); } });
      el.addEventListener("dragleave", () => el.classList.remove("over"));
      el.addEventListener("drop", async e => { e.preventDefault(); el.classList.remove("over"); const tid = e.dataTransfer.getData("text/teacher"); if (tid) await assignTeacher(S.groups.find(g => g.id === el.dataset.g), tid); });
    });
    app.querySelectorAll("[data-t]").forEach(el => el.addEventListener("dragstart", e => { e.dataTransfer.setData("text/teacher", el.dataset.t); }));
    app.querySelectorAll("[data-ev]").forEach(el => {
      el.addEventListener("click", () => sessionDialog(S.sessions.find(x => x.id === el.dataset.ev)));
      el.addEventListener("dragstart", e => { e.dataTransfer.setData("text/session", el.dataset.ev); });
    });
    app.querySelectorAll("[data-day]").forEach(el => {
      el.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("text/session")) { e.preventDefault(); el.classList.add("over"); } });
      el.addEventListener("dragleave", () => el.classList.remove("over"));
      el.addEventListener("drop", async e => { e.preventDefault(); el.classList.remove("over"); const sid = e.dataTransfer.getData("text/session"); const x = S.sessions.find(y => y.id === sid); if (!x) return; const d = new Date(el.dataset.day), old = new Date(x.starts_at); d.setHours(old.getHours(), old.getMinutes(), 0, 0); const { error } = await sb.from("sessions").update({ starts_at: d.toISOString() }).eq("id", sid); if (error) toast("No se pudo mover: " + error.message); else toast("Clase movida al " + fmtDate(d)); load(); });
    });
    const det = app.querySelector("details.students"); det.addEventListener("toggle", () => { if (det.open) loadStudents(); });
    app.querySelector("#st-q").addEventListener("input", e => { S.q = e.target.value; renderStudents(); });
    app.querySelector("#st-q").addEventListener("click", e => e.stopPropagation());
  }

  // ---------- diálogos ----------
  function groupDialog(g) {
    const st = g.memberships.filter(m => m.role === "student").length, gu = g.memberships.filter(m => m.role === "guest").length;
    const next = S.sessions.filter(x => x.group_id === g.id && new Date(x.starts_at) > Date.now() - 3600e3)[0];
    openDialog(g.name, `<p class="subtle" style="margin-top:0">${g.teacher_id ? esc(tname(g.teacher_id)) : `<span style="color:#a1343e;font-weight:800">Sin maestro</span>`} · ${esc(g.schedule_text || "sin horario")} · ${st} alumnos${gu ? ` · ${gu} invitados` : ""}${g.recurrence?.mode && g.recurrence.mode !== "none" ? ` · 🔁 ${WD[g.recurrence.weekday]} ${g.recurrence.time}` : ""}</p>
      ${next ? `<p><strong>Próxima clase:</strong> ${esc(next.title)} · ${fmtDate(next.starts_at)}</p>` : `<p class="meta">Sin clases próximas.</p>`}
      <div class="live-controls" style="flex-wrap:wrap">
        ${next ? `<a class="button teal small" href="preparar.html?id=${next.id}">Preparar</a><a class="button small" href="sesion.html?id=${next.id}">Entrar</a>` : ""}
        <button class="button secondary small" data-do="session">+ Clase</button>
        ${coord ? `<button class="button secondary small" data-do="assign">${g.teacher_id ? "Cambiar maestro" : "Asignar maestro"}</button>` : ""}
        <button class="button secondary small" data-do="color">Color</button>
        <a class="button secondary small" href="panel.html?lista=1">Alumnos, invitar, recurrencia…</a>
      </div>`, d => {
      d.querySelector('[data-do="session"]').addEventListener("click", () => { dialog.close(); Shell.quickClassDialog(me, g.id); });
      d.querySelector('[data-do="assign"]')?.addEventListener("click", () => { dialog.close(); assignDialog(g); });
      d.querySelector('[data-do="color"]').addEventListener("click", () => { dialog.close(); openDialog("Color de " + g.name, `<div style="display:flex;gap:8px;flex-wrap:wrap">${PALETTE.map(c => `<button class="bc" data-c="${c}" style="background:${c};width:34px;height:34px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px var(--line)"></button>`).join("")}</div>`, dd => dd.querySelectorAll("[data-c]").forEach(b => b.addEventListener("click", async () => { await sb.from("groups").update({ color: b.dataset.c }).eq("id", g.id); dialog.close(); load(); }))); });
    });
  }
  function sessionDialog(x) {
    const g = S.groups.find(y => y.id === x.group_id) || {};
    openDialog(x.title, `<p class="subtle" style="margin-top:0">${esc(g.name)} · ${fmtDate(x.starts_at)} · ${x.status === "live" ? "en directo" : x.status === "closed" ? "terminada" : "programada"}${S.matCount[x.id] ? ` · ${S.matCount[x.id]} materiales` : " · sin material"}</p>
      <div class="live-controls" style="flex-wrap:wrap">${x.status !== "closed" ? `<a class="button teal small" href="preparar.html?id=${x.id}">Preparar</a>` : ""}<a class="button small" href="sesion.html?id=${x.id}">${x.status === "closed" ? "Ver" : "Entrar"}</a>${x.status === "scheduled" ? `<button class="button secondary small" data-do="when">Cambiar fecha</button>` : ""}<button class="button secondary small" data-do="del">Borrar</button></div>`, d => {
      d.querySelector('[data-do="when"]')?.addEventListener("click", () => { const local = new Date(new Date(x.starts_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); dialog.close(); openDialog("Cambiar fecha", `<div class="inline-form"><input type="datetime-local" id="w" value="${local}"><button class="button" id="w-go">Guardar</button></div>`, dd => dd.querySelector("#w-go").addEventListener("click", async () => { await sb.from("sessions").update({ starts_at: new Date(dd.querySelector("#w").value).toISOString() }).eq("id", x.id); dialog.close(); load(); })); });
      d.querySelector('[data-do="del"]').addEventListener("click", async () => { if (!confirm(`¿Borrar «${x.title}»?`)) return; const { error } = await sb.from("sessions").delete().eq("id", x.id); if (error) toast(error.message); dialog.close(); load(); });
    });
  }
  function assignDialog(g) {
    const list = S.staffList.filter(p => p.role !== "coordinator" || true);
    openDialog("Maestro de " + g.name, `<ul class="members">${list.map(p => `<li><span class="avatar teal" style="width:30px;height:30px;font-size:11px">${esc(initials(p.full_name))}</span><span style="flex:1">${esc(p.full_name)}<br><small class="meta">${S.groups.filter(x => x.teacher_id === p.id).map(x => x.name).join(", ") || (p.role === "coordinator" ? "Coordinación" : "Sin grupo")}</small></span><button class="button ${g.teacher_id === p.id ? "" : "secondary"} small" data-pick="${p.id}">${g.teacher_id === p.id ? "Actual" : "Asignar"}</button></li>`).join("")}</ul>${g.teacher_id ? `<div class="live-controls"><button class="button secondary small" id="unassign">Dejar sin maestro</button></div>` : ""}`, d => {
      d.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => assignTeacher(g, b.dataset.pick)));
      d.querySelector("#unassign")?.addEventListener("click", async () => { await sb.from("groups").update({ teacher_id: null }).eq("id", g.id); dialog.close(); toast("Grupo sin maestro"); load(); });
    });
  }
  async function assignTeacher(g, tid) {
    const { error } = await sb.from("groups").update({ teacher_id: tid }).eq("id", g.id);
    if (error) { toast("No se pudo asignar: " + error.message); return; }
    if (g.teacher_id && g.teacher_id !== tid) await sb.from("memberships").delete().match({ group_id: g.id, user_id: g.teacher_id, role: "teacher" });
    await sb.from("memberships").upsert({ group_id: g.id, user_id: tid, role: "teacher" }, { onConflict: "group_id,user_id" });
    dialog.open && dialog.close(); toast(`${tname(tid).split(" ")[0]} asignado a ${g.name}`); load();
  }
  async function newGroupDialog() {
    const teachers = coord ? S.staffList : [{ id: me.user.id, full_name: me.profile.full_name }];
    const { data: regs } = await sb.rpc("registered_students");
    openDialog("Nuevo grupo", `<div class="inline-form">
      <div class="field"><label for="g-name">Nombre</label><input id="g-name" placeholder="Nuevos creyentes · martes"></div>
      <div class="field"><label for="g-teacher">Maestro/a</label><select id="g-teacher"><option value="">Sin maestro por ahora</option>${teachers.map(t => `<option value="${t.id}" ${t.id === me.user.id ? "selected" : ""}>${esc(t.full_name)}</option>`).join("")}</select></div>
      <div class="row"><div class="field"><label for="g-sched">Horario</label><input id="g-sched" placeholder="Martes 20:00"></div><div class="field"><label for="g-video">Vídeo</label><select id="g-video"><option value="jitsi">Dentro del campus</option><option value="external">Meet/Zoom aparte</option></select></div></div>
      <div class="field" id="g-zoom-f" hidden><label for="g-zoom">Enlace de Meet/Zoom</label><input id="g-zoom" placeholder="https://meet.google.com/…"></div>
      <div class="field"><label>Alumnos ya registrados (marca los que entran en este grupo)</label>${(regs || []).length ? `<input type="search" id="g-q" placeholder="Buscar…" style="margin-bottom:6px"><div id="g-students" style="max-height:180px;overflow:auto;display:grid;gap:4px">${regs.map(r => `<label class="g-st" data-n="${esc((r.full_name + " " + (r.email || "")).toLowerCase())}" style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" value="${r.id}"> ${esc(r.full_name)}<small class="meta">${r.groups?.length ? " · " + esc(r.groups.join(", ")) : ""}</small></label>`).join("")}</div>` : `<p class="meta">Aún no hay alumnos registrados; después podrás invitarlos con el código del grupo.</p>`}</div>
      <div class="field"><label for="g-desc">Descripción (opcional)</label><textarea id="g-desc" rows="2"></textarea></div>
      <p class="form-error" id="g-error"></p><button class="button" id="g-go">Crear grupo</button></div>`, d => {
      d.querySelector("#g-q")?.addEventListener("input", e => { const q = e.target.value.toLowerCase(); d.querySelectorAll(".g-st").forEach(l => l.hidden = q && !l.dataset.n.includes(q)); });
      d.querySelector("#g-video").addEventListener("change", e => d.querySelector("#g-zoom-f").hidden = e.target.value !== "external");
      d.querySelector("#g-go").addEventListener("click", async () => {
        const name = d.querySelector("#g-name").value.trim(); if (!name) { d.querySelector("#g-error").textContent = "Ponle un nombre."; return; }
        const teacher_id = d.querySelector("#g-teacher").value || null;
        const { data: g, error } = await sb.from("groups").insert({ name, teacher_id, schedule_text: d.querySelector("#g-sched").value.trim() || null, zoom_url: d.querySelector("#g-zoom").value.trim() || null, description: d.querySelector("#g-desc").value.trim() || null, video_provider: d.querySelector("#g-video").value, color: PALETTE[S.groups.length % PALETTE.length] }).select().single();
        if (error) { d.querySelector("#g-error").textContent = error.message; return; }
        if (teacher_id) await sb.from("memberships").insert({ group_id: g.id, user_id: teacher_id, role: "teacher" });
        const picked = [...d.querySelectorAll("#g-students input:checked")].map(i => i.value);
        for (const uid of picked) await sb.rpc("add_student_to_group", { p_group: g.id, p_user: uid });
        dialog.close(); toast("Grupo creado" + (picked.length ? ` con ${picked.length} alumnos` : "")); load();
      });
    });
  }
  function newSessionDialog(g) {
    const d0 = new Date(); d0.setMinutes(0, 0, 0); d0.setHours(d0.getHours() + 1); const local = new Date(d0.getTime() - d0.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    openDialog("Nueva clase", `<div class="inline-form">
      <div class="field"><label for="s-g">Grupo</label><select id="s-g">${S.groups.map(x => `<option value="${x.id}" ${g && g.id === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="s-title">Título</label><input id="s-title" placeholder="Tema de la clase"></div>
      <div class="field"><label for="s-when">Fecha y hora</label><input id="s-when" type="datetime-local" value="${local}"></div>
      <p class="form-error" id="s-error"></p><button class="button" id="s-go">Crear y preparar</button></div>`, d => d.querySelector("#s-go").addEventListener("click", async () => {
      const gid = d.querySelector("#s-g").value, grp = S.groups.find(x => x.id === gid), title = d.querySelector("#s-title").value.trim(), when = d.querySelector("#s-when").value;
      if (!gid || !title || !when) { d.querySelector("#s-error").textContent = "Grupo, título y fecha."; return; }
      const { data: s, error } = await sb.from("sessions").insert({ group_id: gid, title, starts_at: new Date(when).toISOString(), zoom_url: grp?.zoom_url || null, created_by: me.user.id }).select().single();
      if (error) { d.querySelector("#s-error").textContent = error.message; return; }
      location.href = "preparar.html?id=" + s.id;
    }));
  }

  // ---------- alumnos ----------
  async function loadStudents() {
    if (S.students) { renderStudents(); return; }
    const ids = [...new Set(S.groups.flatMap(g => g.memberships.filter(m => m.role !== "teacher").map(m => m.user_id)))];
    const rows = {}; ids.forEach(id => rows[id] = { id, groups: [], guest: false, last: null });
    S.groups.forEach(g => g.memberships.forEach(m => { if (m.role === "teacher") return; rows[m.user_id].groups.push(g); if (m.role === "guest") rows[m.user_id].guest = true; }));
    if (ids.length) { const p = await sb.from("profiles").select("id, full_name").in("id", ids); (p.data || []).forEach(x => rows[x.id].name = x.full_name); }
    for (const g of S.groups) { const r = await sb.rpc("last_attendance", { p_group: g.id }); (r.data || []).forEach(x => { if (rows[x.user_id] && (!rows[x.user_id].last || new Date(x.last_at) > new Date(rows[x.user_id].last))) rows[x.user_id].last = x.last_at; }); }
    S.students = Object.values(rows).sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
    renderStudents();
  }
  function renderStudents() {
    if (!S.students) return;
    const q = S.q.toLowerCase(); const list = S.students.filter(s => !q || (s.name || "").toLowerCase().includes(q) || s.groups.some(g => g.name.toLowerCase().includes(q)));
    app.querySelector("#st-count").textContent = S.students.length;
    app.querySelector("#st-body").innerHTML = list.length ? `<table class="stable"><tr><th>Nombre</th><th>Grupos</th><th>Tipo</th><th>Última asistencia</th></tr>${list.slice(0, 200).map(s => `<tr><td>${esc(s.name || "—")}</td><td><span class="dots" style="display:inline-flex;vertical-align:middle;margin-right:6px">${s.groups.map(g => `<i style="background:${gcolor(g)}"></i>`).join("")}</span>${esc(s.groups.map(g => g.name).join(", "))}</td><td>${s.guest ? `<span class="tag" style="background:#faf0d6;color:#7a5c14">Invitado</span>` : `<span class="tag">Cuenta</span>`}</td><td>${s.last ? fmtDate(s.last, { day: "numeric", month: "short" }) : "—"}</td></tr>`).join("")}</table>` : `<p class="meta">Nadie con ese nombre.</p>`;
  }

  await load();
  document.getElementById("loading").hidden = true; app.hidden = false;
})();
