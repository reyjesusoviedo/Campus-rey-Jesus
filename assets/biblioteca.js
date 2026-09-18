(async () => {
  const { sb, esc, fmtDate, toast, requireUser, renderShell, copy } = Campus;
  const me = await requireUser();
  renderShell(me, "biblioteca"); if (window.Shell && ["coordinator", "teacher"].includes(me.profile.role)) Shell.render(me, "biblioteca", "Biblioteca");
  const staff = me.profile.role === "teacher" || me.profile.role === "coordinator";
  if (!staff) document.querySelectorAll("[data-staff-only]").forEach(a => a.remove());
  const app = document.getElementById("app"), dialog = document.getElementById("dialog");
  document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
  function openDialog(title, html, onMount) { document.getElementById("dialog-title").textContent = title; document.getElementById("dialog-body").innerHTML = html; dialog.showModal(); onMount && onMount(dialog); }
  if (!staff) { app.innerHTML = `<div class="lib-empty"><h2>La biblioteca es para maestros y coordinación</h2><p>El material de tus clases lo encuentras dentro de cada clase, en el botón «Material».</p></div>`; document.getElementById("loading").hidden = true; app.hidden = false; return; }

  const S = { items: [], folder: "Todo", q: "", names: {}, tpls: [], groups: [], courses: [], sessions: [], filter: "all" };
  const TYPES = [["leccion", "Lección interactiva"], ["lectura", "Lectura o texto"], ["presentacion", "Presentación"], ["video", "Vídeo"], ["audio", "Audio"], ["guia", "Guía o PDF"], ["imagen", "Imagen"], ["otro", "Otro"]];
  const TYPE_LABEL = Object.fromEntries(TYPES);
  const PURPOSE = { general: "General", group: "Grupo", course: "Curso", series: "Serie o tema" };
  const VIS = { private: "Solo yo", staff: "El equipo", campus: "Todo el campus" };
  const kindIcon = it => { const k = it.kind === "link" ? "link" : /\.html?$/i.test(it.storage_path || "") ? "html" : /\.pdf$/i.test(it.storage_path || "") ? "pdf" : /\.(png|jpe?g|gif|webp)$/i.test(it.storage_path || "") ? "img" : "txt"; return `<span class="ic ${k}" style="width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-size:10px;font-weight:800;color:#fff;background:${{ link: "#111", html: "#087f74", pdf: "#c2413f", img: "#7a5c14", txt: "#5b6673" }[k]}">${{ link: "WEB", html: "HTML", pdf: "PDF", img: "IMG", txt: "TXT" }[k]}</span>`; };
  const fmtSize = b => !b ? "" : b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " KB";

  async function load() {
    const [li, g, c, se, t] = await Promise.all([
      sb.rpc("library_list"),
      sb.from("groups").select("id, name").order("name"),
      sb.from("courses").select("id, title").order("title"),
      sb.from("sessions").select("id, title, starts_at, status, group_id").gte("starts_at", new Date(Date.now() - 2 * 86400e3).toISOString()).order("starts_at").limit(20),
      sb.from("templates").select("*").order("folder").order("title")
    ]);
    if (li.error) { app.innerHTML = `<p class="notice">No se pudo cargar la biblioteca: ${esc(li.error.message)}. ¿Se ejecutó el parche de material?</p>`; return; }
    S.items = li.data || []; S.groups = g.data || []; S.courses = c.data || []; S.sessions = se.data || []; S.tpls = t.data || [];
    S.items.forEach(i => { if (i.owner_name) S.names[i.owner_id] = i.owner_name; });
    render();
  }

  function render() {
    const folders = {}; S.items.forEach(i => folders[i.folder] = (folders[i.folder] || 0) + 1);
    const names = Object.keys(folders).sort((a, b) => a.localeCompare(b, "es"));
    const q = S.q.trim().toLowerCase();
    const list = S.items.filter(i => (S.folder === "Todo" || i.folder === S.folder)
      && (S.filter === "all" || (S.filter === "mine" && i.owner_id === me.user.id) || (S.filter === "group" && i.purpose === "group") || (S.filter === "course" && i.purpose === "course"))
      && (!q || (i.title + " " + (i.tags || []).join(" ") + " " + i.folder + " " + (i.owner_name || "") + " " + (i.group_name || "") + " " + (i.course_title || "") + " " + (i.description || "")).toLowerCase().includes(q)));
    app.innerHTML = `
      <header class="page-heading"><div><p class="eyebrow">${esc(Campus.cfg.brand)}</p><h1 style="margin:0;font-family:Georgia,serif">Biblioteca</h1><p class="subtle">Sube cada material una vez y añádelo a las clases que quieras.</p></div>
        <div class="comm-aux"><button class="button" id="lib-add">Subir material</button></div></header>
      ${tplSection()}
      <div class="lib">
        <aside><ul class="lib-folders">
          <li><button data-folder="Todo" aria-pressed="${S.folder === "Todo"}">📚 Todo <span class="n">${S.items.length}</span></button></li>
          ${names.map(f => `<li><button data-folder="${esc(f)}" aria-pressed="${S.folder === f}">📁 ${esc(f)} <span class="n">${folders[f]}</span></button></li>`).join("")}
        </ul></aside>
        <section>
          <div class="lib-tools"><input type="search" id="lib-q" placeholder="Buscar por título, autor, grupo o etiqueta…" value="${esc(S.q)}">
            <span class="lib-filters">${[["all", "Todo"], ["mine", "Mío"], ["group", "De grupos"], ["course", "De cursos"]].map(([k, l]) => `<button data-filter="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join("")}</span></div>
          ${list.length ? `<div class="lib-grid">${list.map(itemCard).join("")}</div>` : `<div class="lib-empty"><h2>${S.items.length ? "Nada con ese filtro" : "La biblioteca está vacía"}</h2><p>${S.items.length ? "Prueba con otra carpeta o búsqueda." : "Sube tu primera lección, PDF o enlace con «Subir material»."}</p></div>`}
        </section>
      </div>`;
    app.querySelectorAll("[data-folder]").forEach(b => b.addEventListener("click", () => { S.folder = b.dataset.folder; render(); }));
    app.querySelectorAll("[data-filter]").forEach(b => b.addEventListener("click", () => { S.filter = b.dataset.filter; render(); }));
    app.querySelector("#lib-q").addEventListener("input", e => { S.q = e.target.value; render(); app.querySelector("#lib-q").focus(); app.querySelector("#lib-q").setSelectionRange(S.q.length, S.q.length); });
    app.querySelector("#lib-add").addEventListener("click", () => editDialog(null));
    app.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openItem(S.items.find(i => i.id === b.dataset.open))));
    app.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editDialog(S.items.find(i => i.id === b.dataset.edit))));
    app.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => addToClassDialog(S.items.find(i => i.id === b.dataset.add))));
    app.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => delItem(S.items.find(i => i.id === b.dataset.del))));
    app.querySelectorAll("[data-tpl-del]").forEach(b => b.addEventListener("click", async () => { if (!confirm("¿Borrar esta plantilla? Las clases ya creadas no cambian.")) return; await sb.from("templates").delete().eq("id", b.dataset.tplDel); load(); }));
    app.querySelectorAll("[data-tpl-new]").forEach(b => b.addEventListener("click", async () => {
      const t = S.tpls.find(x => x.id === b.dataset.tplNew);
      const { data: groups } = await sb.from("groups").select("id, name, zoom_url").order("name");
      const d0 = new Date(); d0.setMinutes(0, 0, 0); d0.setHours(d0.getHours() + 1); const local = new Date(d0.getTime() - d0.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      openDialog("Nueva clase desde «" + t.title + "»", `<div class="inline-form"><div class="field"><label for="tn-g">Grupo</label><select id="tn-g">${(groups || []).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></div><div class="field"><label for="tn-title">Título</label><input id="tn-title" value="${esc(t.title)}"></div><div class="field"><label for="tn-when">Fecha y hora</label><input id="tn-when" type="datetime-local" value="${local}"></div><button class="button" id="tn-go">Crear y preparar</button></div>`, d => d.querySelector("#tn-go").addEventListener("click", async () => {
        const gid = d.querySelector("#tn-g").value, g = (groups || []).find(x => x.id === gid);
        const { data: s, error } = await sb.from("sessions").insert({ group_id: gid, title: d.querySelector("#tn-title").value.trim() || t.title, starts_at: new Date(d.querySelector("#tn-when").value).toISOString(), zoom_url: g?.zoom_url || null, created_by: me.user.id, template_id: t.id }).select().single();
        if (error) { toast(error.message); return; }
        const r = await sb.rpc("apply_template", { p_session: s.id, p_template: t.id }); if (r.error) toast("Clase creada, pero la plantilla no se aplicó: " + r.error.message);
        location.href = "preparar.html?id=" + s.id;
      }));
    }));
  }

  function tplSection() {
    return `<section class="panel panel-pad" style="margin-bottom:18px"><div class="panel-head"><h2 style="margin:0;font-family:Georgia,serif;font-size:1.15rem">Plantillas de clase <span class="meta">${S.tpls.length}</span></h2></div>
      ${S.tpls.length ? `<ul class="sess-pick" style="max-height:none">${S.tpls.map(t => `<li><b>${esc(t.title)}</b><small>${esc(t.folder)} · ${(t.materials || []).length} materiales · ${(t.activities || []).length} actividades</small><button class="button teal small" data-tpl-new="${t.id}">Nueva clase</button>${t.owner_id === me.user.id || me.profile.role === "coordinator" ? `<button class="icon-button" title="Borrar plantilla" data-tpl-del="${t.id}">🗑</button>` : ""}</li>`).join("")}</ul>` : `<p class="subtle" style="margin:0">Prepara una clase y pulsa «Guardar como plantilla»; aparecerá aquí para reutilizarla o para las clases recurrentes de un grupo.</p>`}</section>`;
  }
  function itemCard(i) {
    const mine = i.owner_id === me.user.id;
    const dest = i.purpose === "group" && i.group_name ? "👥 " + i.group_name : i.purpose === "course" && i.course_title ? "📘 " + i.course_title : i.purpose === "series" ? "📚 " + i.folder : "📁 " + i.folder;
    return `<article class="lib-item ${mine ? "mine" : ""}"><div class="head">${kindIcon(i)}<div class="nm"><b>${esc(i.title)}</b><small>${esc(dest)} · ${esc((i.owner_name || "").split(" ")[0] || "—")}${i.size_bytes ? " · " + fmtSize(i.size_bytes) : ""}${i.visibility === "private" ? " · solo tú" : ""}</small>${i.description ? `<small style="display:block;color:var(--muted)">${esc(i.description)}</small>` : ""}</div></div>
      ${(i.tags || []).length || i.material_type !== "otro" || i.uses ? `<div class="tags">${i.material_type && i.material_type !== "otro" ? `<span>${esc(TYPE_LABEL[i.material_type] || i.material_type)}</span>` : ""}${(i.tags || []).map(t => `<span>${esc(t)}</span>`).join("")}${i.uses ? `<span title="Veces usado en clase">↻ ${i.uses}</span>` : ""}</div>` : ""}
      <div class="acts"><button class="button teal small" data-add="${i.id}">Añadir a clase</button><button class="button secondary small" data-open="${i.id}">Ver</button>${mine || me.profile.role === "coordinator" ? `<button class="button secondary small" data-edit="${i.id}">Editar</button><button class="icon-button" title="Borrar" data-del="${i.id}">🗑</button>` : ""}</div></article>`;
  }

  async function openItem(i) {
    if (i.kind === "link") { window.open(i.url, "_blank"); return; }
    if (i.kind === "text") { openDialog(i.title, `<div class="material-text">${esc(i.content)}</div>`); return; }
    const { data, error } = await sb.storage.from("library").createSignedUrl(i.storage_path, 600);
    if (error) { toast("No se pudo abrir: " + error.message); return; }
    if (/\.html?$/i.test(i.storage_path)) { const w = window.open("", "_blank"); const r = await sb.storage.from("library").download(i.storage_path); if (r.error) { toast("No se pudo abrir"); w && w.close(); return; } const url = URL.createObjectURL(new Blob([await r.data.text()], { type: "text/html;charset=utf-8" })); if (w) w.location.href = url; return; }
    window.open(data.signedUrl, "_blank");
  }

  function editDialog(i, preset) {
    const folders = [...new Set(S.items.map(x => x.folder))].filter(Boolean).sort();
    const p = i || preset || {};
    openDialog(i ? "Editar material" : "Subir material", `<div class="inline-form">
      ${i ? "" : `<div class="field"><label for="l-kind">¿Qué vas a subir?</label><select id="l-kind"><option value="file">Un archivo (lección HTML, PDF, imagen, audio…)</option><option value="link">Un enlace (YouTube, web…)</option><option value="text">Un texto escrito aquí</option></select></div>
      <div class="field" id="l-file-f"><label for="l-file">Archivo</label><input id="l-file" type="file"></div>
      <div class="field" id="l-url-f" hidden><label for="l-url">Enlace</label><input id="l-url" placeholder="https://…"></div>
      <div class="field" id="l-text-f" hidden><label for="l-text">Texto</label><textarea id="l-text" rows="5"></textarea></div>`}
      <div class="field"><label for="l-title">Título</label><input id="l-title" value="${esc(p.title || "")}"></div>
      <div class="field"><label for="l-desc">¿De qué trata? (una línea, opcional)</label><input id="l-desc" value="${esc(p.description || "")}" placeholder="Ej. Lección 4 de la serie de oración"></div>
      <div class="row"><div class="field"><label for="l-type">Tipo</label><select id="l-type">${TYPES.map(([k, l]) => `<option value="${k}" ${(p.material_type || "otro") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><label for="l-purpose">¿Para qué es?</label><select id="l-purpose">${Object.entries(PURPOSE).map(([k, l]) => `<option value="${k}" ${(p.purpose || "general") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
      <div class="field" id="l-group-f" hidden><label for="l-group">Grupo</label><select id="l-group"><option value="">—</option>${S.groups.map(g => `<option value="${g.id}" ${p.group_id === g.id ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select></div>
      <div class="field" id="l-course-f" hidden><label for="l-course">Curso</label><select id="l-course"><option value="">—</option>${S.courses.map(c => `<option value="${c.id}" ${p.course_id === c.id ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select></div>
      <div class="row"><div class="field"><label for="l-folder">Serie o tema (carpeta)</label><input id="l-folder" list="l-folders" value="${esc(p.folder || (S.folder !== "Todo" ? S.folder : "General"))}"><datalist id="l-folders">${folders.map(f => `<option value="${esc(f)}">`).join("")}</datalist></div>
        <div class="field"><label for="l-tags">Etiquetas (separadas por comas)</label><input id="l-tags" value="${esc((p.tags || []).join(", "))}"></div></div>
      <div class="field"><label for="l-vis">¿Quién puede verlo?</label><select id="l-vis">${Object.entries(VIS).map(([k, l]) => `<option value="${k}" ${(p.visibility || "staff") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      ${i ? "" : `<div class="field" id="l-sess-f"><label for="l-sess">Añadirlo ya a una clase (opcional)</label><select id="l-sess"><option value="">No, solo a la biblioteca</option>${S.sessions.map(x => `<option value="${x.id}">${esc(x.title)} · ${fmtDate(x.starts_at, { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}${x.status === "live" ? " · en directo" : ""}</option>`).join("")}</select></div>`}
      <p class="meta">Se guardará a tu nombre: <b>${esc(me.profile.full_name)}</b></p>
      <p class="form-error" id="l-err"></p>
      <button class="button" id="l-save">${i ? "Guardar cambios" : "Subir a la biblioteca"}</button></div>`, d => {
      const kind = d.querySelector("#l-kind"), purpose = d.querySelector("#l-purpose");
      const upK = () => { if (!kind) return; d.querySelector("#l-file-f").hidden = kind.value !== "file"; d.querySelector("#l-url-f").hidden = kind.value !== "link"; d.querySelector("#l-text-f").hidden = kind.value !== "text"; if (!i) d.querySelector("#l-type").value = kind.value === "text" ? "lectura" : kind.value === "link" ? "video" : "otro"; };
      const upP = () => { d.querySelector("#l-group-f").hidden = purpose.value !== "group"; d.querySelector("#l-course-f").hidden = purpose.value !== "course"; };
      kind?.addEventListener("change", upK); purpose.addEventListener("change", upP); upK(); upP();
      d.querySelector("#l-group")?.addEventListener("change", e => { const g = S.groups.find(x => x.id === e.target.value); if (g && d.querySelector("#l-folder").value === "General") d.querySelector("#l-folder").value = g.name; });
      d.querySelector("#l-file")?.addEventListener("change", e => {
        const f = e.target.files[0]; if (!f) return;
        if (!d.querySelector("#l-title").value) d.querySelector("#l-title").value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        const n = f.name.toLowerCase(); const t = /\.html?$/.test(n) ? "leccion" : /\.pdf$/.test(n) ? "guia" : /\.(pptx?|key|odp)$/.test(n) ? "presentacion" : /\.(mp4|mov|webm)$/.test(n) ? "video" : /\.(mp3|m4a|wav|ogg)$/.test(n) ? "audio" : /\.(png|jpe?g|gif|webp)$/.test(n) ? "imagen" : "otro";
        d.querySelector("#l-type").value = t;
      });
      d.querySelector("#l-save").addEventListener("click", async () => {
        const err = d.querySelector("#l-err"); err.textContent = "";
        const title = d.querySelector("#l-title").value.trim(); if (!title) { err.textContent = "Ponle un título."; return; }
        const pur = purpose.value;
        const row = { title, description: d.querySelector("#l-desc").value.trim() || null, material_type: d.querySelector("#l-type").value,
          purpose: pur, group_id: pur === "group" ? (d.querySelector("#l-group").value || null) : null, course_id: pur === "course" ? (d.querySelector("#l-course").value || null) : null,
          folder: d.querySelector("#l-folder").value.trim() || "General", tags: d.querySelector("#l-tags").value.split(",").map(t => t.trim()).filter(Boolean),
          visibility: d.querySelector("#l-vis").value, shared: d.querySelector("#l-vis").value !== "private", updated_at: new Date().toISOString() };
        if (pur === "group" && !row.group_id) { err.textContent = "Elige el grupo."; return; }
        if (pur === "course" && !row.course_id) { err.textContent = "Elige el curso."; return; }
        d.querySelector("#l-save").disabled = true;
        try {
          if (i) { const { error } = await sb.from("library_items").update(row).eq("id", i.id); if (error) { err.textContent = error.message; return; } dialog.close(); toast("Guardado"); load(); return; }
          row.owner_id = me.user.id; row.kind = kind.value;
          if (kind.value === "link") { row.url = d.querySelector("#l-url").value.trim(); if (!row.url) { err.textContent = "Pega el enlace."; return; } }
          if (kind.value === "text") { row.content = d.querySelector("#l-text").value.trim(); if (!row.content) { err.textContent = "Escribe el texto."; return; } }
          if (kind.value === "file") { const f = d.querySelector("#l-file").files[0]; if (!f) { err.textContent = "Elige un archivo."; return; } const path = `${me.user.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`; const { error } = await sb.storage.from("library").upload(path, f); if (error) { err.textContent = "No se pudo subir: " + error.message; return; } row.storage_path = path; row.size_bytes = f.size; }
          const { data: created, error } = await sb.from("library_items").insert(row).select().single(); if (error) { err.textContent = error.message; return; }
          const sid = d.querySelector("#l-sess")?.value;
          if (sid && created) { const { count } = await sb.from("materials").select("id", { count: "exact", head: true }).eq("session_id", sid);
            await sb.from("materials").insert({ session_id: sid, title: created.title, kind: created.kind, storage_path: created.storage_path, url: created.url, content: created.content, bucket: created.kind === "file" ? "library" : "materials", library_item_id: created.id, visible: true, position: count || 0 }); }
          dialog.close(); toast(sid ? "Subido y añadido a la clase" : "Añadido a la biblioteca"); load();
        } finally { d.querySelector("#l-save").disabled = false; }
      });
    });
  }

  async function delItem(i) {
    if (!confirm(`¿Borrar «${i.title}» de la biblioteca? Las clases que ya lo tengan seguirán viéndolo hasta que lo quites de ellas.`)) return;
    const { error } = await sb.from("library_items").delete().eq("id", i.id);
    if (error) { toast("No se pudo borrar: " + error.message); return; }
    toast("Borrado"); load();
  }

  async function addToClassDialog(i) {
    const { data: groups } = await sb.from("groups").select("id, name, sessions(id, title, starts_at, status)").order("name");
    const since = Date.now() - 7 * 86400e3;
    const sessions = (groups || []).flatMap(g => (g.sessions || []).filter(s => s.status !== "closed" || new Date(s.starts_at) > since).map(s => ({ ...s, group: g.name }))).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    openDialog("Añadir a una clase", sessions.length ? `<p class="subtle" style="margin-top:0">«${esc(i.title)}» se añadirá al material de la clase que elijas, sin volver a subirlo.</p>
      <ul class="sess-pick">${sessions.map(s => `<li><b>${esc(s.title)}</b><small>${esc(s.group)} · ${fmtDate(s.starts_at)}${s.status === "live" ? " · en directo" : ""}</small><button class="button teal small" data-sess="${s.id}">Añadir</button></li>`).join("")}</ul>` : `<p class="subtle">No tienes clases programadas. Crea una desde «Mis grupos» y vuelve.</p>`, d => {
      d.querySelectorAll("[data-sess]").forEach(b => b.addEventListener("click", async () => {
        const { count } = await sb.from("materials").select("id", { count: "exact", head: true }).eq("session_id", b.dataset.sess);
        const { error } = await sb.from("materials").insert({ session_id: b.dataset.sess, title: i.title, kind: i.kind, storage_path: i.storage_path, url: i.url, content: i.content, bucket: i.kind === "file" ? "library" : "materials", library_item_id: i.id, visible: true, position: count || 0 });
        if (error) { toast("No se pudo añadir: " + error.message); return; }
        dialog.close(); toast("Añadido a la clase");
      }));
    });
  }

  await load();
  document.getElementById("loading").hidden = true; app.hidden = false;
})();
