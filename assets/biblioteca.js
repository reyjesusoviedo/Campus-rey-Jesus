(async () => {
  const { sb, esc, fmtDate, toast, requireUser, renderShell, copy } = Campus;
  const me = await requireUser();
  renderShell(me, "biblioteca");
  const staff = me.profile.role === "teacher" || me.profile.role === "coordinator";
  const app = document.getElementById("app"), dialog = document.getElementById("dialog");
  document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
  function openDialog(title, html, onMount) { document.getElementById("dialog-title").textContent = title; document.getElementById("dialog-body").innerHTML = html; dialog.showModal(); onMount && onMount(dialog); }
  if (!staff) { app.innerHTML = `<div class="lib-empty"><h2>La biblioteca es para maestros y coordinación</h2><p>El material de tus clases lo encuentras dentro de cada clase, en el botón «Material».</p></div>`; document.getElementById("loading").hidden = true; app.hidden = false; return; }

  const S = { items: [], folder: "Todo", q: "", names: {} };
  const kindIcon = it => { const k = it.kind === "link" ? "link" : /\.html?$/i.test(it.storage_path || "") ? "html" : /\.pdf$/i.test(it.storage_path || "") ? "pdf" : /\.(png|jpe?g|gif|webp)$/i.test(it.storage_path || "") ? "img" : "txt"; return `<span class="ic ${k}" style="width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-size:10px;font-weight:800;color:#fff;background:${{ link: "#111", html: "#087f74", pdf: "#c2413f", img: "#7a5c14", txt: "#5b6673" }[k]}">${{ link: "WEB", html: "HTML", pdf: "PDF", img: "IMG", txt: "TXT" }[k]}</span>`; };
  const fmtSize = b => !b ? "" : b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.round(b / 1e3) + " KB";

  async function load() {
    const { data, error } = await sb.from("library_items").select("*").order("updated_at", { ascending: false });
    if (error) { app.innerHTML = `<p class="notice">No se pudo cargar la biblioteca: ${esc(error.message)}. ¿Se ejecutó el parche de la Fase A?</p>`; return; }
    S.items = data || [];
    const ids = [...new Set(S.items.map(i => i.owner_id))].filter(id => !S.names[id]);
    if (ids.length) { const { data: ps } = await sb.from("profiles").select("id, full_name").in("id", ids); (ps || []).forEach(p => S.names[p.id] = p.full_name); }
    render();
  }

  function render() {
    const folders = {}; S.items.forEach(i => folders[i.folder] = (folders[i.folder] || 0) + 1);
    const names = Object.keys(folders).sort((a, b) => a.localeCompare(b, "es"));
    const q = S.q.trim().toLowerCase();
    const list = S.items.filter(i => (S.folder === "Todo" || i.folder === S.folder) && (!q || (i.title + " " + i.tags.join(" ") + " " + i.folder).toLowerCase().includes(q)));
    app.innerHTML = `
      <header class="page-heading"><div><p class="eyebrow">${esc(Campus.cfg.brand)}</p><h1 style="margin:0;font-family:Georgia,serif">Biblioteca</h1><p class="subtle">Sube cada material una vez y añádelo a las clases que quieras.</p></div>
        <div class="comm-aux"><button class="button" id="lib-add">Subir material</button></div></header>
      <div class="lib">
        <aside><ul class="lib-folders">
          <li><button data-folder="Todo" aria-pressed="${S.folder === "Todo"}">📚 Todo <span class="n">${S.items.length}</span></button></li>
          ${names.map(f => `<li><button data-folder="${esc(f)}" aria-pressed="${S.folder === f}">📁 ${esc(f)} <span class="n">${folders[f]}</span></button></li>`).join("")}
        </ul></aside>
        <section>
          <div class="lib-tools"><input type="search" id="lib-q" placeholder="Buscar por título, etiqueta o carpeta…" value="${esc(S.q)}"></div>
          ${list.length ? `<div class="lib-grid">${list.map(itemCard).join("")}</div>` : `<div class="lib-empty"><h2>${S.items.length ? "Nada con ese filtro" : "La biblioteca está vacía"}</h2><p>${S.items.length ? "Prueba con otra carpeta o búsqueda." : "Sube tu primera lección, PDF o enlace con «Subir material»."}</p></div>`}
        </section>
      </div>`;
    app.querySelectorAll("[data-folder]").forEach(b => b.addEventListener("click", () => { S.folder = b.dataset.folder; render(); }));
    app.querySelector("#lib-q").addEventListener("input", e => { S.q = e.target.value; render(); app.querySelector("#lib-q").focus(); app.querySelector("#lib-q").setSelectionRange(S.q.length, S.q.length); });
    app.querySelector("#lib-add").addEventListener("click", () => editDialog(null));
    app.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openItem(S.items.find(i => i.id === b.dataset.open))));
    app.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editDialog(S.items.find(i => i.id === b.dataset.edit))));
    app.querySelectorAll("[data-add]").forEach(b => b.addEventListener("click", () => addToClassDialog(S.items.find(i => i.id === b.dataset.add))));
    app.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => delItem(S.items.find(i => i.id === b.dataset.del))));
  }

  function itemCard(i) {
    const mine = i.owner_id === me.user.id;
    return `<article class="lib-item ${mine ? "mine" : ""}"><div class="head">${kindIcon(i)}<div class="nm"><b>${esc(i.title)}</b><small>${esc(i.folder)} · ${esc((S.names[i.owner_id] || "").split(" ")[0])}${i.size_bytes ? " · " + fmtSize(i.size_bytes) : ""}${i.shared ? "" : " · privado"}</small></div></div>
      ${i.tags.length ? `<div class="tags">${i.tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
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

  function editDialog(i) {
    const folders = [...new Set(S.items.map(x => x.folder))].sort();
    openDialog(i ? "Editar material" : "Subir material", `<div class="inline-form">
      <div class="field"><label for="l-title">Título</label><input id="l-title" value="${esc(i?.title || "")}"></div>
      ${i ? "" : `<div class="field"><label for="l-kind">Tipo</label><select id="l-kind"><option value="file">Archivo (lección HTML, PDF, imagen…)</option><option value="link">Enlace</option><option value="text">Texto</option></select></div>
      <div class="field" id="l-file-f"><label for="l-file">Archivo</label><input id="l-file" type="file"></div>
      <div class="field" id="l-url-f" hidden><label for="l-url">Enlace</label><input id="l-url" placeholder="https://…"></div>
      <div class="field" id="l-text-f" hidden><label for="l-text">Texto</label><textarea id="l-text" rows="5"></textarea></div>`}
      <div class="row"><div class="field"><label for="l-folder">Carpeta</label><input id="l-folder" list="l-folders" value="${esc(i?.folder || (S.folder !== "Todo" ? S.folder : "General"))}"><datalist id="l-folders">${folders.map(f => `<option value="${esc(f)}">`).join("")}</datalist></div>
      <div class="field"><label for="l-tags">Etiquetas (separadas por comas)</label><input id="l-tags" value="${esc((i?.tags || []).join(", "))}"></div></div>
      <label style="font-size:14px"><input type="checkbox" id="l-shared" ${i ? (i.shared ? "checked" : "") : "checked"}> Compartido con los demás maestros</label>
      <p class="form-error" id="l-err"></p>
      <button class="button" id="l-save">${i ? "Guardar cambios" : "Subir a la biblioteca"}</button></div>`, d => {
      const kind = d.querySelector("#l-kind");
      if (kind) { const u = () => { d.querySelector("#l-file-f").hidden = kind.value !== "file"; d.querySelector("#l-url-f").hidden = kind.value !== "link"; d.querySelector("#l-text-f").hidden = kind.value !== "text"; }; kind.addEventListener("change", u); u();
        d.querySelector("#l-file").addEventListener("change", e => { const f = e.target.files[0]; if (f && !d.querySelector("#l-title").value) d.querySelector("#l-title").value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "); }); }
      d.querySelector("#l-save").addEventListener("click", async () => {
        const err = d.querySelector("#l-err"); err.textContent = "";
        const title = d.querySelector("#l-title").value.trim(); if (!title) { err.textContent = "Ponle un título."; return; }
        const row = { title, folder: d.querySelector("#l-folder").value.trim() || "General", tags: d.querySelector("#l-tags").value.split(",").map(t => t.trim()).filter(Boolean), shared: d.querySelector("#l-shared").checked, updated_at: new Date().toISOString() };
        d.querySelector("#l-save").disabled = true;
        try {
          if (i) { const { error } = await sb.from("library_items").update(row).eq("id", i.id); if (error) { err.textContent = error.message; return; } }
          else {
            row.owner_id = me.user.id; row.kind = kind.value;
            if (kind.value === "link") { row.url = d.querySelector("#l-url").value.trim(); if (!row.url) { err.textContent = "Pega el enlace."; return; } }
            if (kind.value === "text") { row.content = d.querySelector("#l-text").value.trim(); }
            if (kind.value === "file") { const f = d.querySelector("#l-file").files[0]; if (!f) { err.textContent = "Elige un archivo."; return; } const path = `${me.user.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`; const { error } = await sb.storage.from("library").upload(path, f); if (error) { err.textContent = "No se pudo subir: " + error.message; return; } row.storage_path = path; row.size_bytes = f.size; }
            const { error } = await sb.from("library_items").insert(row); if (error) { err.textContent = error.message; return; }
          }
          dialog.close(); toast(i ? "Guardado" : "Añadido a la biblioteca"); load();
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
