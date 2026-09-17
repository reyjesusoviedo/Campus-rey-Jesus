(async () => {
  const { sb, esc, fmtDate, toast, requireUser, renderShell, qs, initials } = Campus;
  const me = await requireUser();
  const sessionId = qs("id");
  if (!sessionId) { location.replace("panel.html"); return; }
  const $ = id => document.getElementById(id);
  const dialog = $("dialog"); $("dialog-close").addEventListener("click", () => dialog.close());
  function openDialog(title, html, onMount) { $("dialog-title").textContent = title; $("dialog-body").innerHTML = html; dialog.showModal(); onMount && onMount(dialog); }
  const KIND = { reading: "Lectura guiada", single_choice: "Pregunta (una opción)", multi_choice: "Pregunta (varias opciones)", numeric: "Respuesta numérica", open: "Respuesta abierta", board: "Pizarra de ideas", team_challenge: "Reto en equipo", submission: "Entrega (texto o foto)", exit_ticket: "Ticket de salida" };
  const S = { session: null, group: null, materials: [], activities: [], lib: [], libFolder: "Todo", libQ: "", names: {} };

  async function load() {
    const { data: s, error } = await sb.from("sessions").select("*, group:groups(*)").eq("id", sessionId).maybeSingle();
    if (error || !s) { $("loading").textContent = "No tienes acceso a esta clase."; return false; }
    S.session = s; S.group = s.group;
    const staff = me.profile.role === "coordinator" || s.group.teacher_id === me.user.id;
    if (!staff) { $("loading").textContent = "Solo el maestro del grupo puede preparar la clase."; return false; }
    const [m, a, l] = await Promise.all([
      sb.from("materials").select("*").eq("session_id", sessionId).order("position").order("created_at"),
      sb.from("activities").select("*").eq("session_id", sessionId).order("position").order("created_at"),
      sb.from("library_items").select("*").order("updated_at", { ascending: false })
    ]);
    S.materials = m.data || []; S.activities = (a.data || []).filter(x => !x.content?.auto && !x.content?.quick); S.lib = l.data || [];
    return true;
  }

  // ---------- cabecera ----------
  function renderTop() {
    const s = S.session;
    $("c-top").innerHTML = `<a class="brand" href="panel.html" data-brand></a>
      <div class="t"><h1>Preparar · ${esc(s.title)}</h1><p>${esc(S.group.name)} · ${fmtDate(s.starts_at)}</p></div>
      <div class="r"><button class="button secondary small" id="tpl-apply">Usar plantilla</button><button class="button secondary small" id="tpl-save">Guardar como plantilla</button><a class="button secondary small" href="biblioteca.html" target="_blank">📚</a><a class="button secondary small" href="panel.html">Mis grupos</a><a class="button gold small" href="sesion.html?id=${sessionId}">Ir a la clase</a></div>`;
    renderShell(me, "");
    $("tpl-save").addEventListener("click", () => openDialog("Guardar como plantilla", `<p class="subtle" style="margin-top:0">Se guardan objetivos, material y secuencia de actividades para reutilizarlos en otras clases o en la recurrencia del grupo.</p><div class="inline-form"><div class="field"><label for="tp-title">Nombre</label><input id="tp-title" value="${esc(S.session.title)}"></div><div class="field"><label for="tp-folder">Carpeta</label><input id="tp-folder" value="${esc(S.group.name)}"></div><button class="button" id="tp-go">Guardar plantilla</button></div>`, d => d.querySelector("#tp-go").addEventListener("click", async () => { const { error } = await sb.rpc("save_template", { p_session: sessionId, p_title: d.querySelector("#tp-title").value.trim() || S.session.title, p_folder: d.querySelector("#tp-folder").value.trim() || "General" }); if (error) { toast("No se pudo guardar: " + error.message); return; } dialog.close(); toast("Plantilla guardada"); })));
    $("tpl-apply").addEventListener("click", async () => { const { data, error } = await sb.from("templates").select("id, title, folder").order("folder").order("title"); if (error) { toast("Plantillas no disponibles: " + error.message); return; } openDialog("Usar plantilla", (data || []).length ? `<p class="subtle" style="margin-top:0">Añade a esta clase el material, las actividades y los objetivos de la plantilla.</p><ul class="sess-pick">${data.map(t => `<li><b>${esc(t.title)}</b><small>${esc(t.folder)}</small><button class="button teal small" data-tpl="${t.id}">Usar</button></li>`).join("")}</ul>` : `<p class="subtle">Aún no hay plantillas. Prepara una clase y pulsa «Guardar como plantilla».</p>`, d => d.querySelectorAll("[data-tpl]").forEach(b => b.addEventListener("click", async () => { const { error } = await sb.rpc("apply_template", { p_session: sessionId, p_template: b.dataset.tpl }); if (error) { toast(error.message); return; } dialog.close(); toast("Plantilla aplicada"); reload(); }))); });
  }

  // ---------- biblioteca ----------
  function renderLib() {
    const folders = [...new Set(S.lib.map(i => i.folder))].sort((a, b) => a.localeCompare(b, "es"));
    const q = S.libQ.toLowerCase();
    const list = S.lib.filter(i => (S.libFolder === "Todo" || i.folder === S.libFolder) && (!q || (i.title + " " + i.folder + " " + i.tags.join(" ")).toLowerCase().includes(q)));
    const inClass = new Set(S.materials.map(m => m.library_item_id).filter(Boolean));
    $("col-lib").innerHTML = `<h2>Biblioteca <button class="lk" id="lib-new">+ Subir</button></h2>
      <input type="search" id="lib-q" placeholder="Buscar…" value="${esc(S.libQ)}" style="width:100%">
      <div class="lib-filters"><button data-f="Todo" aria-pressed="${S.libFolder === "Todo"}">Todo</button>${folders.map(f => `<button data-f="${esc(f)}" aria-pressed="${S.libFolder === f}">${esc(f)}</button>`).join("")}</div>
      <p class="meta" style="margin:10px 0 0">Arrastra a «Material de la clase» o pulsa +.</p>
      <ul class="lib-list">${list.length ? list.map(i => `<li draggable="true" data-lib="${i.id}" class="${inClass.has(i.id) ? "in-class" : ""}">${icon(i)}<div class="nm"><b>${esc(i.title)}</b><small>${esc(i.folder)}${inClass.has(i.id) ? " · ya en la clase" : ""}</small></div><button class="icon-button" title="Añadir a la clase" data-add-lib="${i.id}">+</button></li>`).join("") : `<li style="cursor:default"><span class="meta">Nada por aquí.</span></li>`}</ul>`;
    $("col-lib").querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => { S.libFolder = b.dataset.f; renderLib(); }));
    $("lib-q").addEventListener("input", e => { S.libQ = e.target.value; renderLib(); const el = $("lib-q"); el.focus(); el.setSelectionRange(S.libQ.length, S.libQ.length); });
    $("lib-new").addEventListener("click", uploadDialog);
    $("col-lib").querySelectorAll("[data-add-lib]").forEach(b => b.addEventListener("click", () => addFromLib(b.dataset.addLib)));
    $("col-lib").querySelectorAll("[data-lib]").forEach(li => li.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", li.dataset.lib); e.dataTransfer.effectAllowed = "copy"; }));
  }
  const icon = i => { const k = i.kind === "link" ? "link" : /\.html?$/i.test(i.storage_path || "") ? "html" : /\.pdf$/i.test(i.storage_path || "") ? "pdf" : /\.(png|jpe?g|gif|webp)$/i.test(i.storage_path || "") ? "img" : "txt"; return `<span class="ic ${k}" style="width:30px;height:30px;border-radius:8px;display:grid;place-items:center;font-size:9px;font-weight:800;color:#fff;flex:none;background:${{ link: "#111", html: "#087f74", pdf: "#c2413f", img: "#7a5c14", txt: "#5b6673" }[k]}">${{ link: "WEB", html: "HTML", pdf: "PDF", img: "IMG", txt: "TXT" }[k]}</span>`; };

  async function addFromLib(id) {
    const i = S.lib.find(x => x.id === id); if (!i) return;
    if (S.materials.some(m => m.library_item_id === id)) { toast("Ya está en la clase"); return; }
    const { error } = await sb.from("materials").insert({ session_id: sessionId, title: i.title, kind: i.kind, storage_path: i.storage_path, url: i.url, content: i.content, bucket: i.kind === "file" ? "library" : "materials", library_item_id: i.id, visible: true, position: S.materials.length });
    if (error) { toast("No se pudo añadir: " + error.message); return; }
    toast("Añadido"); await reload();
  }

  // ---------- clase ----------
  function renderClass() {
    const s = S.session, obj = s.objectives || [];
    const local = new Date(new Date(s.starts_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $("col-class").innerHTML = `
      <div class="block"><h3>Clase</h3><div class="head-form"><div class="field" style="margin:0"><label for="s-title">Título</label><input id="s-title" value="${esc(s.title)}"></div><div class="field" style="margin:0"><label for="s-when">Fecha y hora</label><input id="s-when" type="datetime-local" value="${local}"></div></div></div>
      <div class="block"><h3>Objetivos <button class="lk" id="obj-edit">Editar</button></h3>${obj.length ? `<ul class="obj">${obj.map(o => `<li><i></i><span>${esc(o.text)}</span></li>`).join("")}</ul>` : `<p class="meta">Uno por línea. Los marcarás durante la clase.</p>`}</div>
      <div class="block"><h3>Material de la clase <span class="meta">${S.materials.length}</span> <button class="lk" id="mat-upload">Subir nuevo</button></h3>
        <div class="drop" id="drop">${S.materials.length ? S.materials.map((m, i) => `<div class="mat-row ${m.visible ? "" : "hidden-m"} ${i === 0 ? "first" : ""}" data-mat="${m.id}">${icon(m)}<div class="nm"><b>${esc(m.title)}</b><small>${i === 0 ? "Se proyecta primero · " : ""}${m.visible ? "visible" : "oculto hasta que lo muestres"}${m.library_item_id ? " · de la biblioteca" : ""}</small></div>
          <div class="acts"><button class="icon-button" title="Subir" data-up="${m.id}" ${i === 0 ? "disabled" : ""}>↑</button><button class="icon-button" title="Bajar" data-down="${m.id}" ${i === S.materials.length - 1 ? "disabled" : ""}>↓</button><button class="icon-button" title="${m.visible ? "Ocultar" : "Mostrar"}" data-vis="${m.id}">${m.visible ? "👁" : "🚫"}</button><button class="icon-button" title="Quitar de la clase" data-rm="${m.id}">✕</button></div></div>`).join("") : `<p class="empty">Arrastra aquí material de la biblioteca, o pulsa + en la lista.</p>`}</div></div>
      <div class="block"><h3>Secuencia de actividades <span class="meta">${S.activities.length}</span> <button class="lk" id="act-new">+ Nueva</button></h3>
        ${S.activities.length ? S.activities.map((a, i) => `<div class="seq-row"><span class="k">${KIND[a.kind]}</span><div class="r"><b>${esc(a.title)}</b><button class="icon-button" data-aup="${a.id}" ${i === 0 ? "disabled" : ""}>↑</button><button class="icon-button" data-adown="${a.id}" ${i === S.activities.length - 1 ? "disabled" : ""}>↓</button><button class="button secondary small" data-aedit="${a.id}">Editar</button><button class="icon-button" data-adel="${a.id}">✕</button></div></div>`).join("") : `<p class="meta">Lecturas, preguntas, pizarra de ideas, entregas… Las abrirás una a una en clase. Las preguntas improvisadas se hacen con el botón «Pregunta» durante la clase.</p>`}
        <div class="live-controls" style="margin-top:8px"><button class="button secondary small" id="tpl-basic">Plantilla: lectura + 2 preguntas + ticket</button></div></div>`;
    const col = $("col-class");
    let t; const saveHead = () => { clearTimeout(t); t = setTimeout(async () => { const title = $("s-title").value.trim(), when = $("s-when").value; if (!title || !when) return; const { error } = await sb.from("sessions").update({ title, starts_at: new Date(when).toISOString() }).eq("id", sessionId); if (error) toast("No se guardó: " + error.message); else { S.session.title = title; S.session.starts_at = new Date(when).toISOString(); renderTop(); renderPreview(); } }, 700); };
    $("s-title").addEventListener("input", saveHead); $("s-when").addEventListener("change", saveHead);
    $("obj-edit").addEventListener("click", () => openDialog("Objetivos de la clase", `<textarea class="obj-edit" id="obj-text" rows="6" style="width:100%">${esc(obj.map(o => o.text).join("\n"))}</textarea><div class="live-controls"><button class="button" id="obj-save">Guardar</button></div>`, d => d.querySelector("#obj-save").addEventListener("click", async () => { const list = d.querySelector("#obj-text").value.split("\n").map(x => x.trim()).filter(Boolean).map(x => ({ text: x, done: !!obj.find(o => o.text === x && o.done) })); const { error } = await sb.from("sessions").update({ objectives: list }).eq("id", sessionId); if (error) toast(error.message); dialog.close(); reload(); })));
    $("mat-upload").addEventListener("click", uploadDialog);
    const drop = $("drop");
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); const id = e.dataTransfer.getData("text/plain"); if (id) addFromLib(id); });
    col.querySelectorAll("[data-up]").forEach(b => b.addEventListener("click", () => moveMat(b.dataset.up, -1)));
    col.querySelectorAll("[data-down]").forEach(b => b.addEventListener("click", () => moveMat(b.dataset.down, 1)));
    col.querySelectorAll("[data-vis]").forEach(b => b.addEventListener("click", async () => { const m = S.materials.find(x => x.id === b.dataset.vis); await sb.from("materials").update({ visible: !m.visible }).eq("id", m.id); reload(); }));
    col.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", async () => { if (!confirm("¿Quitar este material de la clase? (En la biblioteca seguirá.)")) return; await sb.from("materials").delete().eq("id", b.dataset.rm); reload(); }));
    $("act-new").addEventListener("click", () => activityDialog(null));
    col.querySelectorAll("[data-aedit]").forEach(b => b.addEventListener("click", () => activityDialog(S.activities.find(a => a.id === b.dataset.aedit))));
    col.querySelectorAll("[data-adel]").forEach(b => b.addEventListener("click", async () => { if (!confirm("¿Borrar esta actividad?")) return; await sb.from("activities").delete().eq("id", b.dataset.adel); reload(); }));
    col.querySelectorAll("[data-aup]").forEach(b => b.addEventListener("click", () => moveAct(b.dataset.aup, -1)));
    col.querySelectorAll("[data-adown]").forEach(b => b.addEventListener("click", () => moveAct(b.dataset.adown, 1)));
    $("tpl-basic").addEventListener("click", async () => {
      const base = S.activities.length;
      const rows = [
        { kind: "reading", title: "Lectura de hoy", content: { text: "(Pega aquí el texto o proyecta la lección)", prompt: "" } },
        { kind: "open", title: "¿Qué te ha llamado la atención?", content: { prompt: "Escribe una frase." } },
        { kind: "single_choice", title: "Pregunta de comprensión", content: { prompt: "Edita esta pregunta", options: ["Opción A", "Opción B", "Opción C"], correct: [0] } },
        { kind: "exit_ticket", title: "¿Qué te llevas de hoy?", content: { prompt: "Una frase para terminar." } }
      ].map((r, i) => ({ ...r, session_id: sessionId, status: "draft", position: base + i }));
      const { error } = await sb.from("activities").insert(rows); if (error) toast(error.message); else toast("Plantilla añadida: edita cada actividad"); reload();
    });
  }
  async function moveMat(id, dir) { const i = S.materials.findIndex(m => m.id === id), j = i + dir; if (j < 0 || j >= S.materials.length) return; const a = S.materials[i], b = S.materials[j]; await Promise.all([sb.from("materials").update({ position: j }).eq("id", a.id), sb.from("materials").update({ position: i }).eq("id", b.id)]); await normalize("materials", S.materials.map(m => m.id === a.id ? { ...m, position: j } : m.id === b.id ? { ...m, position: i } : m)); reload(); }
  async function moveAct(id, dir) { const i = S.activities.findIndex(m => m.id === id), j = i + dir; if (j < 0 || j >= S.activities.length) return; const a = S.activities[i], b = S.activities[j]; await Promise.all([sb.from("activities").update({ position: j }).eq("id", a.id), sb.from("activities").update({ position: i }).eq("id", b.id)]); reload(); }
  async function normalize(table, list) { const sorted = [...list].sort((x, y) => x.position - y.position); for (let k = 0; k < sorted.length; k++) if (sorted[k].position !== k) await sb.from(table).update({ position: k }).eq("id", sorted[k].id); }

  function uploadDialog() {
    openDialog("Subir material", `<div class="inline-form">
      <div class="field"><label for="u-title">Título</label><input id="u-title"></div>
      <div class="field"><label for="u-kind">Tipo</label><select id="u-kind"><option value="file">Archivo (lección HTML, PDF, imagen…)</option><option value="link">Enlace</option><option value="text">Texto</option></select></div>
      <div class="field" id="u-file-f"><label for="u-file">Archivo</label><input id="u-file" type="file"></div>
      <div class="field" id="u-url-f" hidden><label for="u-url">Enlace</label><input id="u-url" placeholder="https://…"></div>
      <div class="field" id="u-text-f" hidden><label for="u-text">Texto</label><textarea id="u-text" rows="5"></textarea></div>
      <div class="field"><label for="u-folder">Carpeta en la biblioteca</label><input id="u-folder" value="${esc(S.group.name)}"></div>
      <label style="font-size:14px"><input type="checkbox" id="u-add" checked> Añadir también a esta clase</label>
      <p class="form-error" id="u-err"></p><button class="button" id="u-save">Subir</button></div>`, d => {
      const k = d.querySelector("#u-kind"); const u = () => { d.querySelector("#u-file-f").hidden = k.value !== "file"; d.querySelector("#u-url-f").hidden = k.value !== "link"; d.querySelector("#u-text-f").hidden = k.value !== "text"; }; k.addEventListener("change", u); u();
      d.querySelector("#u-file").addEventListener("change", e => { const f = e.target.files[0]; if (f && !d.querySelector("#u-title").value) d.querySelector("#u-title").value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "); });
      d.querySelector("#u-save").addEventListener("click", async () => {
        const err = d.querySelector("#u-err"); err.textContent = ""; const title = d.querySelector("#u-title").value.trim(); if (!title) { err.textContent = "Ponle un título."; return; }
        const row = { owner_id: me.user.id, title, kind: k.value, folder: d.querySelector("#u-folder").value.trim() || "General" };
        if (k.value === "link") row.url = d.querySelector("#u-url").value.trim();
        if (k.value === "text") row.content = d.querySelector("#u-text").value.trim();
        d.querySelector("#u-save").disabled = true;
        try {
          if (k.value === "file") { const f = d.querySelector("#u-file").files[0]; if (!f) { err.textContent = "Elige un archivo."; return; } const path = `${me.user.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`; const { error } = await sb.storage.from("library").upload(path, f); if (error) { err.textContent = error.message; return; } row.storage_path = path; row.size_bytes = f.size; }
          const { data, error } = await sb.from("library_items").insert(row).select().single(); if (error) { err.textContent = error.message; return; }
          S.lib.unshift(data); dialog.close(); toast("Subido a la biblioteca");
          if (d.querySelector("#u-add").checked) await addFromLib(data.id); else reload();
        } finally { d.querySelector("#u-save").disabled = false; }
      });
    });
  }

  function activityDialog(a) {
    openDialog(a ? "Editar actividad" : "Nueva actividad", `<div class="inline-form">
      <div class="row"><div class="field"><label for="ed-kind">Tipo</label><select id="ed-kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${a?.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><label for="ed-title">Título</label><input id="ed-title" value="${esc(a?.title || "")}"></div></div>
      <div class="field" id="ed-text-f" hidden><label for="ed-text">Texto de la lectura</label><textarea id="ed-text" rows="5">${esc(a?.content?.text || "")}</textarea></div>
      <div class="field"><label for="ed-prompt">Pregunta o consigna</label><textarea id="ed-prompt" rows="2">${esc(a?.content?.prompt || "")}</textarea></div>
      <div class="field" id="ed-opts-f" hidden><label for="ed-opts">Opciones (una por línea; * delante de la correcta)</label><textarea id="ed-opts" rows="4">${esc((a?.content?.options || []).map((o, i) => ((a.content.correct || []).includes(i) ? "* " : "") + o).join("\n"))}</textarea></div>
      <div class="row"><div class="field"><label for="ed-min">Tiempo límite (min, opcional)</label><input id="ed-min" type="number" min="1" value="${a?.content?.minutes || ""}"></div><div class="field" id="ed-img-f"><label><input type="checkbox" id="ed-img" ${a?.content?.allow_image ? "checked" : ""}> Permitir foto o archivo</label></div></div>
      <p class="form-error" id="ed-err"></p><button class="button" id="ed-save">${a ? "Guardar" : "Añadir a la secuencia"}</button></div>`, d => {
      const kind = d.querySelector("#ed-kind"); const upd = () => { const k = kind.value; d.querySelector("#ed-text-f").hidden = k !== "reading"; d.querySelector("#ed-opts-f").hidden = !(k === "single_choice" || k === "multi_choice"); d.querySelector("#ed-img-f").hidden = !["open", "team_challenge", "submission"].includes(k); }; kind.addEventListener("change", upd); upd();
      d.querySelector("#ed-save").addEventListener("click", async () => {
        const err = d.querySelector("#ed-err"); const k = kind.value, title = d.querySelector("#ed-title").value.trim(); if (!title) { err.textContent = "Ponle un título."; return; }
        const content = { prompt: d.querySelector("#ed-prompt").value.trim() };
        if (k === "reading") content.text = d.querySelector("#ed-text").value.trim();
        if (k === "single_choice" || k === "multi_choice") { const lines = d.querySelector("#ed-opts").value.split("\n").map(l => l.trim()).filter(Boolean); if (lines.length < 2) { err.textContent = "Escribe al menos dos opciones."; return; } content.options = lines.map(l => l.replace(/^\*\s*/, "")); content.correct = lines.map((l, i) => l.startsWith("*") ? i : -1).filter(i => i >= 0); }
        if (["open", "team_challenge", "submission"].includes(k)) content.allow_image = k === "submission" || d.querySelector("#ed-img").checked;
        const min = Number(d.querySelector("#ed-min").value); if (min > 0) content.minutes = min;
        const { error } = a ? await sb.from("activities").update({ kind: k, title, content }).eq("id", a.id) : await sb.from("activities").insert({ session_id: sessionId, kind: k, title, content, status: "draft", position: S.activities.length });
        if (error) { err.textContent = error.message; return; } dialog.close(); reload();
      });
    });
  }

  // ---------- vista previa ----------
  async function renderPreview() {
    const s = S.session, first = S.materials.find(m => m.visible), obj = s.objectives || [];
    const teacher = (S.names[S.group.teacher_id] || "el maestro").split(" ")[0];
    const checks = [["Material en la clase", S.materials.length > 0], ["Objetivos escritos", obj.length > 0], ["Al menos una actividad", S.activities.length > 0], ["Invitados admitidos", !!s.allow_guests || !!S.group.allow_guests]];
    $("col-preview").innerHTML = `<h2>Así lo verá el alumno</h2>
      <div class="prev-phone"><div class="prev-top"><b>${esc(s.title)}</b>${esc(S.group.name)} · ${esc(teacher)}</div>
        <div class="prev-body"><div class="prev-video">Vídeo de ${esc(teacher)}</div><div class="prev-lesson" id="prev-lesson">${first ? `<p class="meta" style="margin:0 0 6px">En pantalla: ${esc(first.title)}</p>` : `<p class="meta" style="margin:0">Aún no hay material visible.</p>`}</div></div>
        <div class="prev-bar"><div class="box">Escribe tu respuesta…</div><div class="box" style="text-align:center">🟢 Voy bien · 🟡 Más o menos · 🔴 No lo entiendo</div></div></div>
      <ul class="check">${checks.map(([t, ok]) => `<li class="${ok ? "ok" : ""}">${t}</li>`).join("")}</ul>`;
    if (first && first.kind === "file" && /\.html?$/i.test(first.storage_path || "")) {
      const { data } = await sb.storage.from(first.bucket || "materials").download(first.storage_path);
      if (data) { const f = document.createElement("iframe"); f.setAttribute("sandbox", "allow-scripts"); f.srcdoc = await data.text(); $("prev-lesson").appendChild(f); }
    } else if (first && first.kind === "text") $("prev-lesson").insertAdjacentHTML("beforeend", `<div class="material-text" style="font-size:13px">${esc(first.content)}</div>`);
  }

  async function reload() { await load(); renderLib(); renderClass(); renderPreview(); }

  if (!(await load())) return;
  const { data: p } = await sb.from("profiles").select("id, full_name").eq("id", S.group.teacher_id).maybeSingle(); if (p) S.names[p.id] = p.full_name;
  renderTop(); renderLib(); renderClass(); renderPreview();
  $("loading")?.remove(); $("contenido").hidden = false;
})();
