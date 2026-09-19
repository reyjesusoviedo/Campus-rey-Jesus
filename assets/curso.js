(async () => {
  const { sb, esc, fmtDate, toast, requireUser, renderShell, qs, helpLinks, settings } = Campus;
  const me = await requireUser();
  const $ = id => document.getElementById(id);
  const dialog = $("dialog"); $("dialog-close").addEventListener("click", () => dialog.close());
  function openDialog(title, html, onMount) { $("dialog-title").textContent = title; $("dialog-body").innerHTML = html; dialog.showModal(); onMount && onMount(dialog); }
  const S = { e: null, c: null, items: {}, view: "home", idx: 0, frame: null, cache: {}, questions: [] };
  const eid = qs("e");

  async function load() {
    let q = sb.from("enrollments").select("*, course:courses(*)");
    q = eid ? q.eq("id", eid) : q.eq("user_id", me.user.id).order("started_at", { ascending: false }).limit(1);
    const { data, error } = await q.maybeSingle();
    if (error || !data) { $("loading").textContent = "No tienes ningún curso todavía."; $("contenido").hidden = false; $("contenido").innerHTML = `<div class="k-card"><h2>Sin curso</h2><p>Apúntate a uno desde la página de cursos.</p><a class="button" href="index.html">Ver cursos</a></div>`; return false; }
    S.e = data; S.c = data.course; S.c.lessons = S.c.lessons || [];
    const ids = S.c.lessons.map(l => l.library_item_id).filter(Boolean);
    if (ids.length) { const { data: li } = await sb.from("library_items").select("*").in("id", ids); (li || []).forEach(i => S.items[i.id] = i); }
    if (S.c.type === "live" && S.c.group_id) { const { data: ss } = await sb.from("sessions").select("id, title, starts_at, status").eq("group_id", S.c.group_id).gte("starts_at", new Date(Date.now() - 3600e3).toISOString()).order("starts_at").limit(1); S.next = (ss || [])[0]; }
    const { data: qs2 } = await sb.from("course_questions").select("*").eq("course_id", S.c.id).eq("user_id", me.user.id).order("created_at", { ascending: false }); S.questions = qs2 || [];
    return true;
  }
  const done = () => new Set((S.e.progress?.done || []));
  const total = () => S.c.lessons.length;
  const pct = () => total() ? Math.round(done().size / total() * 100) : 0;
  const daysLeft = () => S.e.ends_at ? Math.ceil((new Date(S.e.ends_at) - Date.now()) / 86400e3) : null;
  const expired = () => S.e.review_until && new Date(S.e.review_until) < Date.now();
  const finished = () => !!S.e.completed_at;
  const currentIdx = () => { const d = done(); const i = S.c.lessons.findIndex((_, k) => !d.has(k)); return i < 0 ? total() - 1 : i; };

  function renderTop() {
    $("c-top").innerHTML = `<a class="brand" href="panel.html" data-brand></a><div class="t"><h1>Hola, ${esc(me.profile.full_name.split(" ")[0])}</h1><p>${esc(S.c.title)}</p></div><div class="r">${S.view !== "home" ? `<button class="button secondary small" id="back">← Mi curso</button>` : `<a class="button secondary small" href="panel.html">Mis cursos</a>`}</div>`;
    renderShell(me, ""); $("back")?.addEventListener("click", () => { S.view = "home"; render(); });
  }
  function render() {
    renderTop();
    const main = $("contenido"); main.hidden = false; $("loading")?.remove();
    if (S.view === "lesson") return renderLesson(main);
    const help = helpLinks(), st = settings();
    const d = daysLeft(), cur = currentIdx(), fin = finished();
    main.innerHTML = `
      ${fin ? `<div class="cert"><h3>¡Curso terminado!</h3><p>${esc(S.c.title)} · ${total()} de ${total()} lecciones · ${fmtDate(S.e.completed_at, { day: "numeric", month: "long" })}</p><a class="button gold small" href="certificado.html?e=${S.e.id}" target="_blank">Ver mi certificado</a></div>
        <div class="k-card"><b>Puedes repasarlo hasta el ${fmtDate(S.e.review_until, { day: "numeric", month: "long" })}</b><p class="meta" style="margin:4px 0 0">Después se borrará de tu cuenta.</p></div>` :
      `<div class="k-card"><span class="eyebrow">Tu curso</span><h2>${esc(S.c.title)}</h2><div class="prog"><i style="width:${pct()}%"></i></div><p class="meta" style="margin:0">Lección ${Math.min(cur + 1, total())} de ${total()} · ${pct()} %${d !== null ? ` · <b>${d > 0 ? "te quedan " + (d >= 14 ? Math.round(d / 7) + " semanas" : d + " días") : "plazo terminado"}</b>` : ""}</p>
        ${total() ? `<button class="button big" id="continue" style="margin-top:12px">${done().size ? "Continuar · Lección " + (cur + 1) : "Empezar · Lección 1"}</button>` : `<p class="meta">El curso aún no tiene lecciones.</p>`}
        ${st.welcome_text && !done().size ? `<p class="meta" style="margin-top:10px">${esc(st.welcome_text)}</p>` : ""}</div>`}
      ${S.next ? `<div class="k-card next-live"><b>${S.next.status === "live" ? "Clase en directo ahora" : "Próxima clase en directo"}</b><p class="meta" style="margin:2px 0 8px">${esc(S.next.title)} · ${fmtDate(S.next.starts_at)}</p><a class="button small ${S.next.status === "live" ? "gold" : "secondary"}" href="sesion.html?id=${S.next.id}">${S.next.status === "live" ? "Entrar" : "Ver la clase"}</a></div>` : ""}
      ${total() ? `<div class="k-card"><h3>Lecciones</h3><ul class="lessons">${S.c.lessons.map((l, i) => { const isDone = done().has(i), isCur = i === cur && !fin, lock = !isDone && i > cur; return `<li class="${isDone ? "done" : isCur ? "cur" : lock ? "lock" : ""}" data-l="${i}"><span class="ic">${isDone ? "✓" : isCur ? "●" : lock ? "🔒" : "▶"}</span>${i + 1} · ${esc(l.title || S.items[l.library_item_id]?.title || "Lección")}</li>`; }).join("")}</ul></div>` : ""}
      <div class="k-card"><h3>¿Necesitas ayuda?</h3><div class="help">${help.map(h => `<a class="${h.kind}" href="${h.href}${h.kind === "wa" ? "?text=" + encodeURIComponent(`Hola, soy ${me.profile.full_name}, del curso «${S.c.title}».`) : ""}" target="_blank" rel="noopener"><span>${h.kind === "wa" ? "💬" : "✉️"}</span>${h.label}</a>`).join("")}<button id="ask"><span>🙋</span>Preguntar</button><button id="answers"><span>📝</span>Mis respuestas</button></div>
        ${S.questions.length ? S.questions.slice(0, 3).map(q => `<div class="qa"><b>Tú:</b> ${esc(q.text)}${q.answer ? `<div class="a"><b>Respuesta:</b> ${esc(q.answer)}</div>` : `<div class="meta">Pendiente de respuesta</div>`}</div>`).join("") : ""}</div>
      ${!fin ? `<div class="cert"><h3>Al terminar</h3><p>Recibirás tu certificado con tu nombre y podrás elegir el siguiente curso.</p><a class="button gold small" href="index.html#cursos">Ver otros cursos</a></div>` : `<div class="k-card"><h3>Siguiente paso</h3><a class="button" href="index.html#cursos">Ver otros cursos</a></div>`}`;
    main.querySelector("#continue")?.addEventListener("click", () => openLesson(cur));
    main.querySelectorAll("[data-l]").forEach(li => li.addEventListener("click", () => { const i = Number(li.dataset.l); if (li.classList.contains("lock")) { toast("Termina antes la lección " + cur + 1); return; } openLesson(i); }));
    main.querySelector("#ask").addEventListener("click", () => openDialog("Pregunta al maestro", `<div class="inline-form"><textarea id="q" rows="4" placeholder="Escribe tu pregunta o comentario"></textarea><button class="button" id="q-go">Enviar</button></div>`, dd => dd.querySelector("#q-go").addEventListener("click", async () => { const t = dd.querySelector("#q").value.trim(); if (!t) return; const { error } = await sb.from("course_questions").insert({ course_id: S.c.id, user_id: me.user.id, text: t }); if (error) { toast(error.message); return; } dialog.close(); toast("Enviada. Te responderán aquí mismo."); await load(); render(); })));
    main.querySelector("#answers").addEventListener("click", () => { const a = S.e.progress?.answers || {}; openDialog("Mis respuestas", Object.keys(a).length ? Object.entries(a).map(([i, v]) => `<h3 style="font-size:1rem;margin:10px 0 4px">Lección ${Number(i) + 1}</h3>${Object.entries(v || {}).map(([k, val]) => `<p style="margin:2px 0;font-size:14px"><b>${esc(k)}:</b> ${esc(typeof val === "object" ? JSON.stringify(val) : val)}</p>`).join("")}`).join("") : `<p class="subtle">Todavía no has escrito nada en las lecciones.</p>`); });
  }

  const LESSON_GUARD = `<script>(function(){var role=null;document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";if(h.charAt(0)==="#"){e.preventDefault();var id=decodeURIComponent(h.slice(1));var el=id?document.getElementById(id):null;if(el)el.scrollIntoView({behavior:"smooth",block:"start"});else if(!id)window.scrollTo({top:0,behavior:"smooth"});}else if(/^https?:/i.test(h)){a.setAttribute("target","_blank");a.setAttribute("rel","noopener");}},true);document.addEventListener("submit",function(e){e.preventDefault();},true);function h(){return Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);}function send(){if(parent!==window)parent.postMessage({campus:"lesson",type:"height",h:h()},"*");}window.addEventListener("load",send);setTimeout(send,300);setTimeout(send,1500);if(window.ResizeObserver){new ResizeObserver(send).observe(document.documentElement);}})();<\/script>`;
  const guard = html => /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + LESSON_GUARD) : LESSON_GUARD + html;

  async function openLesson(i) {
    if (expired()) { toast("El periodo de repaso ha terminado."); return; }
    S.idx = i; S.view = "lesson"; render();
  }
  async function renderLesson(main) {
    const l = S.c.lessons[S.idx], item = S.items[l.library_item_id]; const isDone = done().has(S.idx);
    main.innerHTML = `<div class="lesson-view"><div class="k-card" style="padding:12px 14px"><span class="eyebrow">Lección ${S.idx + 1} de ${total()}</span><h2 style="margin:0">${esc(l.title || item?.title || "Lección")}</h2></div><div class="stage" id="stage"><p class="meta" style="padding:20px">Cargando la lección…</p></div></div>
      <div class="lv-bar"><span class="meta" id="saved">${isDone ? "Lección hecha ✓" : "Tus respuestas se guardan solas"}</span>${S.idx > 0 ? `<button class="button secondary small" id="prev">← Anterior</button>` : ""}<button class="button small ${isDone ? "secondary" : ""}" id="doneBtn">${isDone ? (S.idx + 1 < total() ? "Siguiente →" : "Terminar") : "Marcar como hecha"}</button></div>`;
    main.querySelector("#prev")?.addEventListener("click", () => openLesson(S.idx - 1));
    main.querySelector("#doneBtn").addEventListener("click", () => isDone ? (S.idx + 1 < total() ? openLesson(S.idx + 1) : markDone(S.idx)) : markDone(S.idx));
    const stage = main.querySelector("#stage");
    if (!item) { stage.innerHTML = `<p class="notice">Esta lección no está disponible.</p>`; return; }
    if (item.kind === "link") { stage.innerHTML = `<a class="button" target="_blank" rel="noopener" href="${esc(item.url)}">Abrir la lección</a>`; return; }
    if (item.kind === "text") { stage.innerHTML = `<div class="material-text">${esc(item.content)}</div>`; return; }
    const frame = document.createElement("iframe"); frame.className = "stage-frame"; frame.title = item.title; S.frame = frame;
    if (/\.html?$/i.test(item.storage_path || "")) {
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-modals");
      if (!S.cache[item.id]) { const { data, error } = await sb.storage.from("library").download(item.storage_path); if (error) { stage.innerHTML = `<p class="notice">No se pudo cargar la lección: ${esc(error.message)}</p>`; return; } S.cache[item.id] = await data.text(); }
      stage.innerHTML = ""; stage.appendChild(frame); frame.srcdoc = guard(S.cache[item.id]); return;
    }
    const { data, error } = await sb.storage.from("library").createSignedUrl(item.storage_path, 3600);
    if (error) { stage.innerHTML = `<p class="notice">No se pudo cargar el archivo.</p>`; return; }
    stage.innerHTML = ""; stage.appendChild(frame); frame.src = data.signedUrl;
  }
  let saveT;
  window.addEventListener("message", e => {
    const d = e.data || {}; if (d.campus !== "lesson" || !S.frame || e.source !== S.frame.contentWindow) return;
    if (d.type === "height" && window.matchMedia("(max-width: 700px)").matches && d.h) { S.frame.style.height = Math.max(300, d.h + 20) + "px"; S.frame.dataset.auto = "1"; }
    if (d.type === "ready") { try { S.frame.contentWindow.postMessage({ campus: "campus", type: "context", role: "student", name: me.profile.full_name, follow: false }, "*"); } catch {} }
    if (d.type === "answers") { clearTimeout(saveT); saveT = setTimeout(async () => { const p = S.e.progress || { done: [], current: 0, answers: {} }; p.answers = p.answers || {}; p.answers[S.idx] = d.answers; const { error } = await sb.from("enrollments").update({ progress: p }).eq("id", S.e.id); if (!error) { S.e.progress = p; const el = $("saved"); if (el) el.textContent = "Respuestas guardadas ✓"; if (d.answers && d.answers["Puntuación"] && !done().has(S.idx)) markDone(S.idx, true); } }, 1200); }
  });
  async function markDone(i, silent) {
    const p = S.e.progress || { done: [], current: 0, answers: {} }; p.done = [...new Set([...(p.done || []), i])]; p.current = Math.min(i + 1, total() - 1);
    const upd = { progress: p }; if (p.done.length >= total() && !S.e.completed_at) upd.completed_at = new Date().toISOString();
    const { error } = await sb.from("enrollments").update(upd).eq("id", S.e.id);
    if (error) { toast("No se pudo guardar: " + error.message); return; }
    Object.assign(S.e, upd);
    if (upd.completed_at) { S.view = "home"; render(); toast("¡Enhorabuena, curso terminado!"); return; }
    if (!silent) { toast("Lección " + (i + 1) + " hecha"); if (i + 1 < total()) openLesson(i + 1); else { S.view = "home"; render(); } } else { const el = $("saved"); if (el) el.textContent = "Lección hecha ✓"; }
  }

  if (!(await load())) return;
  render();
})();
