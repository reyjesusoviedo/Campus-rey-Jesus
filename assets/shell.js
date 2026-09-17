/* Barra lateral y cabecera comunes · requiere db.js */
(function () {
  const I = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    students: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M2.5 19c0-3.3 3-5.5 6.5-5.5s6.5 2.2 6.5 5.5M15 14.5c3 0 6 1.8 6 4.5"/></svg>',
    teachers: '<svg viewBox="0 0 24 24"><path d="M12 3 1 8l11 5 9-4.1V15h2V8L12 3Zm-6 9.3V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.7"/></svg>',
    courses: '<svg viewBox="0 0 24 24"><path d="M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/></svg>',
    groups: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3"/><circle cx="5" cy="10" r="2.2"/><circle cx="19" cy="10" r="2.2"/><path d="M6 20c0-3 2.7-5 6-5s6 2 6 5M1.5 18c0-2 1.5-3.5 3.5-3.5M22.5 18c0-2-1.5-3.5-3.5-3.5"/></svg>',
    follow: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    library: '<svg viewBox="0 0 24 24"><path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4 1-3 15-4-1z"/></svg>',
    reports: '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    logout: '<svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3M21 4v16"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="#0b2f6b" stroke-width="1.8"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>'
  };
  const MENU = me => {
    const coord = me.profile.role === "coordinator";
    const m = [["resumen", "Resumen", "resumen.html", I.home]];
    if (coord) m.push(["alumnos", "Alumnos", "equipo.html?tab=students", I.students], ["equipo", "Maestros", "equipo.html", I.teachers], ["cursos", "Cursos", "ajustes.html#cursos", I.courses]);
    m.push(["panel", "Grupos", "panel.html?lista=1", I.groups], ["seguimiento", "Seguimiento", "seguimiento.html", I.follow], ["escritorio", "Calendario", "escritorio.html", I.calendar], ["biblioteca", "Biblioteca", "biblioteca.html", I.library], ["reportes", "Reportes", "#", I.reports, "soon"]);
    m.push(["hr"]);
    if (coord) m.push(["ajustes", "Configuración", "ajustes.html", I.settings]);
    m.push(["logout", "Cerrar sesión", "#logout", I.logout]);
    return m;
  };
  window.Shell = {
    render(me, active, title) {
      const { esc, cfg, initials, sb, settings, brandMark } = Campus;
      const st = settings() || {};
      const side = document.querySelector(".sidebar"); if (!side) return;
      side.innerHTML = `<div class="sb-logo">${cfg.logoUrl ? `<img src="${cfg.logoUrl}" alt="">` : `<span class="brand-mark">${esc(cfg.brandShort)}</span>`}<b>Campus<br>${esc(cfg.brand)}</b><small>${esc(st.motto || cfg.tagline)}</small></div>
        <div class="sb-user" data-rename><span class="avatar">${esc(initials(me.profile.full_name))}</span><span><b>${esc(me.profile.full_name)}</b><small>${me.profile.role === "coordinator" ? "Coordinación" : "Maestro/a"}</small></span></div>
        <nav class="sb-nav">${MENU(me).map(x => x[0] === "hr" ? "<hr>" : `<a href="${x[2]}" class="${x[0] === active ? "on" : ""} nav-link" data-key="${x[0]}"><span class="i">${x[3]}</span>${x[1]}${x[4] === "soon" ? `<span class="soon">Próx.</span>` : ""}</a>`).join("")}</nav>
        <p class="sb-quote">«${esc(st.footer_quote || "No solo comparto información: abro camino para que otros conozcan, conecten y crezcan.")}»</p>`;
      side.querySelector('[data-key="logout"]').addEventListener("click", async e => { e.preventDefault(); await sb.auth.signOut(); location.replace("entrar.html"); });
      side.querySelector('[data-key="reportes"]').addEventListener("click", e => { e.preventDefault(); Campus.toast("Reportes: próximamente"); });
      side.querySelector("[data-rename]").addEventListener("click", async () => { const name = prompt("Tu nombre y apellido:", me.profile.full_name); if (!name || !name.trim()) return; const { error } = await sb.from("profiles").update({ full_name: name.trim() }).eq("id", me.user.id); if (error) { Campus.toast("No se pudo guardar"); return; } location.reload(); });
      const top = document.querySelector(".topbar");
      if (top) {
        top.innerHTML = `<button class="menu-button" data-menu aria-label="Abrir menú">☰</button><span class="tb-title">${esc(title || "")}</span>
          <div class="tb-search"><input type="search" id="tb-q" placeholder="Buscar alumno, curso o grupo…" autocomplete="off"><div class="tb-results" id="tb-r" hidden></div></div>
          <div class="tb-bell" id="tb-bell">${I.bell}<i id="tb-n" hidden></i><div class="tb-alerts" id="tb-a" hidden></div></div>
          <div class="tb-me"><span class="avatar">${esc(initials(me.profile.full_name))}</span><span>${esc(me.profile.full_name)}</span></div>`;
        // menú móvil
        let ov = document.getElementById("nav-overlay"); if (!ov) { ov = document.createElement("div"); ov.id = "nav-overlay"; ov.className = "nav-overlay"; document.body.appendChild(ov); }
        if (!side.querySelector(".nav-close")) { const x = document.createElement("button"); x.className = "icon-button nav-close"; x.setAttribute("aria-label", "Cerrar menú"); x.textContent = "×"; side.prepend(x); x.addEventListener("click", () => document.body.classList.remove("nav-open")); }
        top.querySelector("[data-menu]").addEventListener("click", () => document.body.classList.toggle("nav-open"));
        ov.addEventListener("click", () => document.body.classList.remove("nav-open"));
        side.querySelectorAll(".nav-link").forEach(a => a.addEventListener("click", () => document.body.classList.remove("nav-open")));
        // buscador
        const q = top.querySelector("#tb-q"), r = top.querySelector("#tb-r"); let t;
        q.addEventListener("input", () => { clearTimeout(t); const v = q.value.trim(); if (v.length < 2) { r.hidden = true; return; } t = setTimeout(async () => { const { data } = await sb.rpc("global_search", { q: v }); const K = { group: "Grupo", course: "Curso", person: "Persona" }; r.innerHTML = (data || []).length ? data.map(x => `<a href="${esc(x.href)}"><span class="k">${K[x.kind]}</span><span><b>${esc(x.title)}</b><br><small class="meta">${esc(x.detail || "")}</small></span></a>`).join("") : `<div class="meta" style="padding:10px 12px">Nada encontrado.</div>`; r.hidden = false; }, 250); });
        document.addEventListener("click", e => { if (!top.querySelector(".tb-search").contains(e.target)) r.hidden = true; });
        // campana
        const bell = top.querySelector("#tb-bell"), list = top.querySelector("#tb-a"), n = top.querySelector("#tb-n");
        bell.addEventListener("click", e => { if (e.target.closest(".tb-alerts")) return; list.hidden = !list.hidden; });
        document.addEventListener("click", e => { if (!bell.contains(e.target)) list.hidden = true; });
        Shell.alerts(me).then(al => { if (!al.length) { list.innerHTML = `<div class="meta">Sin avisos.</div>`; return; } n.textContent = al.length; n.hidden = false; list.innerHTML = al.map(a => `<a href="${esc(a.href)}">${a.icon} ${esc(a.text)}</a>`).join(""); });
      }
    },
    async alerts(me) {
      const { sb } = Campus; const coord = me.profile.role === "coordinator"; const out = [];
      try {
        const g = await sb.from("groups").select("id, name, teacher_id"); (g.data || []).filter(x => !x.teacher_id).forEach(x => out.push({ icon: "⚠", text: `${x.name} no tiene maestro`, href: "escritorio.html" }));
        const s = await sb.from("sessions").select("id, title, starts_at").eq("status", "scheduled").gte("starts_at", new Date().toISOString()).lte("starts_at", new Date(Date.now() + 3 * 86400e3).toISOString());
        const ids = (s.data || []).map(x => x.id); let withMat = new Set();
        if (ids.length) { const m = await sb.from("materials").select("session_id").in("session_id", ids); (m.data || []).forEach(x => withMat.add(x.session_id)); }
        (s.data || []).filter(x => !withMat.has(x.id)).forEach(x => out.push({ icon: "📄", text: `${x.title} sin material`, href: "preparar.html?id=" + x.id }));
        const q = await sb.from("course_questions").select("id", { count: "exact", head: true }).is("answer", null); if (q.count) out.push({ icon: "🙋", text: `${q.count} pregunta${q.count === 1 ? "" : "s"} de cursos sin responder`, href: "equipo.html?tab=courses" });
        if (coord) { const i = await sb.from("staff_invites").select("full_name, email, expires_at").is("accepted_at", null); (i.data || []).forEach(x => out.push({ icon: "✉", text: `Invitación a ${x.full_name || x.email} sin aceptar`, href: "equipo.html?tab=invites" })); }
      } catch {}
      return out;
    }
  };
})();
