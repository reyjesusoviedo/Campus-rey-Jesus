(async () => {
  const { sb, esc, fmtDate, toast, requireUser, initials, whatsappMessage } = Campus;
  const me = await requireUser();
  const role = me.profile.role, coord = role === "coordinator";
  if (!(coord || role === "teacher")) { location.replace("panel.html"); return; }
  Shell.render(me, "seguimiento", "Seguimiento");
  const app = document.getElementById("app");
  const { data, error } = await sb.rpc("followup");
  if (error) { app.innerHTML = `<p class="notice">${esc(error.message)}</p>`; document.getElementById("loading").hidden = true; app.hidden = false; return; }
  const rows = data || []; let filter = "all", q = "";
  const first = me.profile.full_name.split(" ")[0];
  function render() {
    const list = rows.filter(r => (filter === "all" || r.status === filter) && (!q || (r.full_name + " " + r.context).toLowerCase().includes(q)));
    const n = s => rows.filter(r => r.status === s).length;
    app.innerHTML = `<div class="hello"><div><h1>Seguimiento</h1><p>Quién necesita una llamada o un mensaje esta semana.</p></div></div>
      <div class="filters"><button data-f="all" aria-pressed="${filter === "all"}">Todos (${rows.length})</button><button data-f="risk" aria-pressed="${filter === "risk"}">! En riesgo (${n("risk")})</button><button data-f="warn" aria-pressed="${filter === "warn"}">⚠ Revisar (${n("warn")})</button><button data-f="ok" aria-pressed="${filter === "ok"}">✓ Al día (${n("ok")})</button><input type="search" id="fq" placeholder="Buscar…" value="${esc(q)}" style="margin-left:auto"></div>
      <div class="rcard">${list.length ? `<table class="ftable"><tr><th>Alumno</th><th>Grupo / curso</th><th>Progreso</th><th>Estado</th><th>Última vez</th><th></th></tr>${list.map(r => `<tr><td><span class="avatar">${esc(initials(r.full_name))}</span>${esc(r.full_name)}</td><td>${esc(r.context)} <small class="meta">· ${r.kind === "group" ? "grupo" : "curso libre"}</small></td><td>${r.progress != null ? `${r.progress}%<span class="pbar"><i style="width:${r.progress}%"></i></span>` : "—"}</td><td><span class="st ${r.status}">${r.status === "risk" ? "! En riesgo" : r.status === "warn" ? "⚠ Revisar" : "✓ Al día"}</span><br><small class="meta">${esc(r.reason)}</small></td><td>${r.last_at ? fmtDate(r.last_at, { day: "numeric", month: "short" }) : "—"}</td><td>${r.phone ? `<a class="button secondary small" href="${whatsappMessage(`Hola ${r.full_name.split(" ")[0]}, soy ${first} del campus. ¿Cómo vas?`)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : `<span class="meta">sin teléfono</span>`}</td></tr>`).join("")}</table>` : `<p class="meta" style="padding:10px">Nadie en esta lista.</p>`}</div>`;
    app.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => { filter = b.dataset.f; render(); }));
    app.querySelector("#fq").addEventListener("input", e => { q = e.target.value.toLowerCase(); render(); const el = app.querySelector("#fq"); el.focus(); el.setSelectionRange(q.length, q.length); });
  }
  render();
  document.getElementById("loading").hidden = true; app.hidden = false;
})();
