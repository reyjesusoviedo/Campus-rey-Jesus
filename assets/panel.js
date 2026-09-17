(async () => {
  const { sb, esc, fmtDate, toast, requireUser, renderShell, whatsappMessage, copy, initials } = Campus;
  const me = await requireUser();
  renderShell(me, "panel");
  const app = document.getElementById("app");
  const dialog = document.getElementById("dialog");
  document.getElementById("dialog-close").addEventListener("click", () => dialog.close());

  const role = me.profile.role;
  const staff = role === "coordinator" || role === "teacher";
  if (!staff) document.querySelectorAll("[data-staff-only]").forEach(a => a.remove());

  function openDialog(title, html, onMount) {
    document.getElementById("dialog-title").textContent = title;
    document.getElementById("dialog-body").innerHTML = html;
    dialog.showModal();
    onMount && onMount(dialog);
  }

  function statusTag(s) {
    const now = Date.now(), t = new Date(s.starts_at).getTime();
    if (s.status === "live") return `<span class="tag live">En directo</span>`;
    if (s.status === "closed") return `<span class="tag closed">${s.recording_url ? "Grabada" : "Terminada"}</span>`;
    return t < now - 3600e3 ? `<span class="tag draft">Sin iniciar</span>` : `<span class="tag">Programada</span>`;
  }

  const WD = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  async function load() {
    if (staff) { const r = await sb.rpc("ensure_recurring_sessions", { p_days: 14 }); if (r.data) toast(`${r.data} clase${r.data === 1 ? "" : "s"} creada${r.data === 1 ? "" : "s"} automáticamente`); }
    const { data: groups, error } = await sb.from("groups")
      .select("*, teacher:profiles!groups_teacher_id_fkey(full_name), memberships(user_id, role, profile:profiles(full_name)), sessions(*)")
      .order("name");
    if (error) { app.innerHTML = `<p class="notice">No se pudieron cargar los grupos: ${esc(error.message)}</p>`; return; }
    render(groups || []);
  }

  function render(groups) {
    const next = groups.flatMap(g => g.sessions.map(s => ({ ...s, group: g })))
      .filter(s => s.status !== "closed" && new Date(s.starts_at) > Date.now() - 3 * 3600e3)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];

    app.innerHTML = `
      <header class="page-heading"><div>
        <p class="eyebrow">${esc(Campus.cfg.brand)}</p>
        <h1 style="margin:0;font-family:Georgia,serif">Hola, ${esc(me.profile.full_name.split(" ")[0])}</h1>
        <p class="subtle">${staff ? "Prepara y dirige las clases de tus grupos." : "Aquí están tus grupos y tu próxima clase."}</p>
      </div>
      <div class="comm-aux">
        ${role === "coordinator" ? `<button class="button secondary" id="new-group">Nuevo grupo</button>` : ""}
        <button class="button ${staff ? "secondary" : ""}" id="join-code">Tengo un código de grupo</button>
      </div></header>

      ${next ? `<section class="live-brief"><div><span class="tag">Próxima clase</span><strong>${esc(next.title)}</strong><p>${esc(next.group.name)} · ${fmtDate(next.starts_at)}</p></div>
        <div><a class="button gold" href="sesion.html?id=${next.id}">${next.status === "live" ? "Entrar a la clase" : staff ? "Abrir la clase" : "Ir a la clase"}</a></div></section>` : ""}

      <div class="two-col">
        <div class="group-list" id="groups">
          ${groups.length ? groups.map(groupCard).join("") : `<div class="panel panel-pad"><h2 style="margin-top:0">Todavía no estás en ningún grupo</h2><p class="subtle">${staff ? role === "coordinator" ? "Crea un grupo y asigna un maestro." : "Pide a coordinación que te asigne un grupo, o entra con un código." : "Introduce el código que te ha enviado tu maestro."}</p></div>`}
        </div>
        <aside class="panel panel-pad">
          <h3 style="margin-top:0">Cómo funciona una clase</h3>
          <ol style="padding-left:18px;margin:0;display:grid;gap:8px;font-size:14px">
            <li>Abre <strong>Zoom</strong> con el enlace del grupo para el vídeo.</li>
            <li>Entra a la clase aquí: verás el material y las actividades que lance tu maestro.</li>
            <li>Responde desde el móvil o el ordenador; tu maestro ve las respuestas al momento.</li>
            <li>Si te pierdes, pulsa <strong>Pido ayuda</strong>.</li>
            <li>Si no pudiste asistir, verás la grabación y podrás hacer las actividades después.</li>
          </ol>
        </aside>
      </div>`;

    document.getElementById("join-code").addEventListener("click", joinDialog);
    document.getElementById("new-group")?.addEventListener("click", newGroupDialog);
    app.querySelectorAll("[data-invite]").forEach(b => b.addEventListener("click", () => inviteDialog(groups.find(g => g.id === b.dataset.invite))));
    app.querySelectorAll("[data-new-session]").forEach(b => b.addEventListener("click", () => newSessionDialog(groups.find(g => g.id === b.dataset.newSession))));
    app.querySelectorAll("[data-members]").forEach(b => b.addEventListener("click", () => membersDialog(groups.find(g => g.id === b.dataset.members))));
    app.querySelectorAll("[data-recur]").forEach(b => b.addEventListener("click", () => recurrenceDialog(groups.find(g => g.id === b.dataset.recur))));
    app.querySelectorAll("[data-del-session]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(`¿Borrar la clase «${b.dataset.title}»? Se borrarán sus actividades, respuestas y material.`)) return;
      const { error } = await sb.from("sessions").delete().eq("id", b.dataset.delSession);
      if (error) { toast("No se pudo borrar: " + error.message); return; } toast("Clase borrada"); load();
    }));
    app.querySelectorAll("[data-del-group]").forEach(b => b.addEventListener("click", async () => {
      const name = b.dataset.title;
      if (prompt(`Vas a borrar el grupo «${name}» con todas sus clases, alumnos y respuestas. Escribe BORRAR para confirmar:`) !== "BORRAR") return;
      const { error } = await sb.from("groups").delete().eq("id", b.dataset.delGroup);
      if (error) { toast("No se pudo borrar: " + error.message); return; } toast("Grupo borrado"); load();
    }));
  }

  function groupCard(g) {
    const canManage = role === "coordinator" || g.teacher_id === me.user.id || g.memberships.some(m => m.user_id === me.user.id && m.role === "teacher");
    const sessions = [...g.sessions].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
    const students = g.memberships.filter(m => m.role === "student").length, guests = g.memberships.filter(m => m.role === "guest").length;
    return `<article class="panel group-card">
      <div class="head"><div>
        <h2>${esc(g.name)}</h2>
        <p class="meta" style="margin:4px 0 0">${esc(g.teacher?.full_name || "")} · ${esc(g.schedule_text || "sin horario")} · ${students} ${students === 1 ? "alumno" : "alumnos"}${guests ? ` · ${guests} ${guests === 1 ? "invitado" : "invitados"}` : ""}</p>
        ${g.description ? `<p class="subtle" style="margin:8px 0 0;font-size:14px">${esc(g.description)}</p>` : ""}
      </div>
      <div class="actions">
        ${(role === "coordinator" || g.teacher_id === me.user.id) ? `<button class="icon-button" title="Borrar grupo" data-del-group="${g.id}" data-title="${esc(g.name)}">🗑</button>` : ""}
        ${g.zoom_url ? `<a class="button secondary small" target="_blank" rel="noopener" href="${esc(g.zoom_url)}">Zoom del grupo</a>` : ""}
        ${canManage ? `<button class="button secondary small" data-recur="${g.id}" title="Clases recurrentes">${g.recurrence?.mode && g.recurrence.mode !== "none" ? "🔁 " + WD[g.recurrence.weekday] + " " + g.recurrence.time : "Recurrencia"}</button><button class="button secondary small" data-members="${g.id}">Alumnos</button><button class="button secondary small" data-invite="${g.id}">Invitar</button><button class="button small" data-new-session="${g.id}">Nueva clase</button>` : ""}
      </div></div>
      ${sessions.length ? `<ul class="session-rows">${sessions.slice(0, 8).map(s => `<li>
          <span class="when">${fmtDate(s.starts_at)}</span>
          <span class="title">${esc(s.title)}</span>
          ${statusTag(s)}
          ${canManage && s.status !== "closed" ? `<a class="button teal small" href="preparar.html?id=${s.id}">Preparar</a>` : ""}
          <a class="button secondary small" href="sesion.html?id=${s.id}">${s.status === "closed" ? "Ver" : "Entrar"}</a>
          ${canManage ? `<button class="icon-button" title="Borrar clase" data-del-session="${s.id}" data-title="${esc(s.title)}">🗑</button>` : ""}
        </li>`).join("")}</ul>` : `<p class="meta" style="margin:16px 0 0">Aún no hay clases programadas.</p>`}
    </article>`;
  }

  function joinDialog() {
    openDialog("Unirme a un grupo", `
      <p class="subtle" style="margin-top:0">Escribe el código de 6 letras que te ha enviado tu maestro.</p>
      <div class="field"><label for="code">Código</label><input id="code" maxlength="6" style="text-transform:uppercase;letter-spacing:.2em;font-size:1.3rem;text-align:center" autocomplete="off"></div>
      <p class="form-error" id="code-error"></p>
      <button class="button" id="code-go" style="width:100%">Entrar al grupo</button>`, d => {
      d.querySelector("#code-go").addEventListener("click", async () => {
        const code = d.querySelector("#code").value.trim().toUpperCase();
        const { error } = await sb.rpc("join_with_code", { p_code: code });
        if (error) { d.querySelector("#code-error").textContent = "Código no válido o caducado."; return; }
        dialog.close(); toast("Ya estás en el grupo"); load();
      });
    });
  }

  async function newGroupDialog() {
    const { data: teachers } = await sb.from("profiles").select("id, full_name, role").in("role", ["teacher", "coordinator"]).order("full_name");
    openDialog("Nuevo grupo", `
      <div class="inline-form">
        <div class="field"><label for="g-name">Nombre</label><input id="g-name" placeholder="Jóvenes · martes"></div>
        <div class="field"><label for="g-teacher">Maestro/a</label><select id="g-teacher">${(teachers || []).map(t => `<option value="${t.id}" ${t.id === me.user.id ? "selected" : ""}>${esc(t.full_name)}</option>`).join("")}</select></div>
        <div class="row">
          <div class="field"><label for="g-sched">Horario</label><input id="g-sched" placeholder="Martes 20:00"></div>
          <div class="field"><label for="g-zoom">Enlace de Meet/Zoom (si no usáis el vídeo del campus)</label><input id="g-zoom" placeholder="https://meet.google.com/…"></div>
        </div>
        <div class="field"><label for="g-video">Vídeo de la clase</label><select id="g-video"><option value="jitsi">Dentro del campus (los alumnos no abren nada)</option><option value="external">Aparte, con Meet o Zoom (ventana flotante)</option></select></div>
        <div class="field"><label for="g-desc">Descripción (opcional)</label><textarea id="g-desc" rows="2"></textarea></div>
        <p class="form-error" id="g-error"></p>
        <button class="button" id="g-go">Crear grupo</button>
      </div>`, d => {
      d.querySelector("#g-go").addEventListener("click", async () => {
        const name = d.querySelector("#g-name").value.trim();
        if (!name) { d.querySelector("#g-error").textContent = "Ponle un nombre al grupo."; return; }
        const teacher_id = d.querySelector("#g-teacher").value;
        const { data: g, error } = await sb.from("groups").insert({ name, teacher_id, schedule_text: d.querySelector("#g-sched").value.trim() || null, zoom_url: d.querySelector("#g-zoom").value.trim() || null, description: d.querySelector("#g-desc").value.trim() || null, video_provider: d.querySelector("#g-video").value }).select().single();
        if (error) { d.querySelector("#g-error").textContent = error.message; return; }
        await sb.from("memberships").insert({ group_id: g.id, user_id: teacher_id, role: "teacher" });
        dialog.close(); toast("Grupo creado"); load();
      });
    });
  }

  function inviteDialog(g) {
    openDialog("Invitar al grupo " + g.name, `
      <p class="subtle" style="margin-top:0">Genera un código y compártelo por WhatsApp. Quien lo introduzca en el campus entrará en este grupo. Cada persona necesita además tener usuario: si aún no lo tiene, pídelo a coordinación con su correo.</p>
      <div id="inv-result"></div>
      <div class="field"><label for="inv-days">Válido durante</label><select id="inv-days"><option value="7">7 días</option><option value="30" selected>30 días</option><option value="180">6 meses</option></select></div>
      <button class="button" id="inv-go">Generar código</button>
      <hr style="border:0;border-top:1px solid var(--line);margin:20px 0">
      <h3 style="margin:0 0 6px">Invitados habituales (sin registro)</h3>
      <p class="subtle" style="margin:0 0 10px;font-size:14px">Un código fijo del grupo para quien viene cada semana pero aún no se registra. Entra con su nombre y este código; después ya ve directamente la próxima clase. Caduca a los 90 días sin venir.</p>
      <div id="guest-result">${g.allow_guests && g.guest_code ? guestBox(g.guest_code) : ""}</div>
      <div class="live-controls"><button class="button secondary small" id="guest-on">${g.allow_guests && g.guest_code ? "Regenerar" : "Activar código de invitados"}</button>${g.allow_guests ? `<button class="button secondary small" id="guest-off">Desactivar</button>` : ""}</div>`, d => {
      const guestLink = code => location.href.replace(/[^/]*$/, "index.html?clase=" + code);
      d.querySelector("#guest-on").addEventListener("click", async () => {
        const { data: code, error } = await sb.rpc("set_group_guest_code", { p_group: g.id, p_enable: true });
        if (error) { toast("No se pudo activar: " + error.message); return; }
        g.guest_code = code; g.allow_guests = true;
        d.querySelector("#guest-result").innerHTML = guestBox(code); bindGuest(d, code);
      });
      d.querySelector("#guest-off")?.addEventListener("click", async () => { await sb.rpc("set_group_guest_code", { p_group: g.id, p_enable: false }); dialog.close(); toast("Código de invitados desactivado"); load(); });
      if (g.allow_guests && g.guest_code) bindGuest(d, g.guest_code);
      function bindGuest(d, code) {
        const msg = `Hola, te invito al grupo "${g.name}" del campus ${Campus.cfg.brand}.\nEntra aquí: ${guestLink(code)}\nEscribe tu nombre y el código ${code}. Sin registro.${g.schedule_text ? "\nNos vemos " + g.schedule_text + "." : ""}`;
        d.querySelector("#guest-copy")?.addEventListener("click", () => copy(guestLink(code)));
        d.querySelector("#guest-wa")?.setAttribute("href", whatsappMessage(msg));
      }
      d.querySelector("#inv-go").addEventListener("click", async () => {
        const { data: code, error } = await sb.rpc("create_invitation", { p_group: g.id, p_days: Number(d.querySelector("#inv-days").value) });
        if (error) { toast("No se pudo generar: " + error.message); return; }
        const link = location.href.replace(/[^/]*$/, "index.html");
        const msg = `Hola, te invito al grupo "${g.name}" del campus ${Campus.cfg.brand}.\n1) Entra en ${link}\n2) Pulsa "Tengo un código de grupo" y escribe: ${code}\n${g.schedule_text ? "Nos vemos " + g.schedule_text + "." : ""}`;
        d.querySelector("#inv-result").innerHTML = `<div class="code-box"><strong>${esc(code)}</strong><span class="meta">Código del grupo</span></div>
          <div class="live-controls"><button class="button secondary small" id="inv-copy">Copiar código</button><a class="button small" target="_blank" rel="noopener" href="${whatsappMessage(msg)}">Enviar por WhatsApp</a></div>`;
        d.querySelector("#inv-copy").addEventListener("click", () => copy(code));
      });
    });
  }

  function guestBox(code) {
    return `<div class="code-box"><strong>${esc(code)}</strong><span class="meta">Código de invitados</span></div>
      <div class="live-controls"><button class="button secondary small" id="guest-copy">Copiar enlace</button><a class="button small" id="guest-wa" target="_blank" rel="noopener" href="#">Enviar por WhatsApp</a></div>`;
  }

  async function recurrenceDialog(g) {
    const { data: tpls, error } = await sb.from("templates").select("id, title, folder").order("folder").order("title");
    if (error) { toast("Falta el parche de la Fase C en Supabase"); return; }
    const r = g.recurrence || {}, mode = r.mode || "none", series = r.series || [];
    const m = (g.schedule_text || "").match(/(\d{1,2})[:.h](\d{2})/); const defTime = r.time || (m ? `${m[1].padStart(2, "0")}:${m[2]}` : "20:00");
    const defWd = r.weekday ?? (WD.findIndex(w => (g.schedule_text || "").toLowerCase().includes(w.toLowerCase().slice(0, 4))) >= 0 ? WD.findIndex(w => (g.schedule_text || "").toLowerCase().includes(w.toLowerCase().slice(0, 4))) : 2);
    openDialog("Clases recurrentes · " + g.name, `<div class="inline-form">
      <p class="subtle" style="margin:0">El campus crea sola la clase de cada semana (con dos semanas de antelación) a partir de la plantilla que elijas. Los alumnos entran con el código del grupo y ven directamente la clase de esa semana.</p>
      <div class="row"><div class="field"><label for="rc-wd">Día</label><select id="rc-wd">${WD.map((w, i) => `<option value="${i}" ${i === defWd ? "selected" : ""}>${w}</option>`).join("")}</select></div><div class="field"><label for="rc-time">Hora</label><input id="rc-time" type="time" value="${defTime}"></div></div>
      <div class="field"><label for="rc-mode">Qué clase se crea</label><select id="rc-mode"><option value="none" ${mode === "none" ? "selected" : ""}>Sin recurrencia (las creo a mano)</option><option value="empty" ${mode === "empty" ? "selected" : ""}>Clase vacía cada semana</option><option value="same" ${mode === "same" ? "selected" : ""}>Siempre la misma plantilla</option><option value="series" ${mode === "series" ? "selected" : ""}>Serie de plantillas en orden (cíclica)</option></select></div>
      <div class="field" id="rc-same-f" hidden><label for="rc-tpl">Plantilla</label><select id="rc-tpl">${(tpls || []).map(t => `<option value="${t.id}" ${r.template_id === t.id ? "selected" : ""}>${esc(t.folder)} · ${esc(t.title)}</option>`).join("")}</select></div>
      <div class="field" id="rc-series-f" hidden><label>Serie (marca en orden; el número indica la posición)</label><div id="rc-series" style="display:grid;gap:4px;max-height:200px;overflow:auto">${(tpls || []).map(t => `<label style="font-size:14px;display:flex;gap:8px;align-items:center"><input type="checkbox" value="${t.id}" ${series.includes(t.id) ? "checked" : ""}><span class="meta" data-pos style="min-width:18px">${series.includes(t.id) ? series.indexOf(t.id) + 1 : ""}</span>${esc(t.folder)} · ${esc(t.title)}</label>`).join("")}</div><label style="font-size:13px;margin-top:6px">Empezar por la nº <input id="rc-idx" type="number" min="1" value="${(r.next_index || 0) + 1}" style="width:70px"></label></div>
      <div class="field" id="rc-title-f" hidden><label for="rc-title">Título de las clases</label><input id="rc-title" value="${esc(r.title || g.name)}"></div>
      ${!(tpls || []).length ? `<p class="notice">Aún no hay plantillas: prepara una clase y pulsa «Guardar como plantilla». Mientras tanto puedes usar «Clase vacía».</p>` : ""}
      <p class="form-error" id="rc-err"></p>
      <div class="live-controls"><button class="button" id="rc-save">Guardar</button></div></div>`, d => {
      const md = d.querySelector("#rc-mode"); const upd = () => { d.querySelector("#rc-same-f").hidden = md.value !== "same"; d.querySelector("#rc-series-f").hidden = md.value !== "series"; d.querySelector("#rc-title-f").hidden = md.value !== "empty"; }; md.addEventListener("change", upd); upd();
      const order = [...series];
      d.querySelectorAll("#rc-series input").forEach(cb => cb.addEventListener("change", () => { if (cb.checked) order.push(cb.value); else order.splice(order.indexOf(cb.value), 1); d.querySelectorAll("#rc-series label").forEach(l => { const v = l.querySelector("input").value; l.querySelector("[data-pos]").textContent = order.includes(v) ? order.indexOf(v) + 1 : ""; }); }));
      d.querySelector("#rc-save").addEventListener("click", async () => {
        const rec = { mode: md.value, weekday: Number(d.querySelector("#rc-wd").value), time: d.querySelector("#rc-time").value || "20:00" };
        if (md.value === "same") { rec.template_id = d.querySelector("#rc-tpl").value; if (!rec.template_id) { d.querySelector("#rc-err").textContent = "Elige una plantilla."; return; } }
        if (md.value === "series") { rec.series = order; rec.next_index = Math.max(0, Number(d.querySelector("#rc-idx").value) - 1); if (!order.length) { d.querySelector("#rc-err").textContent = "Marca al menos una plantilla."; return; } }
        if (md.value === "empty") rec.title = d.querySelector("#rc-title").value.trim() || g.name;
        const { error } = await sb.from("groups").update({ recurrence: md.value === "none" ? {} : rec }).eq("id", g.id);
        if (error) { d.querySelector("#rc-err").textContent = error.message; return; }
        dialog.close(); toast(md.value === "none" ? "Recurrencia desactivada" : "Recurrencia guardada"); load();
      });
    });
  }

  function membersDialog(g) {
    const rows = g.memberships.map(m => `<li><span class="avatar teal" style="width:30px;height:30px;font-size:11px">${esc(initials(m.profile?.full_name))}</span><span style="flex:1">${esc(m.profile?.full_name || "")}</span><span class="meta">${m.role === "teacher" ? "Maestro/a" : m.role === "guest" ? "Invitado/a" : "Alumno/a"}</span>${(m.role !== "teacher" && (role === "coordinator" || g.teacher_id === me.user.id)) ? `<button class="button secondary small" data-remove="${m.user_id}">Quitar</button>` : ""}</li>`).join("");
    openDialog("Alumnos de " + g.name, rows ? `<ul class="members">${rows}</ul>` : `<p class="subtle">Todavía nadie se ha unido. Genera un código de invitación.</p>`, d => {
      d.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", async () => {
        if (!confirm("¿Quitar a esta persona del grupo?")) return;
        await sb.from("memberships").delete().match({ group_id: g.id, user_id: b.dataset.remove });
        dialog.close(); load();
      }));
    });
  }

  function newSessionDialog(g) {
    const d0 = new Date(); d0.setMinutes(0, 0, 0); d0.setHours(d0.getHours() + 1);
    const local = new Date(d0.getTime() - d0.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    openDialog("Nueva clase · " + g.name, `
      <div class="inline-form">
        <div class="field"><label for="s-title">Título</label><input id="s-title" placeholder="Tema de la clase"></div>
        <div class="row">
          <div class="field"><label for="s-when">Fecha y hora</label><input id="s-when" type="datetime-local" value="${local}"></div>
          <div class="field"><label for="s-zoom">Enlace de Zoom</label><input id="s-zoom" value="${esc(g.zoom_url || "")}" placeholder="https://zoom.us/j/…"></div>
        </div>
        <p class="form-error" id="s-error"></p>
        <button class="button" id="s-go">Crear clase</button>
      </div>`, d => {
      d.querySelector("#s-go").addEventListener("click", async () => {
        const title = d.querySelector("#s-title").value.trim();
        const when = d.querySelector("#s-when").value;
        if (!title || !when) { d.querySelector("#s-error").textContent = "Pon título y fecha."; return; }
        const { data: s, error } = await sb.from("sessions").insert({ group_id: g.id, title, starts_at: new Date(when).toISOString(), zoom_url: d.querySelector("#s-zoom").value.trim() || null, created_by: me.user.id }).select().single();
        if (error) { d.querySelector("#s-error").textContent = error.message; return; }
        location.href = "preparar.html?id=" + s.id;
      });
    });
  }

  await load();
  document.getElementById("loading").hidden = true;
  app.hidden = false;
})();
