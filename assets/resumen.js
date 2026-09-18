(async () => {
  const { sb, esc, fmtDate, toast, requireUser, initials, whatsappMessage, settings } = Campus;
  const me = await requireUser();
  const role = me.profile.role, coord = role === "coordinator";
  if (!(coord || role === "teacher")) { location.replace("panel.html"); return; }
  Shell.render(me, "resumen", coord ? "Panel del coordinador" : "Panel del maestro");
  const app = document.getElementById("app"), dialog = document.getElementById("dialog");
  document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
  const st = settings() || {};
  const hour = new Date().getHours(), greet = hour < 13 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const I = { students: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M2.5 19c0-3.3 3-5.5 6.5-5.5s6.5 2.2 6.5 5.5M15 14.5c3 0 6 1.8 6 4.5"/></svg>', teachers: '<svg viewBox="0 0 24 24"><path d="M12 3 1 8l11 5 9-4.1V15h2V8L12 3Zm-6 9.3V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.7"/></svg>', courses: '<svg viewBox="0 0 24 24"><path d="M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/></svg>', groups: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2.2"/><circle cx="19" cy="10" r="2.2"/><path d="M6 20c0-3 2.7-5 6-5s6 2 6 5"/></svg>' };
  const KI = { student: "👤", course: "📘", teacher: "🎓", class: "✅", question: "💬" };
  const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`; const d = Math.round(h / 24); return d === 1 ? "ayer" : `hace ${d} días`; };

  const first = me.profile.full_name.split(" ")[0];
  if (!coord) { await renderTeacher(); return; }
  if (coord) sb.rpc("ensure_recurring_sessions", { p_days: 14 }).then(() => {}, () => {});
  const [stats, act, fol, next] = await Promise.all([
    sb.rpc("dashboard_stats"), sb.rpc("recent_activity", { p_limit: 6 }), sb.rpc("followup"),
    sb.from("sessions").select("id, title, starts_at, status, group:groups(name, teacher_id)").in("status", ["scheduled", "live"]).gte("starts_at", new Date(Date.now() - 3600e3).toISOString()).order("starts_at").limit(4)
  ]);
  if (stats.error) { app.innerHTML = `<p class="notice">Falta ejecutar el parche del panel en Supabase: ${esc(stats.error.message)}</p>`; document.getElementById("loading").hidden = true; app.hidden = false; return; }
  const S = stats.data || {}; const tids = [...new Set((next.data || []).map(x => x.group?.teacher_id).filter(Boolean))]; const names = {};
  if (tids.length) { const { data } = await sb.from("profiles").select("id, full_name").in("id", tids); (data || []).forEach(p => names[p.id] = p.full_name); }
  const fl = (fol.data || []).filter(x => x.status !== "ok").slice(0, 5);

  app.innerHTML = `
    <div class="hello"><div><h1>${greet}, <span>${esc(first)}</span></h1><p>Aquí tienes el estado del campus hoy.</p></div>
      <div class="new" style="display:flex;gap:8px"><button id="quick-btn" style="background:#22c37a;color:#063d2a">▶ Empezar clase</button><button id="new-btn">＋ Nuevo registro ⌄</button><div class="dd" id="new-dd" hidden>
        <a href="panel.html?lista=1">Alumno (código o enlace)</a>${coord ? `<a href="equipo.html">Maestro (invitación)</a><a href="ajustes.html#cursos">Curso</a>` : ""}<a href="escritorio.html">Grupo</a><a href="escritorio.html">Clase</a><a href="biblioteca.html">Material</a></div></div></div>
    <div class="rkpis">
      <a class="rkpi" href="seguimiento.html"><span class="ic">${I.students}</span><span class="kt"><span>Alumnos activos</span><b>${S.students_active ?? 0}</b>${S.students_new_month ? `<small>↑ +${S.students_new_month} este mes</small>` : ""}</span><span class="arr">›</span></a>
      <a class="rkpi" href="${coord ? "equipo.html" : "#"}"><span class="ic">${I.teachers}</span><span class="kt"><span>Maestros</span><b>${S.teachers ?? 0}</b></span><span class="arr">›</span></a>
      <a class="rkpi" href="${coord ? "ajustes.html#cursos" : "index.html#cursos"}"><span class="ic g">${I.courses}</span><span class="kt"><span>Cursos activos</span><b>${S.courses ?? 0}</b></span><span class="arr">›</span></a>
      <a class="rkpi" href="panel.html?lista=1"><span class="ic g">${I.groups}</span><span class="kt"><span>Grupos</span><b>${S.groups ?? 0}</b></span><span class="arr">›</span></a>
    </div>
    <div class="rgrid">
      <div class="rcard"><h3>🕒 Actividad reciente <a class="lk" href="seguimiento.html">Ver seguimiento →</a></h3>
        ${(act.data || []).length ? act.data.map(a => `<a class="act" href="${esc(a.href || "#")}"><span class="ic ${["course", "class", "question"].includes(a.kind) ? "g" : ""}">${KI[a.kind] || "•"}</span><span><b>${esc(a.title)}</b><small>${esc(a.detail || "")} · ${ago(a.at)}</small></span></a>`).join("") : `<p class="meta">Todavía no hay actividad.</p>`}</div>
      <div class="rcard"><h3>⚡ Accesos rápidos</h3><div class="quick">
        <a href="panel.html?lista=1"><span class="ic">👤</span>Añadir alumno<span class="arr">›</span></a>
        ${coord ? `<a href="ajustes.html#cursos"><span class="ic g">📘</span>Crear curso<span class="arr">›</span></a>` : `<a href="biblioteca.html"><span class="ic g">📚</span>Biblioteca<span class="arr">›</span></a>`}
        <a href="escritorio.html"><span class="ic g">👥</span>Nuevo grupo<span class="arr">›</span></a>
        ${coord ? `<a href="escritorio.html"><span class="ic">🎓</span>Asignar maestro<span class="arr">›</span></a>` : `<a href="escritorio.html"><span class="ic">🗓</span>Nueva clase<span class="arr">›</span></a>`}
        <button id="msg-soon"><span class="ic g">✉️</span>Enviar mensaje <small class="meta">· próx.</small><span class="arr">›</span></button>
        <a href="${(next.data || [])[0] ? "preparar.html?id=" + next.data[0].id : "escritorio.html"}"><span class="ic">🧰</span>Preparar clase de hoy<span class="arr">›</span></a></div></div>
      <div class="rcard"><h3>👥 Seguimiento prioritario <a class="lk" href="seguimiento.html">Ver seguimiento →</a></h3>
        ${fl.length ? `<div class="ftable-wrap"><table class="ftable"><tr><th>Alumno</th><th>Grupo / curso</th><th>Progreso</th><th>Estado</th><th></th></tr>${fl.map(r => `<tr><td><span class="avatar">${esc(initials(r.full_name))}</span>${esc(r.full_name)}</td><td>${esc(r.context)}</td><td>${r.progress != null ? `${r.progress}%<span class="pbar"><i style="width:${r.progress}%"></i></span>` : "—"}</td><td><span class="st ${r.status}">${r.status === "risk" ? "! En riesgo" : "⚠ Revisar"}</span><br><small class="meta">${esc(r.reason)}</small></td><td>${r.phone ? `<a href="${whatsappMessage(`Hola ${r.full_name.split(" ")[0]}, soy ${first} del campus. `)}" target="_blank" rel="noopener" title="WhatsApp">💬</a>` : ""}</td></tr>`).join("")}</table></div>` : `<p class="meta">Nadie necesita atención ahora mismo. 🙌</p>`}</div>
      <div class="rcard"><h3>🗓 Próximas clases <a class="lk" href="escritorio.html">Ver calendario →</a></h3>
        ${(next.data || []).length ? next.data.map(x => `<a class="next" href="sesion.html?id=${x.id}"><span class="h">${x.status === "live" ? "Ahora" : new Date(x.starts_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span><span><b>${esc(x.title)}</b><small>${x.group?.teacher_id ? esc(names[x.group.teacher_id] || "") + " · " : ""}${esc(x.group?.name || "")} · ${fmtDate(x.starts_at, { weekday: "short", day: "numeric", month: "short" })}</small></span></a>`).join("") : `<p class="meta">Sin clases próximas.</p>`}</div>
    </div>
    <div class="rfoot">👥 Una comunidad global para un mundo real.<div class="v"><span>🌐 Aprender</span><span>👥 Conectar</span><span>🤍 Servir</span><span>📈 Multiplicar</span></div><span style="font-style:italic;color:#0c70bb">${esc(st.footer_tag || "")}</span></div>`;
  const dd = document.getElementById("new-dd"); document.getElementById("new-btn").addEventListener("click", () => dd.hidden = !dd.hidden);
  document.getElementById("quick-btn").addEventListener("click", () => Shell.quickClassDialog(me)); document.addEventListener("click", e => { if (!e.target.closest(".new")) dd.hidden = true; });
  document.getElementById("msg-soon").addEventListener("click", () => toast("Enviar mensaje: próximamente"));
  document.getElementById("loading").hidden = true; app.hidden = false;

  async function renderTeacher() {
    sb.rpc("ensure_recurring_sessions", { p_days: 14 }).then(() => {}, () => {});
    const from = new Date(); from.setHours(0, 0, 0, 0); const dow = (from.getDay() + 6) % 7; const wk0 = new Date(from); wk0.setDate(from.getDate() - dow); const wk1 = new Date(wk0); wk1.setDate(wk0.getDate() + 7);
    const [g, sw, fol, mats, lib] = await Promise.all([
      sb.from("groups").select("id, name, color, schedule_text, teacher_id, memberships(user_id, role)").order("name"),
      sb.from("sessions").select("id, title, starts_at, status, group_id").gte("starts_at", wk0.toISOString()).lt("starts_at", wk1.toISOString()).order("starts_at"),
      sb.rpc("followup"), sb.rpc("recent_materials", { p_limit: 3 }), sb.from("library_items").select("id", { count: "exact", head: true })
    ]);
    const groups = (g.data || []).filter(x => x.teacher_id === me.user.id || x.memberships.some(m => m.user_id === me.user.id && m.role === "teacher"));
    const gid = new Set(groups.map(x => x.id)); const week = (sw.data || []).filter(x => gid.has(x.group_id));
    const today = week.filter(x => new Date(x.starts_at).toDateString() === new Date().toDateString() || x.status === "live");
    const students = new Set(groups.flatMap(x => x.memberships.filter(m => m.role !== "teacher").map(m => m.user_id))).size;
    const fl = (fol.data || []).filter(x => x.status !== "ok").slice(0, 4);
    const nextOf = id => (sw.data || []).find(x => x.group_id === id && new Date(x.starts_at) > Date.now() - 3600e3);
    const gcolor = x => x.color || "#0c70bb";
    const days = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
    app.innerHTML = `
      <div class="hello"><div><h1>${greet}, <span>${esc(first)}</span></h1><p>Organiza tus clases y acompaña a tus alumnos.</p></div>
        <div class="new" style="display:flex;gap:8px"><button id="quick-btn" style="background:#22c37a;color:#063d2a;border:0;border-radius:12px;padding:12px 20px;font:inherit;font-weight:800;cursor:pointer;box-shadow:0 10px 24px rgba(34,195,122,.35)">▶ Empezar clase</button><a href="escritorio.html" style="display:inline-block;background:#0c70bb;color:#fff;border-radius:12px;padding:12px 20px;font-weight:800;text-decoration:none">Programar</a></div></div>
      <div class="rkpis">
        <a class="rkpi" href="panel.html?lista=1"><span class="ic">${I.groups}</span><span class="kt"><span>Grupos a cargo</span><b>${groups.length}</b></span><span class="arr">›</span></a>
        <a class="rkpi" href="seguimiento.html"><span class="ic">${I.students}</span><span class="kt"><span>Alumnos</span><b>${students}</b></span><span class="arr">›</span></a>
        <a class="rkpi" href="escritorio.html"><span class="ic g">🗓</span><span class="kt"><span>Clases esta semana</span><b>${week.length}</b></span><span class="arr">›</span></a>
        <a class="rkpi" href="biblioteca.html"><span class="ic g">📚</span><span class="kt"><span>Materiales</span><b>${lib.count ?? 0}</b></span><span class="arr">›</span></a>
      </div>
      <div class="rgrid">
        <div class="rcard"><h3>🕒 Clases de hoy <a class="lk" href="escritorio.html">Ver todo el horario →</a></h3>
          ${today.length ? today.map(x => { const grp = groups.find(y => y.id === x.group_id) || {}; return `<div class="next"><span class="h">${x.status === "live" ? "Ahora" : new Date(x.starts_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span><span style="flex:1"><b>${esc(x.title)}</b><small>${esc(grp.name || "")} · Aula online</small></span><a class="button small ${x.status === "live" ? "gold" : ""}" href="${x.status === "scheduled" ? "preparar.html?id=" + x.id : "sesion.html?id=" + x.id}">${x.status === "live" ? "Entrar" : "Abrir clase"}</a></div>`; }).join("") : `<p class="meta">Hoy no tienes clases. <a href="escritorio.html">Ver la semana</a></p>`}</div>
        <div class="rcard"><h3>⚡ Accesos rápidos</h3><div class="quick">
          <button id="quick-btn2"><span class="ic">▶</span>Empezar clase<span class="arr">›</span></button>
          <a href="biblioteca.html"><span class="ic g">☁️</span>Subir material<span class="arr">›</span></a>
          <a href="seguimiento.html"><span class="ic g">👥</span>Ver asistencia<span class="arr">›</span></a>
          <button id="msg-soon"><span class="ic g">✉️</span>Enviar mensaje <small class="meta">· próx.</small><span class="arr">›</span></button>
          <button id="task-soon"><span class="ic">📝</span>Crear tarea <small class="meta">· próx.</small><span class="arr">›</span></button>
          <a href="escritorio.html"><span class="ic">🗓</span>Ver calendario<span class="arr">›</span></a></div></div>
        <div class="rcard"><h3>📘 Mis grupos <a class="lk" href="panel.html?lista=1">Ver todos →</a></h3>
          ${groups.length ? groups.map(x => { const n = nextOf(x.id); const st = x.memberships.filter(m => m.role !== "teacher").length; return `<div class="next"><span class="h" style="background:${gcolor(x)};color:#fff">●</span><span style="flex:1"><b>${esc(x.name)}</b><small>${st} alumnos${n ? " · próxima clase " + fmtDate(n.starts_at, { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : " · sin clases próximas"}</small></span>${n ? `<a class="button secondary small" href="${n.status === "live" ? "sesion.html?id=" + n.id : "preparar.html?id=" + n.id}">${n.status === "live" ? "Entrar" : "Gestionar"}</a>` : `<button class="button gold small" data-quick="${x.id}">▶ Empezar</button>`}</div>`; }).join("") : `<p class="meta">Aún no tienes grupos asignados.</p>`}</div>
        <div class="rcard"><h3>👥 Alumnos que requieren atención <a class="lk" href="seguimiento.html">Ver todos →</a></h3>
          ${fl.length ? fl.map(r => `<div class="next"><span class="avatar" style="width:36px;height:36px;font-size:12px;background:#bcd6ec;color:#0b2f6b">${esc(initials(r.full_name))}</span><span style="flex:1"><b>${esc(r.full_name)}</b><small>${esc(r.reason)}</small></span>${r.phone ? `<a class="st ${r.status}" href="${whatsappMessage(`Hola ${r.full_name.split(" ")[0]}, soy ${first}. ¿Cómo vas?`)}" target="_blank" rel="noopener" style="text-decoration:none">${r.status === "risk" ? "! Contactar" : "⚠ Revisar"}</a>` : `<span class="st ${r.status}">${r.status === "risk" ? "! Contactar" : "⚠ Revisar"}</span>`}</div>`).join("") : `<p class="meta">Todos tus alumnos van bien. 🙌</p>`}</div>
        <div class="rcard"><h3>📁 Materiales recientes <a class="lk" href="biblioteca.html">Ver materiales →</a></h3>
          ${(mats.data || []).length ? `<div class="quick">${mats.data.map(m => `<a href="sesion.html?id=${m.session_id}"><span class="ic ${/\.pdf$/i.test(m.storage_path || "") ? "" : "g"}">${m.kind === "link" ? "🔗" : /\.pdf$/i.test(m.storage_path || "") ? "📄" : m.kind === "text" ? "📝" : "📘"}</span><span style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.title)}</b><small class="meta">${esc(m.session_title)}</small></span></a>`).join("")}</div>` : `<p class="meta">Sin materiales todavía.</p>`}</div>
        <div class="rcard"><h3>🗓 Mi semana <a class="lk" href="escritorio.html">Ver calendario →</a></h3>
          <div class="quick week">${days.map((d, i) => { const dd = new Date(wk0); dd.setDate(wk0.getDate() + i); const n = week.filter(x => new Date(x.starts_at).toDateString() === dd.toDateString()).length; const isT = dd.toDateString() === new Date().toDateString(); return `<span style="display:grid;place-items:center;padding:8px 4px;border-radius:10px;background:${isT ? "#e3eefa" : "#f5f8fc"};text-align:center"><b style="font-size:12px">${d}</b><small class="meta">${dd.getDate()}</small><span style="color:#0c70bb;font-size:12px">${"●".repeat(Math.min(n, 3)) || "·"}</span></span>`; }).join("")}</div></div>
      </div>
      <div class="rfoot">👥 Una comunidad global para un mundo real.<div class="v"><span>🌐 Aprender</span><span>👥 Conectar</span><span>🤍 Servir</span><span>📈 Multiplicar</span></div><span style="font-style:italic;color:#0c70bb">${esc(st.footer_tag || "")}</span></div>`;
    document.getElementById("msg-soon").addEventListener("click", () => toast("Enviar mensaje: próximamente"));
    document.getElementById("task-soon").addEventListener("click", () => toast("Crear tarea: próximamente"));
    document.getElementById("quick-btn").addEventListener("click", () => Shell.quickClassDialog(me));
    document.getElementById("quick-btn2").addEventListener("click", () => Shell.quickClassDialog(me));
    app.querySelectorAll("[data-quick]").forEach(b => b.addEventListener("click", () => Shell.quickClassDialog(me, b.dataset.quick)));
    document.getElementById("loading").hidden = true; app.hidden = false;
  }
})();
