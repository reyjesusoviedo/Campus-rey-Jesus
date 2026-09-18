(async () => {
  const { sb, esc, fmtDate, toast, requireUser, renderShell, initials, whatsappMessage, copy } = Campus;
  const me = await requireUser();
  renderShell(me, "equipo"); if (window.Shell && ["coordinator", "teacher"].includes(me.profile.role)) Shell.render(me, "equipo", "Equipo");
  const app = document.getElementById("app"), dialog = document.getElementById("dialog");
  document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  function openDialog(title, html, onMount) { document.getElementById("dialog-title").textContent = title; document.getElementById("dialog-body").innerHTML = html; dialog.showModal(); onMount && onMount(dialog); }
  if (me.profile.role !== "coordinator") { app.innerHTML = `<div class="lib-empty"><h2>Solo coordinación</h2><p>Esta pantalla es para dar de alta y gestionar al equipo.</p><a class="button" href="escritorio.html">Volver al escritorio</a></div>`; document.getElementById("loading").hidden = true; app.hidden = false; return; }

  const PALETTE = ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#be185d", "#0e7490", "#4d7c0f", "#9f1239"];
  const gcolor = g => g.color || PALETTE[Math.abs([...g.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % PALETTE.length];
  const ROLE = { teacher: "Maestro/a", coordinator: "Coordinación" };
  const S = { staff: [], groups: [], invites: [], last: {}, tab: new URLSearchParams(location.search).get("tab") || "staff", students: null, q: "", showOff: false };
  const baseUrl = () => location.href.replace(/[^/]*$/, "");
  const inviteLink = t => baseUrl() + "entrar.html?equipo=" + t;

  async function load() {
    const [p, g, i, l] = await Promise.all([
      sb.from("profiles").select("id, full_name, role, active, email").in("role", ["teacher", "coordinator"]).order("full_name"),
      sb.from("groups").select("id, name, color, teacher_id, memberships(user_id, role)").order("name"),
      sb.from("staff_invites").select("*").order("created_at", { ascending: false }),
      sb.rpc("staff_last_class")
    ]);
    if (p.error || i.error) { app.innerHTML = `<p class="notice">No se pudo cargar: ${esc((p.error || i.error).message)}. ¿Se ejecutó el parche de Equipo?</p>`; return; }
    S.staff = p.data || []; S.groups = g.data || []; S.invites = i.data || []; S.last = {}; (l.data || []).forEach(x => S.last[x.teacher_id] = x.last_at);
    render();
  }

  function render() {
    const active = S.staff.filter(x => x.active), pending = S.invites.filter(x => !x.accepted_at && new Date(x.expires_at) > Date.now());
    const students = new Set(S.groups.flatMap(g => g.memberships.filter(m => m.role !== "teacher").map(m => m.user_id))).size;
    app.innerHTML = `
      <div class="eq-hello"><div><h1>Quién da clase, con qué rol y en qué grupos</h1><p>Gestiona el equipo de maestros y colaboradores del campus.</p></div><button class="button teal" id="b-invite">＋ Dar de alta</button></div>
      <div class="stats"><div class="stat"><span class="sic">🎓</span><span><b>${active.filter(x => x.role === "teacher").length}</b><span>maestros activos</span></span></div><div class="stat"><span class="sic gold">👥</span><span><b>${active.filter(x => x.role === "coordinator").length}</b><span>coordinación</span></span></div><div class="stat"><span class="sic">👥</span><span><b>${S.groups.length}</b><span>grupos</span></span></div><div class="stat"><span class="sic green">👥</span><span><b>${students}</b><span>alumnos</span></span></div></div>
      <div class="eq-tabs"><button data-tab="staff" aria-pressed="${S.tab === "staff"}">Equipo (${S.staff.length})</button><button data-tab="students" aria-pressed="${S.tab === "students"}">Alumnos (${students})</button><button data-tab="courses" aria-pressed="${S.tab === "courses"}">Cursos libres</button></div>
      <div class="eq-card" id="body"></div>`;
    app.querySelector("#b-invite").addEventListener("click", () => newMemberDialog());
    app.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; render(); }));
    if (S.tab === "staff") renderStaff(); else if (S.tab === "invites") renderInvites(); else if (S.tab === "courses") renderCourses(); else renderStudents();
  }

  function renderStaff() {
    const body = app.querySelector("#body");
    const off = S.staff.filter(p => !p.active).length;
    const list = S.showOff ? S.staff : S.staff.filter(p => p.active);
    const rows = list.map(p => {
      const gs = S.groups.filter(g => g.teacher_id === p.id);
      const state = !p.active ? `<span class="stt off">Desactivado</span>` : gs.length || p.role === "coordinator" ? `<span class="stt on">Activo</span>` : `<span class="stt nogroup">Sin grupo</span>`;
      return `<tr class="${p.active ? "" : "inactive"}"><td><div class="who"><span class="avatar teal">${esc(initials(p.full_name))}</span><span><b>${esc(p.full_name)}${p.id === me.user.id ? " (tú)" : ""}</b><small>${esc(p.email || "")}</small></span></div></td>
        <td><span class="tag" style="${p.role === "coordinator" ? "background:#faf0d6;color:#7a5c14" : ""}">${ROLE[p.role]}</span></td>
        <td class="groups">${p.role === "coordinator" && !gs.length ? `<span class="tag closed">Todos</span>` : gs.map(g => `<span style="--gc:${gcolor(g)}">${esc(g.name)}</span>`).join("") || `<span class="tag closed">Sin grupo</span>`}</td>
        <td>${S.last[p.id] ? fmtDate(S.last[p.id], { day: "numeric", month: "short" }) : "—"}</td><td>${state}</td>
        <td><div class="acts">${p.active ? `<button data-groups="${p.id}">👥 Grupos</button>${p.id !== me.user.id ? `<button data-role="${p.id}">✏️ Rol</button><button data-pw="${p.id}">🔑 Contraseña</button><button data-off="${p.id}">⏸ Desactivar</button><button class="danger" data-del-person="${p.id}">🗑 Eliminar</button>` : ""}` : `<button data-on="${p.id}">Reactivar</button>`}</div></td></tr>`;
    });
    body.innerHTML = `${off ? `<div style="padding:10px 14px 0"><label style="font-size:14px;display:inline-flex;gap:8px;align-items:center"><input type="checkbox" id="show-off" ${S.showOff ? "checked" : ""}> Mostrar desactivados (${off})</label></div>` : ""}
      <table><tr><th>Persona</th><th>Rol</th><th>Grupos</th><th>Última clase</th><th>Estado</th><th></th></tr>${rows.join("") || `<tr><td colspan="6" class="meta">Sin personas en esta lista.</td></tr>`}</table>`;
    body.querySelector("#show-off")?.addEventListener("change", e => { S.showOff = e.target.checked; renderStaff(); });
    body.querySelectorAll("[data-groups]").forEach(b => b.addEventListener("click", () => groupsDialog(S.staff.find(p => p.id === b.dataset.groups))));
    body.querySelectorAll("[data-role]").forEach(b => b.addEventListener("click", () => roleDialog(S.staff.find(p => p.id === b.dataset.role))));
    body.querySelectorAll("[data-pw]").forEach(b => b.addEventListener("click", () => passwordDialog(S.staff.find(p => p.id === b.dataset.pw))));
    body.querySelectorAll("[data-off]").forEach(b => b.addEventListener("click", async () => { const p = S.staff.find(x => x.id === b.dataset.off); if (!confirm(`¿Desactivar a ${p.full_name}? No se borra: deja de poder entrar y su historial se conserva. Lo verás marcando «Mostrar desactivados».`)) return; const { error } = await sb.from("profiles").update({ active: false }).eq("id", p.id); if (error) toast(error.message); else { toast("Desactivado · márcalo en «Mostrar desactivados» para reactivarlo"); S.showOff = true; } load(); }));
    body.querySelectorAll("[data-on]").forEach(b => b.addEventListener("click", async () => { await sb.from("profiles").update({ active: true }).eq("id", b.dataset.on); toast("Reactivado"); load(); }));
    body.querySelectorAll("[data-del-person]").forEach(b => b.addEventListener("click", () => deletePersonDialog(S.staff.find(p => p.id === b.dataset.delPerson))));
  }

  function renderInvites() {
    const body = app.querySelector("#body");
    const rows = S.invites.map(i => {
      const expired = new Date(i.expires_at) < Date.now(), st = i.accepted_at ? `<span class="stt on">Aceptada ${fmtDate(i.accepted_at, { day: "numeric", month: "short" })}</span>` : expired ? `<span class="stt off">Caducada</span>` : `<span class="stt pending">Invitación enviada · ${fmtDate(i.created_at, { day: "numeric", month: "short" })}</span>`;
      const g = S.groups.find(x => x.id === i.group_id);
      return `<tr class="${i.accepted_at ? "inactive" : ""}"><td><div class="who"><span class="avatar teal">${esc(initials(i.full_name || i.email))}</span><span><b>${esc(i.full_name || "")}</b><small>${esc(i.email)}</small></span></div></td><td><span class="tag">${ROLE[i.role]}</span></td><td>${g ? esc(g.name) : "—"}</td><td>${st}</td>
        <td><div class="acts">${i.accepted_at ? "" : `<button data-copy="${i.token}">🔗 Copiar enlace</button><button data-wa="${i.id}">💬 WhatsApp</button><button data-renew="${i.id}">✉️ ${expired ? "Renovar" : "Reenviar"}</button>`}<button class="danger" data-del="${i.id}">🗑 Borrar</button></div></td></tr>`;
    });
    body.innerHTML = rows.length ? `<table><tr><th>Persona</th><th>Rol</th><th>Grupo</th><th>Estado</th><th></th></tr>${rows.join("")}</table>` : `<p class="subtle" style="padding:16px">No hay invitaciones. Pulsa «Invitar a alguien».</p>`;
    body.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => copy(inviteLink(b.dataset.copy))));
    body.querySelectorAll("[data-wa]").forEach(b => b.addEventListener("click", () => { const i = S.invites.find(x => x.id === b.dataset.wa); window.open(whatsappMessage(inviteText(i)), "_blank"); }));
    body.querySelectorAll("[data-renew]").forEach(b => b.addEventListener("click", async () => { const { data: t, error } = await sb.rpc("renew_staff_invite", { p_id: b.dataset.renew }); if (error) { toast(error.message); return; } const i = S.invites.find(x => x.id === b.dataset.renew); i.token = t; showLinkDialog(i); load(); }));
    body.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => { if (!confirm("¿Borrar esta invitación?")) return; await sb.from("staff_invites").delete().eq("id", b.dataset.del); load(); }));
  }

  function inviteText(i) {
    const g = S.groups.find(x => x.id === i.group_id);
    return `Hola${i.full_name ? " " + i.full_name.split(" ")[0] : ""}, te doy de alta como ${ROLE[i.role].toLowerCase()} en el campus ${Campus.cfg.brand}${g ? " (grupo " + g.name + ")" : ""}.\n${i.message ? i.message + "\n" : ""}Entra con este enlace y tu correo ${i.email}:\n${inviteLink(i.token)}\nEl enlace caduca en 14 días.`;
  }
  function showLinkDialog(i) {
    openDialog("Invitación para " + (i.full_name || i.email), `<p class="subtle" style="margin-top:0">Envíale este enlace. Al abrirlo entra con su correo <b>${esc(i.email)}</b> y queda dado de alta como ${ROLE[i.role].toLowerCase()}.</p>
      <div class="link-box">${esc(inviteLink(i.token))}</div>
      <div class="live-controls"><button class="button secondary small" id="l-copy">Copiar enlace</button><a class="button small" target="_blank" rel="noopener" href="${whatsappMessage(inviteText(i))}">Enviar por WhatsApp</a><a class="button secondary small" href="mailto:${esc(i.email)}?subject=${encodeURIComponent("Alta en el campus " + Campus.cfg.brand)}&body=${encodeURIComponent(inviteText(i))}">Enviar por correo</a></div>`, d => d.querySelector("#l-copy").addEventListener("click", () => copy(inviteLink(i.token))));
  }
  const genPw = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; let p = ""; for (let i = 0; i < 8; i++) p += a[Math.floor(Math.random() * a.length)]; return p; };
  function accessText(name, email, pw) { return `Hola${name ? " " + name.split(" ")[0] : ""}, ya tienes acceso al campus ${Campus.cfg.brand}.\nEntra en: ${baseUrl()}entrar.html (pestaña «Contraseña»)\nCorreo: ${email}\nContraseña: ${pw}\nPuedes cambiarla en «Mi perfil» cuando quieras.`; }
  function newMemberDialog() {
    dialog.classList.add("side-panel"); dialog.addEventListener("close", () => dialog.classList.remove("side-panel"), { once: true });
    openDialog("Dar de alta a alguien", `<p class="subtle" style="margin-top:0">Alumno, maestro o coordinación: se crea el usuario al momento con su contraseña inicial. Se la pasas por WhatsApp y podrá cambiarla en «Mi perfil».</p><div class="inline-form">
      <div class="row"><div class="field"><label for="n-name">Nombre y apellido</label><input id="n-name"></div><div class="field"><label for="n-email">Correo</label><input id="n-email" type="email"></div></div>
      <div class="row"><div class="field"><label for="n-phone">Teléfono (WhatsApp)</label><input id="n-phone" placeholder="+34 …"></div><div class="field"><label for="n-role">Rol</label><select id="n-role"><option value="student">Alumno/a</option><option value="teacher" selected>Maestro/a</option><option value="coordinator">Coordinación</option></select></div></div>
      <div class="field"><label for="n-group">Grupo (opcional)</label><select id="n-group"><option value="">Sin grupo por ahora</option>${S.groups.map(g => `<option value="${g.id}">${esc(g.name)}${g.teacher_id ? "" : " · sin maestro"}</option>`).join("")}</select></div>
      <div class="field"><label for="n-pw">Contraseña inicial</label><div style="display:flex;gap:6px"><input id="n-pw" value="${genPw()}" style="flex:1"><button class="button secondary small" id="n-gen" type="button">Generar</button></div></div>
      <p class="form-error" id="n-err"></p>
      <div class="live-controls"><button class="button secondary" id="n-cancel">Cancelar</button><button class="button teal" id="n-go">Crear acceso</button></div></div>`, d => {
      d.querySelector("#n-cancel").addEventListener("click", () => dialog.close());
      d.querySelector("#n-gen").addEventListener("click", () => d.querySelector("#n-pw").value = genPw());
      d.querySelector("#n-go").addEventListener("click", async () => {
        const err = d.querySelector("#n-err"); const email = d.querySelector("#n-email").value.trim().toLowerCase(), name = d.querySelector("#n-name").value.trim(), pw = d.querySelector("#n-pw").value;
        if (!name) { err.textContent = "Escribe el nombre."; return; } if (!email.includes("@")) { err.textContent = "Escribe un correo válido."; return; } if (pw.length < 6) { err.textContent = "Contraseña de al menos 6 caracteres."; return; }
        d.querySelector("#n-go").disabled = true;
        const role = d.querySelector("#n-role").value;
        const { data: newId, error } = await sb.rpc("create_staff_user", { p_email: email, p_password: pw, p_name: name, p_role: role, p_phone: d.querySelector("#n-phone").value.trim() || null, p_group: d.querySelector("#n-group").value || null });
        d.querySelector("#n-go").disabled = false;
        if (error) { err.textContent = error.message; return; }
        if (newId) { const r = await sb.from("profiles").update({ role, active: true, full_name: name }).eq("id", newId); if (r.error) toast("Aviso: no se pudo fijar el rol: " + r.error.message); }
        dialog.close(); S.students = null; if (role === "student") S.tab = "students"; await load();
        openDialog("Acceso creado", `<p class="subtle" style="margin-top:0">Pásale estos datos. Podrá cambiar la contraseña en «Mi perfil».</p><div class="link-box">${esc(accessText(name, email, pw)).replace(/\n/g, "<br>")}</div><div class="live-controls"><button class="button secondary small" id="a-copy">Copiar datos</button><a class="button small" target="_blank" rel="noopener" href="${whatsappMessage(accessText(name, email, pw))}">Enviar por WhatsApp</a></div>`, dd => dd.querySelector("#a-copy").addEventListener("click", () => copy(accessText(name, email, pw))));
      });
    });
  }
  function deletePersonDialog(p, isStudent) {
    if (!p) return;
    openDialog("Eliminar a " + (p.full_name || p.name || ""), `<p class="subtle" style="margin-top:0">Se borra del campus <b>para siempre</b>: su cuenta, sus respuestas, su asistencia y su pertenencia a los grupos. ${isStudent ? "" : "Si llevaba algún grupo, el grupo quedará sin maestro."}</p>
      <p class="notice">¿Va a volver más adelante? Mejor <b>Desactivar</b>: deja de entrar pero se conserva todo.</p>
      <div class="field"><label for="dp-x">Escribe BORRAR para confirmar</label><input id="dp-x" autocomplete="off"></div>
      <p class="form-error" id="dp-err"></p>
      <div class="live-controls"><button class="button secondary" id="dp-cancel">Cancelar</button><button class="button danger" id="dp-go">Eliminar del campus</button></div>`, d => {
      d.querySelector("#dp-cancel").addEventListener("click", () => dialog.close());
      d.querySelector("#dp-go").addEventListener("click", async () => {
        if (d.querySelector("#dp-x").value.trim().toUpperCase() !== "BORRAR") { d.querySelector("#dp-err").textContent = "Escribe BORRAR para confirmar."; return; }
        d.querySelector("#dp-go").disabled = true;
        const { error } = await sb.rpc("delete_person", { p_user: p.id });
        d.querySelector("#dp-go").disabled = false;
        if (error) { d.querySelector("#dp-err").textContent = error.message; return; }
        dialog.close(); toast("Eliminado del campus"); S.students = null; load();
      });
    });
  }
  function passwordDialog(p) {
    openDialog("Contraseña de " + p.full_name, `<p class="subtle" style="margin-top:0">Pon una contraseña nueva y pásasela. Podrá cambiarla en «Mi perfil».</p><div class="inline-form"><div class="field"><label for="pw-new">Nueva contraseña</label><div style="display:flex;gap:6px"><input id="pw-new" value="${genPw()}" style="flex:1"><button class="button secondary small" id="pw-gen" type="button">Generar</button></div></div><p class="form-error" id="pw-err"></p><div class="live-controls"><button class="button" id="pw-go">Guardar</button></div></div>`, d => {
      d.querySelector("#pw-gen").addEventListener("click", () => d.querySelector("#pw-new").value = genPw());
      d.querySelector("#pw-go").addEventListener("click", async () => { const pw = d.querySelector("#pw-new").value; const { error } = await sb.rpc("reset_staff_password", { p_user: p.id, p_password: pw }); if (error) { d.querySelector("#pw-err").textContent = error.message; return; } dialog.close(); openDialog("Contraseña cambiada", `<div class="link-box">${esc(accessText(p.full_name, p.email || "", pw)).replace(/\n/g, "<br>")}</div><div class="live-controls"><button class="button secondary small" id="a-copy">Copiar datos</button>${p.phone ? `<a class="button small" target="_blank" rel="noopener" href="${whatsappMessage(accessText(p.full_name, p.email || "", pw))}">Enviar por WhatsApp</a>` : ""}</div>`, dd => dd.querySelector("#a-copy").addEventListener("click", () => copy(accessText(p.full_name, p.email || "", pw)))); });
    });
  }
  function inviteDialog() {
    dialog.classList.add("side-panel"); dialog.addEventListener("close", () => dialog.classList.remove("side-panel"), { once: true });
    openDialog("Invitar a alguien", `<p class="subtle" style="margin-top:0">Recibirá un enlace; al abrirlo entra con su correo y ya tiene su rol. Sin contraseñas que enviar.</p><div class="inline-form">
      <div class="row"><div class="field"><label for="i-name">Nombre y apellido</label><input id="i-name"></div><div class="field"><label for="i-email">Correo</label><input id="i-email" type="email"></div></div>
      <div class="row"><div class="field"><label for="i-role">Rol</label><select id="i-role"><option value="teacher">Maestro/a</option><option value="coordinator">Coordinación</option></select></div><div class="field"><label for="i-group">Grupo (opcional)</label><select id="i-group"><option value="">Sin grupo por ahora</option>${S.groups.map(g => `<option value="${g.id}">${esc(g.name)}${g.teacher_id ? "" : " · sin maestro"}</option>`).join("")}</select></div></div>
      <div class="field"><label for="i-msg">Mensaje (opcional)</label><input id="i-msg" placeholder="Bienvenida al equipo"></div>
      <p class="form-error" id="i-err"></p><div class="live-controls"><button class="button secondary" id="i-cancel">Cancelar</button><button class="button teal" id="i-go">Invitar</button></div></div>`, d => { d.querySelector("#i-cancel").addEventListener("click", () => dialog.close()); d.querySelector("#i-go").addEventListener("click", async () => {
      const email = d.querySelector("#i-email").value.trim().toLowerCase(), name = d.querySelector("#i-name").value.trim(); const err = d.querySelector("#i-err");
      if (!email.includes("@")) { err.textContent = "Escribe un correo válido."; return; }
      if (S.staff.some(p => (p.email || "").toLowerCase() === email && p.active)) { err.textContent = "Esa persona ya está en el equipo."; return; }
      const { data: t, error } = await sb.rpc("invite_staff", { p_email: email, p_name: name, p_role: d.querySelector("#i-role").value, p_group: d.querySelector("#i-group").value || null, p_message: d.querySelector("#i-msg").value.trim() || null });
      if (error) { err.textContent = error.message; return; }
      await load(); const i = S.invites.find(x => x.token === t); S.tab = "invites"; render(); if (i) showLinkDialog(i);
    }); });
  }
  function roleDialog(p) {
    openDialog("Rol de " + p.full_name, `<div class="inline-form"><div class="field"><label for="r-role">Rol</label><select id="r-role"><option value="teacher" ${p.role === "teacher" ? "selected" : ""}>Maestro/a</option><option value="coordinator" ${p.role === "coordinator" ? "selected" : ""}>Coordinación</option></select></div><p class="meta">Coordinación ve todos los grupos, invita al equipo y cambia roles.</p><button class="button" id="r-go">Guardar</button></div>`, d => d.querySelector("#r-go").addEventListener("click", async () => { const { error } = await sb.from("profiles").update({ role: d.querySelector("#r-role").value }).eq("id", p.id); if (error) toast(error.message); dialog.close(); load(); }));
  }
  function groupsDialog(p) {
    openDialog("Grupos de " + p.full_name, `<p class="subtle" style="margin-top:0">Marca los grupos que lleva. Un grupo solo tiene un maestro responsable.</p><ul class="members">${S.groups.map(g => { const mine = g.teacher_id === p.id, other = g.teacher_id && !mine ? S.staff.find(x => x.id === g.teacher_id) : null; return `<li><span style="flex:1"><span class="dots" style="display:inline-flex;margin-right:6px;vertical-align:middle"><i style="width:10px;height:10px;border-radius:50%;display:inline-block;background:${gcolor(g)}"></i></span>${esc(g.name)}<br><small class="meta">${mine ? "Lo lleva" : other ? "Lo lleva " + esc(other.full_name) : "Sin maestro"}</small></span><button class="button ${mine ? "" : "secondary"} small" data-g="${g.id}">${mine ? "Quitar" : "Asignar"}</button></li>`; }).join("")}</ul>`, d => d.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", async () => {
      const g = S.groups.find(x => x.id === b.dataset.g);
      if (g.teacher_id === p.id) { await sb.from("groups").update({ teacher_id: null }).eq("id", g.id); await sb.from("memberships").delete().match({ group_id: g.id, user_id: p.id, role: "teacher" }); }
      else { if (g.teacher_id && !confirm(`${g.name} ya lo lleva otra persona. ¿Cambiarlo a ${p.full_name}?`)) return; await sb.from("groups").update({ teacher_id: p.id }).eq("id", g.id); if (g.teacher_id) await sb.from("memberships").delete().match({ group_id: g.id, user_id: g.teacher_id, role: "teacher" }); await sb.from("memberships").upsert({ group_id: g.id, user_id: p.id, role: "teacher" }, { onConflict: "group_id,user_id" }); }
      dialog.close(); toast("Grupos actualizados"); load();
    })));
  }

  async function renderCourses() {
    const body = app.querySelector("#body"); body.innerHTML = `<p class="meta" style="padding:16px">Cargando…</p>`;
    const [{ data: rows, error }, { data: qs }] = await Promise.all([sb.rpc("course_students"), sb.from("course_questions").select("*, course:courses(title), author:profiles(full_name)").is("answer", null).order("created_at")]);
    if (error) { body.innerHTML = `<p class="notice">${esc(error.message)}. ¿Se ejecutó el parche de cursos?</p>`; return; }
    const list = rows || [];
    body.innerHTML = `<div style="padding:10px 14px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="search" id="cs-q" placeholder="Buscar por nombre, correo o curso…" style="flex:1;min-width:200px"><button class="button secondary small" id="cs-csv">Exportar CSV</button></div>
      ${(qs || []).length ? `<div style="padding:12px 14px"><h3 style="font-family:Georgia,serif;font-size:1rem;margin:0 0 6px">Preguntas sin responder (${qs.length})</h3>${qs.map(q => `<div class="qa" style="display:flex;gap:8px;align-items:flex-start"><div style="flex:1"><b>${esc(q.author?.full_name || "")}</b> · <span class="meta">${esc(q.course?.title || "")}</span><br>${esc(q.text)}</div><button class="button secondary small" data-reply="${q.id}">Responder</button></div>`).join("")}</div>` : ""}
      <table id="cs-table"><tr><th>Alumno</th><th>Curso</th><th>Progreso</th><th>Plazo</th><th>Estado</th></tr>${list.map(r => `<tr data-row="${esc((r.full_name + " " + r.email + " " + r.course_title).toLowerCase())}"><td><div class="who"><span class="avatar teal">${esc(initials(r.full_name))}</span><span><b>${esc(r.full_name)}</b><small>${esc(r.email || "")}${r.phone ? " · " + esc(r.phone) : ""}</small></span></div></td><td>${esc(r.course_title)}</td><td>${r.done}/${r.total}</td><td>${r.ends_at ? fmtDate(r.ends_at, { day: "numeric", month: "short" }) : "—"}</td><td>${r.completed_at ? `<span class="tag">Terminado</span>` : new Date(r.ends_at) < Date.now() ? `<span class="tag closed">Plazo pasado</span>` : `<span class="tag" style="background:#e6eefc;color:#1d4ed8">En curso</span>`}</td></tr>`).join("") || `<tr><td colspan="5" class="meta">Nadie apuntado todavía.</td></tr>`}</table>`;
    body.querySelector("#cs-q").addEventListener("input", e => { const q = e.target.value.toLowerCase(); body.querySelectorAll("[data-row]").forEach(tr => tr.hidden = q && !tr.dataset.row.includes(q)); });
    body.querySelector("#cs-csv").addEventListener("click", () => { const csv = ["Nombre;Correo;Teléfono;Curso;Hechas;Total;Inicio;Fin;Terminado"].concat(list.map(r => [r.full_name, r.email, r.phone, r.course_title, r.done, r.total, r.started_at?.slice(0, 10), r.ends_at?.slice(0, 10), r.completed_at ? "sí" : "no"].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = "alumnos-cursos-libres.csv"; a.click(); });
    body.querySelectorAll("[data-reply]").forEach(b => b.addEventListener("click", () => { const q = (qs || []).find(x => x.id === b.dataset.reply); openDialog("Responder a " + (q.author?.full_name || ""), `<p class="subtle" style="margin-top:0">${esc(q.text)}</p><textarea id="rp" rows="4" style="width:100%"></textarea><div class="live-controls"><button class="button" id="rp-go">Enviar</button></div>`, d => d.querySelector("#rp-go").addEventListener("click", async () => { const { error } = await sb.from("course_questions").update({ answer: d.querySelector("#rp").value.trim(), answered_by: me.user.id, answered_at: new Date().toISOString() }).eq("id", q.id); if (error) toast(error.message); dialog.close(); renderCourses(); })); }));
  }
  async function renderStudents() {
    const body = app.querySelector("#body");
    if (!S.students) {
      body.innerHTML = `<p class="meta" style="padding:16px">Cargando…</p>`;
      const ids = [...new Set(S.groups.flatMap(g => g.memberships.filter(m => m.role !== "teacher").map(m => m.user_id)))];
      const rows = {}; ids.forEach(id => rows[id] = { id, groups: [], guest: false, last: null });
      S.groups.forEach(g => g.memberships.forEach(m => { if (m.role === "teacher") return; rows[m.user_id].groups.push(g); if (m.role === "guest") rows[m.user_id].guest = true; }));
      if (ids.length) { const p = await sb.from("profiles").select("id, full_name, email").in("id", ids); (p.data || []).forEach(x => { rows[x.id].name = x.full_name; rows[x.id].email = x.email; }); }
      for (const g of S.groups) { const r = await sb.rpc("last_attendance", { p_group: g.id }); (r.data || []).forEach(x => { if (rows[x.user_id] && (!rows[x.user_id].last || new Date(x.last_at) > new Date(rows[x.user_id].last))) rows[x.user_id].last = x.last_at; }); }
      S.students = Object.values(rows).sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
    }
    const q = S.q.toLowerCase(); const list = S.students.filter(s => !q || (s.name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q) || s.groups.some(g => g.name.toLowerCase().includes(q)));
    body.innerHTML = `<div style="padding:10px 14px 0"><input type="search" id="st-q" placeholder="Buscar por nombre, correo o grupo…" value="${esc(S.q)}" style="width:100%"></div>
      <table><tr><th>Nombre</th><th>Grupos</th><th>Tipo</th><th>Última asistencia</th><th></th></tr>${list.slice(0, 300).map(s => `<tr><td><div class="who"><span class="avatar teal">${esc(initials(s.name))}</span><span><b>${esc(s.name || "—")}</b><small>${esc(s.email || "")}</small></span></div></td><td class="groups">${s.groups.map(g => `<span style="--gc:${gcolor(g)}">${esc(g.name)}</span>`).join("")}</td><td>${s.guest ? `<span class="tag" style="background:#faf0d6;color:#7a5c14">Invitado</span>` : `<span class="tag">Cuenta</span>`}</td><td>${s.last ? fmtDate(s.last, { day: "numeric", month: "short" }) : "—"}</td><td><div class="acts">${!s.guest ? `<button data-promote="${s.id}">Hacer maestro</button>` : ""}<button class="danger" data-del-student="${s.id}">🗑 Eliminar</button></div></td></tr>`).join("") || `<tr><td colspan="5" class="meta">Nadie con ese nombre.</td></tr>`}</table>`;
    const inp = body.querySelector("#st-q"); inp.addEventListener("input", e => { S.q = e.target.value; renderStudents(); const el = body.querySelector("#st-q"); el.focus(); el.setSelectionRange(S.q.length, S.q.length); });
    body.querySelectorAll("[data-del-student]").forEach(b => b.addEventListener("click", () => { const s2 = S.students.find(x => x.id === b.dataset.delStudent); deletePersonDialog({ id: s2.id, full_name: s2.name }, true); }));
    body.querySelectorAll("[data-promote]").forEach(b => b.addEventListener("click", async () => { const s = S.students.find(x => x.id === b.dataset.promote); if (!confirm(`¿Hacer maestro/a a ${s.name}? Podrá crear y dar clases.`)) return; const { error } = await sb.from("profiles").update({ role: "teacher", active: true }).eq("id", s.id); if (error) { toast(error.message); return; } toast(s.name + " ya es maestro/a"); S.students = null; S.tab = "staff"; load(); }));
  }

  await load();
  document.getElementById("loading").hidden = true; app.hidden = false;
  if (new URLSearchParams(location.search).get("nuevo")) newMemberDialog();
})();
