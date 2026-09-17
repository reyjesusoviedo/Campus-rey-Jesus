(async () => {
  const { sb, esc, toast, requireUser, renderShell, loadSettings, cfg } = Campus;
  const me = await requireUser();
  renderShell(me, "ajustes");
  const app = document.getElementById("app"), dialog = document.getElementById("dialog");
  document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
  function openDialog(title, html, onMount) { document.getElementById("dialog-title").textContent = title; document.getElementById("dialog-body").innerHTML = html; dialog.showModal(); onMount && onMount(dialog); }
  if (me.profile.role !== "coordinator") { app.innerHTML = `<div class="lib-empty"><h2>Solo coordinación</h2><a class="button" href="escritorio.html">Volver</a></div>`; document.getElementById("loading").hidden = true; app.hidden = false; return; }

  const S = { st: {}, courses: [], groups: [], lib: [], staff: [] };
  async function load() {
    const [st, c, g, l, p] = await Promise.all([
      sb.from("settings").select("*").eq("id", 1).maybeSingle(),
      sb.from("courses").select("*").order("position").order("created_at"),
      sb.from("groups").select("id, name, schedule_text").order("name"),
      sb.from("library_items").select("id, title, folder, kind, storage_path").order("folder").order("title"),
      sb.from("profiles").select("id, full_name").in("role", ["teacher", "coordinator"]).eq("active", true).order("full_name")
    ]);
    if (st.error) { app.innerHTML = `<p class="notice">Falta el parche de cursos en Supabase: ${esc(st.error.message)}</p>`; return; }
    S.st = st.data || {}; cfg.heroCurrent = S.st.hero_image ? "foto subida" : ""; S.courses = c.data || []; S.groups = g.data || []; S.lib = (l.data || []).filter(i => i.kind !== "file" || /\.html?$|\.pdf$/i.test(i.storage_path || "")); S.staff = p.data || [];
    render();
  }
  const F = (id, label, val, opts = {}) => `<div class="field"><label for="${id}">${label}</label>${opts.area ? `<textarea id="${id}" rows="${opts.rows || 2}">${esc(val || "")}</textarea>` : `<input id="${id}" value="${esc(val ?? "")}" ${opts.type ? `type="${opts.type}"` : ""} ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ""}>`}${opts.help ? `<small class="meta">${opts.help}</small>` : ""}</div>`;

  function render() {
    const st = S.st;
    app.innerHTML = `
      <div class="esc-top"><div><h1>Ajustes</h1><p>Datos del campus, ayuda, página de inicio y cursos. Los cambios se aplican en todo el campus.</p></div></div>
      <div class="esc-grid no-teachers" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start">
        <div class="esc-card"><h3>Identidad</h3><div class="inline-form">
          ${F("s-ministry", "Nombre del ministerio", st.ministry_name)}
          <div class="row">${F("s-brand", "Marca corta (cabeceras)", st.brand_name)}${F("s-short", "Iniciales (si no hay logo)", st.brand_short)}</div>
          <div class="row">${F("s-tag", "Lema bajo el nombre", st.tagline)}${F("s-city", "Ciudad", st.city)}</div>
          <div class="field"><label for="s-logo">Logo (PNG o JPG, cuadrado)</label><div style="display:flex;gap:10px;align-items:center">${cfg.logoUrl ? `<img src="${cfg.logoUrl}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;background:#fff;border:1px solid var(--line)">` : `<span class="brand-mark">${esc(st.brand_short || "RJ")}</span>`}<input id="s-logo" type="file" accept="image/png,image/jpeg,image/webp"></div></div>
        </div></div>
        <div class="esc-card"><h3>Ayuda y avisos</h3><div class="inline-form">
          ${F("s-wa", "WhatsApp de ayuda", st.help_whatsapp, { ph: "34600000000", help: "Con prefijo de país, sin espacios ni +. Aparece en la página de inicio y en «Mi curso»." })}
          ${F("s-mail", "Correo de ayuda", st.help_email, { type: "email", ph: "ayuda@…" })}
          ${F("s-review", "Días de repaso tras terminar un curso", st.review_days, { type: "number", help: "Pasados estos días desde el fin del curso, la inscripción se borra." })}
          ${F("s-welcome", "Mensaje de bienvenida al alumno", st.welcome_text, { area: true })}
        </div></div>
        <div class="esc-card" style="grid-column:1/-1"><h3>Portada</h3><div class="inline-form">
          <div class="row">${F("s-motto", "Lema bajo el nombre (cabecera de la portada)", st.motto)}${F("s-heroimg", "Foto de portada (JPG/PNG, 1600×800 aprox., personas a la derecha)", "", { type: "file", help: cfg.heroCurrent ? "Actual: " + cfg.heroCurrent : "Actual: imagen provisional" })}</div>
          <div class="row">${F("s-h1", "Titular · línea 1 (blanco)", st.hero_line1)}${F("s-h2", "Titular · línea 2 (azul claro)", st.hero_line2)}</div>
          ${F("s-hsub", "Subtítulo", st.hero_sub)}
          ${F("s-points", "Tres ventajas bajo los botones (una por línea)", (st.hero_points || []).join("\n"), { area: true, rows: 3 })}
          ${F("s-values", "Franja de valores: tres líneas con formato Título | Texto", (st.values_strip || []).map(v => (v.title || "") + " | " + (v.text || "")).join("\n"), { area: true, rows: 3 })}
          <div class="row">${F("s-quote", "Cita del pie", st.footer_quote)}${F("s-ftag", "Frase final del pie", st.footer_tag)}</div>
          <div class="row">${F("s-yt", "YouTube (enlace)", st.social?.youtube)}${F("s-ig", "Instagram (enlace)", st.social?.instagram)}</div>
          <div class="row">${F("s-fb", "Facebook (enlace)", st.social?.facebook)}${F("s-menu", "Menú: una línea por entrada, formato Nombre | enlace | activo o proximamente", (st.menu || []).map(m => `${m.label} | ${m.href || ""} | ${m.state === "active" ? "activo" : "proximamente"}`).join("\n"), { area: true, rows: 4, help: "Ejemplos: «Inicio | index.html | activo», «Recursos | | proximamente». WhatsApp del pie = WhatsApp de ayuda." })}</div>
          <div class="live-controls"><button class="button" id="s-save">Guardar ajustes</button><a class="button secondary" href="index.html" target="_blank">Ver la portada</a><span class="meta" id="s-st"></span></div>
        </div></div>
      </div>
      <div class="esc-card" style="margin-top:12px"><h3>Cursos <span class="lk" id="c-new">+ Nuevo curso</span></h3>
        ${S.courses.length ? `<table class="stable"><tr><th>Curso</th><th>Tipo</th><th>Lecciones</th><th>Duración</th><th>Visible</th><th></th></tr>${S.courses.map(c => `<tr><td><b>${esc(c.title)}</b><br><small class="meta">index.html · ${esc(c.slug)}</small></td><td>${c.type === "live" ? "En directo · " + esc(S.groups.find(g => g.id === c.group_id)?.name || "sin grupo") : "A tu ritmo"}</td><td>${(c.lessons || []).length}</td><td>${c.duration_days} días</td><td>${c.open ? `<span class="tag">Sí</span>` : `<span class="tag closed">No</span>`}</td><td><div class="acts"><button data-edit="${c.id}">Editar</button><button data-copy="${c.slug}">Copiar enlace</button><button data-del="${c.id}">Borrar</button></div></td></tr>`).join("")}</table>` : `<p class="subtle">Aún no hay cursos. Crea el primero: elige el tipo, las lecciones de la biblioteca y la duración.</p>`}
        <p class="meta" style="margin-top:10px"><button class="button secondary small" id="cleanup">Borrar inscripciones caducadas ahora</button></p></div>`;
    app.querySelector("#s-save").addEventListener("click", saveSettings);
    app.querySelector("#c-new").addEventListener("click", () => courseDialog(null));
    app.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => courseDialog(S.courses.find(c => c.id === b.dataset.edit))));
    app.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => Campus.copy(location.href.replace(/[^/]*$/, "entrar.html?curso=" + b.dataset.copy))));
    app.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => { const c = S.courses.find(x => x.id === b.dataset.del); if (prompt(`Vas a borrar el curso «${c.title}» y todas sus inscripciones. Escribe BORRAR para confirmar:`) !== "BORRAR") return; await sb.from("courses").delete().eq("id", c.id); toast("Curso borrado"); load(); }));
    app.querySelector("#cleanup").addEventListener("click", async () => { const { data, error } = await sb.rpc("cleanup_enrollments"); if (error) toast(error.message); else toast(`${data} inscripciones borradas`); });
  }

  async function saveSettings() {
    const g = id => app.querySelector("#" + id).value.trim();
    const lines = id => g(id).split("\n").map(x => x.trim()).filter(Boolean);
    const row = { ministry_name: g("s-ministry"), brand_name: g("s-brand"), brand_short: g("s-short") || "RJ", tagline: g("s-tag"), city: g("s-city") || null, help_whatsapp: g("s-wa").replace(/\D/g, "") || null, help_email: g("s-mail") || null, review_days: Number(g("s-review")) || 90, welcome_text: g("s-welcome"), updated_at: new Date().toISOString(),
      motto: g("s-motto"), hero_line1: g("s-h1"), hero_line2: g("s-h2"), hero_sub: g("s-hsub"), hero_points: lines("s-points"),
      values_strip: lines("s-values").map((l, i) => { const [t, x] = l.split("|").map(v => v.trim()); return { icon: ["clock", "people", "doc"][i % 3], title: t || "", text: x || "" }; }),
      footer_quote: g("s-quote"), footer_tag: g("s-ftag"), social: { youtube: g("s-yt") || "", instagram: g("s-ig") || "", facebook: g("s-fb") || "", whatsapp: g("s-wa").replace(/\D/g, "") || "" },
      menu: lines("s-menu").map(l => { const [label, href, state] = l.split("|").map(v => (v || "").trim()); return { label, href, state: /^activo/i.test(state || "") ? "active" : "soon" }; }) };
    const hf = app.querySelector("#s-heroimg").files[0];
    if (hf) { const path = "portada-" + Date.now() + "." + (hf.name.split(".").pop() || "jpg"); const { error } = await sb.storage.from("public").upload(path, hf, { upsert: true }); if (error) { toast("No se pudo subir la foto: " + error.message); return; } row.hero_image = path; }
    const f = app.querySelector("#s-logo").files[0];
    if (f) { const path = "logo-" + Date.now() + "." + (f.name.split(".").pop() || "png"); const { error } = await sb.storage.from("public").upload(path, f, { upsert: true }); if (error) { toast("No se pudo subir el logo: " + error.message); return; } row.logo_path = path; }
    const { error } = await sb.from("settings").update(row).eq("id", 1);
    if (error) { toast("No se pudo guardar: " + error.message); return; }
    app.querySelector("#s-st").textContent = "Guardado ✓"; toast("Ajustes guardados"); setTimeout(() => location.reload(), 600);
  }

  function courseDialog(c) {
    const lessons = c?.lessons || [];
    openDialog(c ? "Editar curso" : "Nuevo curso", `<div class="inline-form">
      <div class="row">${F("c-title", "Título", c?.title)}${F("c-slug", "Enlace corto (sin espacios)", c?.slug, { ph: "fundamentos-oracion" })}</div>
      <div class="row"><div class="field"><label for="c-icon">Icono de la tarjeta</label><select id="c-icon">${["book", "chat", "people", "megaphone", "cross", "heart", "star", "globe"].map(k => `<option value="${k}" ${(c?.icon || "book") === k ? "selected" : ""}>${{ book: "Libro", chat: "Conversación", people: "Personas", megaphone: "Megáfono", cross: "Cruz", heart: "Corazón", star: "Estrella", globe: "Mundo" }[k]}</option>`).join("")}</select></div>
        <div class="field"><label for="c-level">Nivel</label><select id="c-level">${["Nivel básico", "Nivel medio", "Nivel avanzado"].map(l => `<option ${(c?.level || "Nivel básico") === l ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
      ${F("c-short", "Descripción corta (tarjeta de la portada, una o dos frases)", c?.short_desc)}
      ${F("c-aud", "Para quién es (una línea)", c?.audience, { ph: "Para quien acaba de empezar" })}
      ${F("c-desc", "Descripción", c?.description, { area: true })}
      <div class="row"><div class="field"><label for="c-type">Tipo</label><select id="c-type"><option value="self" ${c?.type !== "live" ? "selected" : ""}>A tu ritmo (lecciones cuando quieras)</option><option value="live" ${c?.type === "live" ? "selected" : ""}>Con clases en directo (grupo)</option></select></div>
        <div class="field" id="c-group-f"><label for="c-group">Grupo</label><select id="c-group"><option value="">—</option>${S.groups.map(g => `<option value="${g.id}" ${c?.group_id === g.id ? "selected" : ""}>${esc(g.name)}${g.schedule_text ? " · " + esc(g.schedule_text) : ""}</option>`).join("")}</select></div></div>
      <div class="row">${F("c-days", "Duración (días)", c?.duration_days ?? 60, { type: "number" })}<div class="field"><label for="c-contact">Quien responde las preguntas</label><select id="c-contact"><option value="">Coordinación</option>${S.staff.map(p => `<option value="${p.id}" ${c?.contact_id === p.id ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}</select></div></div>
      <div class="field"><label>Lecciones, en orden (marca y usa las flechas)</label><div id="c-lessons" class="sess-pick" style="max-height:240px">${lessons.map((l, i) => lessonRow(l, i)).join("")}</div>
        <div style="display:flex;gap:6px;margin-top:6px"><select id="c-add" style="flex:1"><option value="">Añadir lección de la biblioteca…</option>${S.lib.map(i => `<option value="${i.id}">${esc(i.folder)} · ${esc(i.title)}</option>`).join("")}</select><button class="button secondary small" id="c-add-go">Añadir</button></div></div>
      ${F("c-cert", "Texto del certificado", c?.certificate_text || "ha completado satisfactoriamente el curso")}
      <label style="font-size:14px"><input type="checkbox" id="c-open" ${c ? (c.open ? "checked" : "") : "checked"}> Visible en la página de inicio</label>
      <p class="form-error" id="c-err"></p><button class="button" id="c-save">${c ? "Guardar" : "Crear curso"}</button></div>`, d => {
      const cur = [...lessons];
      const redraw = () => { d.querySelector("#c-lessons").innerHTML = cur.map((l, i) => lessonRow(l, i)).join("") || `<li><span class="meta">Sin lecciones todavía.</span></li>`; d.querySelectorAll("[data-up]").forEach(b => b.addEventListener("click", () => { const i = Number(b.dataset.up); if (i > 0) { [cur[i - 1], cur[i]] = [cur[i], cur[i - 1]]; redraw(); } })); d.querySelectorAll("[data-down]").forEach(b => b.addEventListener("click", () => { const i = Number(b.dataset.down); if (i < cur.length - 1) { [cur[i + 1], cur[i]] = [cur[i], cur[i + 1]]; redraw(); } })); d.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { cur.splice(Number(b.dataset.rm), 1); redraw(); })); d.querySelectorAll("[data-ttl]").forEach(inp => inp.addEventListener("input", () => { cur[Number(inp.dataset.ttl)].title = inp.value; })); };
      redraw();
      d.querySelector("#c-add-go").addEventListener("click", () => { const id = d.querySelector("#c-add").value; const it = S.lib.find(x => x.id === id); if (!it) return; cur.push({ library_item_id: it.id, title: it.title }); redraw(); });
      const tp = d.querySelector("#c-type"); const u = () => d.querySelector("#c-group-f").hidden = tp.value !== "live"; tp.addEventListener("change", u); u();
      d.querySelector("#c-title").addEventListener("input", e => { if (!c) d.querySelector("#c-slug").value = e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); });
      d.querySelector("#c-save").addEventListener("click", async () => {
        const err = d.querySelector("#c-err"); const g = id => d.querySelector("#" + id).value.trim();
        const row = { title: g("c-title"), slug: g("c-slug"), audience: g("c-aud") || null, icon: g("c-icon") || "book", level: g("c-level") || "Nivel básico", short_desc: g("c-short") || null, description: g("c-desc") || null, type: tp.value, group_id: tp.value === "live" ? (g("c-group") || null) : null, duration_days: Number(g("c-days")) || 60, contact_id: g("c-contact") || null, lessons: cur, certificate_text: g("c-cert") || null, open: d.querySelector("#c-open").checked, updated_at: new Date().toISOString() };
        if (!row.title || !row.slug) { err.textContent = "Título y enlace corto son obligatorios."; return; }
        if (row.type === "live" && !row.group_id) { err.textContent = "Elige el grupo del curso en directo."; return; }
        const r = c ? await sb.from("courses").update(row).eq("id", c.id) : await sb.from("courses").insert({ ...row, created_by: me.user.id, position: S.courses.length });
        if (r.error) { err.textContent = r.error.message.includes("slug") ? "Ese enlace corto ya existe." : r.error.message; return; }
        dialog.close(); toast(c ? "Curso guardado" : "Curso creado"); load();
      });
    });
  }
  const lessonRow = (l, i) => { const it = S.lib.find(x => x.id === l.library_item_id); return `<li><b style="flex:none;min-width:22px">${i + 1}</b><input data-ttl="${i}" value="${esc(l.title || it?.title || "")}" style="flex:1;min-width:0"><small class="meta" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it?.folder || "")}</small><button class="icon-button" data-up="${i}">↑</button><button class="icon-button" data-down="${i}">↓</button><button class="icon-button" data-rm="${i}">✕</button></li>`; };

  await load();
  document.getElementById("loading").hidden = true; app.hidden = false;
})();
