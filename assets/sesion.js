(async () => {
  const { sb, esc, fmtDate, toast, requireUser, renderShell, qs, initials, copy } = Campus;
  const me = await requireUser();
  renderShell(me, "sesion");
  const sessionId = qs("id");
  if (!sessionId) { location.replace("panel.html"); return; }

  const KIND = {
    reading: "Lectura guiada", single_choice: "Pregunta (una opción)", multi_choice: "Pregunta (varias opciones)",
    numeric: "Respuesta numérica", open: "Respuesta abierta", board: "Pizarra de ideas",
    team_challenge: "Reto en equipo", submission: "Entrega (texto o foto)", exit_ticket: "Ticket de salida"
  };

  const S = { strokes: [], boardLoaded: false, reactions: [], jitsi: null, lessonCache: {}, stageFrame: null, follow: true, lastSection: null, answersTimer: null, savedOnce: false, session: null, group: null, teacher: false, activities: [], materials: [], questions: [], votes: [], help: [], myResponses: {}, presence: {}, focus: null, tab: null, results: {}, members: [] };
  const $ = id => document.getElementById(id);
  const dialog = $("dialog");
  $("dialog-close").addEventListener("click", () => dialog.close());
  function openDialog(title, html, onMount) { $("dialog-title").textContent = title; $("dialog-body").innerHTML = html; dialog.showModal(); onMount && onMount(dialog); }

  async function log(event, payload) {
    try { await sb.from("session_log").insert({ session_id: sessionId, actor_id: me.user.id, event, payload: payload || {} }); } catch {}
  }

  // ---------- carga ----------
  async function loadSession() {
    const { data: s, error } = await sb.from("sessions").select("*, group:groups(*)").eq("id", sessionId).maybeSingle();
    if (error || !s) { $("loading").textContent = "No tienes acceso a esta clase o no existe." + (error ? " (" + error.message + ")" : ""); return false; }
    S.session = s; S.group = s.group;
    const mm = await sb.from("memberships").select("user_id, role").eq("group_id", s.group_id);
    if (mm.error) loadError("los miembros", mm.error);
    const by = await namesFor((mm.data || []).map(m => m.user_id));
    S.members = (mm.data || []).map(m => ({ ...m, profile: by(m.user_id) }));
    S.teacher = me.profile.role === "coordinator" || s.group.teacher_id === me.user.id || S.members.some(m => m.user_id === me.user.id && m.role === "teacher");
    return true;
  }
  async function loadActivities() {
    const { data, error } = await sb.from("activities").select("*").eq("session_id", sessionId).order("position").order("created_at");
    if (error) { loadError("las actividades", error); return; }
    S.activities = data || [];
    const open = S.activities.find(a => a.status === "open");
    if (!S.teacher) S.focus = open ? open.id : (S.session.status === "closed" ? S.focus : null);
    else { const q = S.activities.find(a => a.status === "open" && a.content?.quick); if (q && S.focus !== q.id && !S.focusPinned) S.focus = q.id; else if (!S.focus || !S.activities.some(a => a.id === S.focus)) S.focus = open ? open.id : (S.activities[0]?.id || null); }
  }
  async function loadMaterials() { const { data, error } = await sb.from("materials").select("*").eq("session_id", sessionId).order("position").order("created_at"); if (error) { loadError("el material", error); return; } S.materials = data || []; }
  const nameCache = {};
  async function namesFor(ids) {
    const missing = [...new Set(ids)].filter(id => id && !nameCache[id]);
    if (missing.length) { const { data } = await sb.from("profiles").select("id, full_name").in("id", missing); (data || []).forEach(p => nameCache[p.id] = p.full_name); }
    return id => ({ full_name: nameCache[id] || "Participante" });
  }
  function loadError(what, error) { console.error(what, error); if (!S.errShown) { S.errShown = true; toast("Error al cargar " + what + ": " + error.message); setTimeout(() => S.errShown = false, 15000); } }
  async function loadQuestions() {
    const { data, error } = await sb.from("questions").select("*").eq("session_id", sessionId).order("created_at");
    if (error) { loadError("las dudas", error); return; }
    const by = await namesFor((data || []).map(q => q.user_id));
    S.questions = (data || []).map(q => ({ ...q, author: by(q.user_id) }));
    const ids = S.questions.map(q => q.id);
    const v = ids.length ? await sb.from("question_votes").select("*").in("question_id", ids) : { data: [] };
    if (v.error) loadError("los votos", v.error); S.votes = v.data || [];
  }
  async function loadStrokes() { const { data, error } = await sb.from("board_strokes").select("id, user_id, stroke").eq("session_id", sessionId).order("id"); if (error) { if (!/board_strokes/.test(error.message)) loadError("la pizarra", error); return; } S.strokes = data || []; S.boardLoaded = true; drawBoard(); }
  async function loadReactions() { const { data, error } = await sb.from("reactions").select("*").eq("session_id", sessionId); if (error) { if (!/reactions/.test(error.message)) loadError("el semáforo", error); return; } S.reactions = data || []; }
  async function loadHelp() {
    const { data, error } = await sb.from("help_requests").select("*").eq("session_id", sessionId).eq("status", "open");
    if (error) { loadError("los avisos de ayuda", error); return; }
    const by = await namesFor((data || []).map(h => h.user_id));
    S.help = (data || []).map(h => ({ ...h, author: by(h.user_id) }));
  }
  async function loadMyResponses() {
    const ids = S.activities.map(a => a.id); if (!ids.length) { S.myResponses = {}; return; }
    const { data, error } = await sb.from("responses").select("*").in("activity_id", ids).eq("user_id", me.user.id);
    if (error) { loadError("tus respuestas", error); return; }
    S.myResponses = Object.fromEntries((data || []).map(r => [r.activity_id, r]));
  }
  async function loadResults(activityId) {
    if (!activityId) return;
    const { data, error } = await sb.rpc("get_activity_results", { p_activity: activityId });
    if (error) { loadError("los resultados", error); return; }
    S.results[activityId] = data;
  }


  // ---------- refresco (con o sin tiempo real) ----------
  function signature() {
    const s = S.session; return JSON.stringify([s.status, s.projected_material_id, s.projected_state, s.recording_url, s.allow_guests, s.public_view, s.objectives, s.board_active, s.board_writers, s.started_at, (S.agenda || []).map(x => [x.id, x.status]),
      S.activities.map(a => [a.id, a.status, a.results_shared, a.title, a.closes_at, a.content]), S.materials.map(m => [m.id, m.visible, m.title]),
      S.questions.map(q => [q.id, q.status, q.answer]), S.votes.length, S.reactions.map(r => [r.user_id, r.value]), Object.keys(S.presence).length, S.help.map(h => h.id), Object.keys(S.myResponses), S.results[S.focus]?.total, S.results[S.focus]?.allowed, Object.values(S.results).map(r => r?.total)]);
  }
  function captureForm() {
    const main = $("main"); const f = { text: main.querySelector("#ans-text")?.value, num: main.querySelector("#ans-num")?.value, opts: [...main.querySelectorAll("[name=opt]:checked")].map(i => i.value), q: main.querySelector("#q-text")?.value };
    const side = $("side"); f.qside = side.querySelector("#q-text")?.value; f.bar = $("bar-text")?.value; f.edTitle = main.querySelector("#ed-title")?.value; f.edPrompt = main.querySelector("#ed-prompt")?.value; f.edOpts = main.querySelector("#ed-opts")?.value; f.edText = main.querySelector("#ed-text")?.value; f.edOpen = main.querySelector("details.editor")?.open;
    return f;
  }
  function restoreForm(f) {
    const main = $("main"), side = $("side");
    const set = (el, v) => { if (el && v !== undefined && v !== null && v !== "" && !el.value) el.value = v; };
    set(main.querySelector("#ans-text"), f.text); set(main.querySelector("#ans-num"), f.num); set(side.querySelector("#q-text"), f.qside); if ($("bar-text") && f.bar) $("bar-text").value = f.bar;
    if (f.opts?.length && !main.querySelector("[name=opt]:checked")) f.opts.forEach(v => { const i = main.querySelector(`[name=opt][value="${v}"]`); if (i) i.checked = true; });
    set(main.querySelector("#ed-title"), f.edTitle); set(main.querySelector("#ed-prompt"), f.edPrompt); set(main.querySelector("#ed-opts"), f.edOpts); set(main.querySelector("#ed-text"), f.edText);
    if (f.edOpen && main.querySelector("details.editor")) main.querySelector("details.editor").open = true;
  }
  let lastSig = "", refreshing = false;
  async function refreshAll(force) {
    if (refreshing) return; refreshing = true;
    try {
      if (!(await loadSession())) return;
      await Promise.all([loadActivities(), loadMaterials(), loadQuestions(), loadHelp(), loadReactions()]);
      await loadMyResponses(); await loadResults(S.focus);
      if (S.teacher) { for (const a of S.activities.filter(x => (isQuick(x) || x.content?.auto)).slice(-6)) if (a.id !== S.focus) await loadResults(a.id); }
      const sig = signature();
      if (force || sig !== lastSig) { lastSig = sig; const f = captureForm(); render(); restoreForm(f); gotoTeacherSection(false); }
    } finally { refreshing = false; }
  }

  // ---------- render ----------
  function render() {
    document.body.classList.toggle("teacher", S.teacher); document.body.classList.toggle("student", !S.teacher);
    renderTop(); renderMain(); renderSide(); renderBottom(); renderTools(); updateBar(); semaWidget();
    $("help-btn").hidden = true;
  }
  function liveBadge() {
    const s = S.session;
    if (s.status === "live") return `<span class="live"><i></i> En directo</span>`;
    if (s.status === "closed") return `<span class="live closed">${s.recording_url ? "Grabada" : "Terminada"}</span>`;
    return `<span class="live sched"><i></i> ${fmtDate(s.starts_at)}</span>`;
  }
  function teacherName() { const t = S.members.find(m => m.user_id === S.group.teacher_id); return (t?.profile?.full_name || nameCache[S.group.teacher_id] || "tu maestro").split(" ")[0]; }
  function tickSessionClock() {
    const el = $("s-clock"); if (!el) return;
    const from = S.session.started_at ? new Date(S.session.started_at) : null;
    if (!from || S.session.status !== "live") { el.textContent = ""; return; }
    const ms = Date.now() - from, h = Math.floor(ms / 3600e3), m = Math.floor(ms % 3600e3 / 60000), sec = Math.floor(ms % 60000 / 1000);
    el.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  setInterval(tickSessionClock, 1000);
  function renderTop() {
    const s = S.session, zoom = s.zoom_url || S.group.zoom_url;
    const top = $("c-top");
    top.innerHTML = `<a class="brand" href="panel.html" data-brand></a>
      <div class="t"><h1>${esc(s.title)}</h1><p>${esc(S.group.name)}${S.teacher ? "" : " · " + esc(teacherName())}${S.group.schedule_text ? " · " + esc(S.group.schedule_text) : ""}</p></div>
      ${liveBadge()}
      ${S.teacher ? `<span class="clock" id="s-clock"></span>` : ""}
      <div class="r">
        ${S.teacher ? semaBarHtml() + `<span class="pill">${Object.keys(S.presence).length} conectados</span><span class="rt-dot" id="rt-dot" data-on="${S.rtStatus === "SUBSCRIBED"}"></span>` : ""}
        ${S.teacher ? `<a class="button secondary small" href="biblioteca.html" target="_blank" title="Biblioteca de material">📚</a>` : ""}
        ${S.teacher && s.status !== "closed" ? `<button class="button secondary small" data-act="invite">Invitar</button>` : ""}
        ${!S.teacher ? `<button class="button secondary small" data-act="materials">📄 Material</button>` : ""}
        ${S.teacher ? videoLinkHtml() : ""}
        ${S.teacher ? `<span class="who" title="Salir"><span class="avatar teal">${esc(initials(me.profile.full_name))}</span><button class="button secondary small" data-act="logout">Salir</button></span>` : ""}
      </div>`;
    renderShell(me, "sesion");
    top.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => sessionAction(b.dataset.act)));
    tickSessionClock();
  }
  async function sessionAction(act) {
    if (act === "start") { const first = S.materials.find(m => m.visible); const upd = { status: "live", started_at: S.session.started_at || new Date().toISOString() }; if (!S.session.projected_material_id && first) upd.projected_material_id = first.id; const { error } = await sb.from("sessions").update(upd).eq("id", sessionId); if (error) { toast("No se pudo iniciar: " + error.message); return; } log("session_started"); if (upd.projected_material_id) await ensureLessonActivity(first); toast("Clase iniciada" + (upd.projected_material_id ? " · " + first.title + " en pantalla" : "")); refreshAll(true); }
    if (act === "end") {
      openDialog("Finalizar la clase", `<div class="inline-form"><div class="field"><label for="e-rec">Enlace de la grabación (puedes añadirlo después)</label><input id="e-rec" placeholder="https://…"></div><div class="field"><label for="e-sum">Resumen para el grupo (opcional)</label><textarea id="e-sum" rows="3"></textarea></div><button class="button danger" id="e-go">Finalizar</button></div>`, d => {
        d.querySelector("#e-go").addEventListener("click", async () => {
          await sb.from("activities").update({ status: "closed" }).eq("session_id", sessionId).eq("status", "open").or("content->>auto.is.null,content->>auto.neq.true");
          await sb.from("sessions").update({ status: "closed", recording_url: d.querySelector("#e-rec").value.trim() || null, summary: d.querySelector("#e-sum").value.trim() || null }).eq("id", sessionId);
          log("session_ended"); dialog.close(); toast("Clase finalizada"); await refreshAll(true); summaryDialog();
        });
      });
      return;
    }
    if (act === "recording") {
      openDialog("Grabación de la clase", `<div class="inline-form"><div class="field"><label for="r-url">Enlace (Zoom, YouTube no listado, Drive…)</label><input id="r-url" value="${esc(S.session.recording_url || "")}"></div><button class="button" id="r-go">Guardar</button></div>`, d => {
        d.querySelector("#r-go").addEventListener("click", async () => { await sb.from("sessions").update({ recording_url: d.querySelector("#r-url").value.trim() || null }).eq("id", sessionId); dialog.close(); toast("Grabación guardada"); });
      });
      return;
    }
    if (act === "invite") { inviteDialog(); return; }
    if (act === "logout") { await sb.auth.signOut(); location.replace("index.html"); return; }
    if (act === "materials") { materialsDialog(); return; }
    if (act === "project") { projectDialog(); return; }
    if (act === "activity") { S.ctab = "act"; renderMain(); $("main").querySelector("details.editor")?.scrollIntoView({ behavior: "smooth" }); const d = $("main").querySelector("details.editor"); if (d) d.open = true; return; }
    if (act === "objective") { await toggleNextObjective(); return; }
    if (act === "board") { if (S.session.board_active) { await toggleBoard(false); } else { S.ctab = "board"; renderMain(); } return; }
    if (act === "summary") { summaryDialog(); return; }
    if (act === "delete-session") { if (!confirm(`¿Borrar la clase «${S.session.title}»? Se borrarán sus actividades, respuestas y material.`)) return; const { error } = await sb.from("sessions").delete().eq("id", sessionId); if (error) { toast("No se pudo borrar: " + error.message); return; } location.replace("panel.html"); return; }
    if (act === "quick") { quickDialog(); return; }
    if (act === "quick-close") { const q = openQuick(); if (q) { await sb.from("activities").update({ status: "closed" }).eq("id", q.id); log("activity_closed", { activity_id: q.id }); toast("Pregunta cerrada"); refreshAll(true); } return; }
    if (act === "reopen") { await sb.from("sessions").update({ status: "live" }).eq("id", sessionId); toast("Clase reabierta"); refreshAll(true); }
  }


  // ---- material proyectado (lección incrustada) ----
  function projectedMaterial() {
    const id = S.session.projected_material_id; if (!id) return null;
    const m = S.materials.find(x => x.id === id); return m && (m.visible || S.teacher) ? m : null;
  }
  async function mountStage(container, m) {
    if (S.stageFrame && S.stageFrame.dataset.material === m.id) { container.appendChild(S.stageFrame); return; }
    if (m.kind === "text") { container.innerHTML = `<div class="material-text stage-text">${esc(m.content)}</div>`; return; }
    const frame = document.createElement("iframe"); frame.className = "stage-frame"; frame.dataset.material = m.id; frame.title = m.title;
    container.appendChild(frame); S.stageFrame = frame;
    if (m.kind === "link") { frame.src = m.url; return; }
    if (/\.html?$/i.test(m.storage_path || "")) {
      S.lessonReady = undefined; setTimeout(() => { if (S.lessonReady === undefined && S.stageFrame === frame) { S.lessonReady = false; refreshFollow(); } }, 4000);
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-modals");
      if (!S.lessonCache[m.id]) { const { data, error } = await sb.storage.from(m.bucket || "materials").download(m.storage_path); if (error) { container.innerHTML = `<p class="notice">No se pudo cargar la lección.</p>`; return; } S.lessonCache[m.id] = await data.text(); }
      frame.srcdoc = guardLesson(S.lessonCache[m.id]); return;
    }
    const { data, error } = await sb.storage.from(m.bucket || "materials").createSignedUrl(m.storage_path, 3600);
    if (error) { container.innerHTML = `<p class="notice">No se pudo cargar el archivo.</p>`; return; }
    frame.src = data.signedUrl;
  }
  function stageHtml(m) {
    return `<div class="stage-head"><span class="eyebrow">En pantalla</span><strong>${esc(m.title)}</strong>
      ${S.teacher ? `<button class="button secondary small" data-project="${m.id}">Quitar de pantalla</button>` : `<span id="follow-slot">${followHtml()}</span>`}
      <button class="button secondary small" data-stage-full>Pantalla completa</button></div><div class="stage" id="stage"></div>`;
  }
  function followHtml() {
    if (S.teacher) return "";
    if (S.lessonReady === false) return `<span class="follow-chip" style="background:#e9edf0;color:#566171" title="Esta lección no envía su posición">Lección sin seguimiento</span>`;
    return S.follow ? `<span class="follow-chip">● Vas con ${esc(teacherName())}</span>` : `<button class="follow-back" data-follow>↩ Volver con ${esc(teacherName())}</button>`;
  }
  function refreshFollow() { const el = $("follow-slot"); if (el) { el.innerHTML = followHtml(); el.querySelector("[data-follow]")?.addEventListener("click", () => { S.follow = true; refreshFollow(); gotoTeacherSection(true); }); } }
  function ensureStage(main, pm, cardHtml, renderAct) {
    const stage = main.querySelector("#stage");
    if (!stage || stage.dataset.material !== pm.id) {
      S.stageFrame = null;
      main.innerHTML = `<div id="act-area"></div>` + stageHtml(pm);
      main.querySelector("#stage").dataset.material = pm.id;
      bindStage(main, pm);
    }
    const area = main.querySelector("#act-area");
    const prev = area.querySelector("details"), prevId = prev?.dataset.act, wasOpen = prev ? prev.open : null;
    area.innerHTML = cardHtml;
    const d = area.querySelector("details");
    if (d) { d.dataset.act = cardHtml.match(/#act-slot/) ? (S.teacher ? S.focus : S.activities.find(a => a.status === "open")?.id) : ""; if (prevId === d.dataset.act && wasOpen !== null) d.open = wasOpen; }
    if (renderAct && d) renderAct(area.querySelector("#act-slot"));
  }
  function bindStage(root, m) {
    root.querySelector("[data-follow]")?.addEventListener("click", () => { S.follow = true; refreshFollow(); gotoTeacherSection(true); });
    root.querySelector("[data-stage-full]")?.addEventListener("click", () => { const el = root.querySelector("#stage"); (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); });
    bindMaterials(root); mountStage(root.querySelector("#stage"), m);
  }


  // ---- puente lección ↔ campus (postMessage) ----
  function lessonActivityFor(materialId) { return S.activities.find(a => a.content?.material_id === materialId && a.content?.auto); }
  async function ensureLessonActivity(m) {
    if (!m) return;
    const a = lessonActivityFor(m.id);
    if (a) { if (a.status !== "open") await sb.from("activities").update({ status: "open" }).eq("id", a.id); return; }
    await sb.from("activities").insert({ session_id: sessionId, kind: "submission", title: "Respuestas de la lección: " + m.title, status: "open", position: S.activities.length, content: { auto: true, material_id: m.id, prompt: "Respuestas escritas dentro de la lección «" + m.title + "»" } });
  }
  const LESSON_GUARD = '<script>(function(){var role=null;document.addEventListener(\"click\",function(e){var a=e.target.closest&&e.target.closest(\"a[href]\");if(!a)return;var h=a.getAttribute(\"href\")||\"\";if(h.charAt(0)===\"#\"){e.preventDefault();var id=decodeURIComponent(h.slice(1));var el=id?document.getElementById(id):null;if(el)el.scrollIntoView({behavior:\"smooth\",block:\"start\"});else if(!id)window.scrollTo({top:0,behavior:\"smooth\"});}else if(/^https?:/i.test(h)){a.setAttribute(\"target\",\"_blank\");a.setAttribute(\"rel\",\"noopener\");}},true);document.addEventListener(\"submit\",function(e){e.preventDefault();},true);window.addEventListener(\"message\",function(e){var d=e.data||{};if(d.campus!==\"campus\")return;if(d.type===\"context\")role=d.role;if(d.type===\"goto\"&&typeof d.section===\"string\"&&d.section.indexOf(\"scroll:\")===0){var r=parseFloat(d.section.slice(7))||0;var h=document.documentElement.scrollHeight-window.innerHeight;window.scrollTo({top:r*h,behavior:\"smooth\"});}});setTimeout(function(){if(window.CampusBridge)return;var t;window.addEventListener(\"scroll\",function(){if(role!==\"teacher\")return;clearTimeout(t);t=setTimeout(function(){var h=document.documentElement.scrollHeight-window.innerHeight;var r=h>0?window.scrollY/h:0;if(parent!==window)parent.postMessage({campus:\"lesson\",type:\"position\",section:\"scroll:\"+r.toFixed(3),label:\"Desplazamiento\"},\"*\");},250);},{passive:true});if(parent!==window)parent.postMessage({campus:\"lesson\",type:\"ready\",basic:true},\"*\");},700);})();</script>';
  function guardLesson(html) { return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + LESSON_GUARD) : LESSON_GUARD + html; }
  function postToLesson(msg) { try { S.stageFrame?.contentWindow?.postMessage(Object.assign({ campus: "campus" }, msg), "*"); } catch {} }
  function gotoTeacherSection(force) {
    const st = S.session.projected_state || {};
    if (!st.section || S.teacher || !S.follow) return;
    if (!force && st.section === S.lastSection) return;
    S.lastSection = st.section; S.gotoGuard = true; setTimeout(() => S.gotoGuard = false, 1500); postToLesson({ type: "goto", section: st.section });
  }
  function formatAnswers(ans) {
    if (typeof ans === "string") return ans;
    return Object.entries(ans || {}).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n");
  }
  async function saveLessonAnswers(pm, answers) {
    const a = lessonActivityFor(pm.id); if (!a) return;
    const content = { text: formatAnswers(answers), answers, material_id: pm.id };
    const existing = S.myResponses[a.id];
    const { error } = existing ? await sb.from("responses").update({ content }).eq("id", existing.id)
      : await sb.from("responses").insert({ activity_id: a.id, user_id: me.user.id, content, is_deferred: S.session.status === "closed" });
    if (error) { console.warn(error); return; }
    if (!existing) await loadMyResponses();
    const el = $("lesson-saved"); if (el) { el.hidden = false; }
    if (!S.savedOnce) { S.savedOnce = true; toast("Tus respuestas de la lección se guardan en el campus"); }
  }
  window.addEventListener("message", async e => {
    const d = e.data || {}; if (d.campus !== "lesson" || !S.stageFrame || e.source !== S.stageFrame.contentWindow) return;
    const pm = projectedMaterial(); if (!pm) return;
    if (d.type === "ready") { S.lessonBasic = !!d.basic; S.lessonReady = true; refreshFollow(); postToLesson({ type: "context", role: S.teacher ? "teacher" : "student", name: me.profile.full_name, follow: S.follow }); if (!S.teacher) setTimeout(() => gotoTeacherSection(true), 300); }
    if (d.type === "position" && !S.teacher && d.section && !/^scroll:/.test(d.section)) {
      const ts = S.session.projected_state?.section;
      if (S.follow && ts && d.section !== ts && !S.gotoGuard) { S.follow = false; refreshFollow(); }
    }
    if (d.type === "position" && S.teacher && d.section && d.section !== S.lastSection) {
      S.lastSection = d.section;
      clearTimeout(S.posTimer); S.posTimer = setTimeout(() => sb.from("sessions").update({ projected_state: { section: d.section, label: d.label || null, at: new Date().toISOString() } }).eq("id", sessionId).then(() => {}), 400);
    }
    if (d.type === "answers" && !S.teacher) { clearTimeout(S.answersTimer); S.answersTimer = setTimeout(() => saveLessonAnswers(pm, d.answers), 1500); }
  });


  // ---- invitar a esta clase (invitados sin registro + modo solo ver) ----
  async function inviteDialog() {
    let code = S.session.guest_code;
    if (!code || !S.session.allow_guests) { const { data, error } = await sb.rpc("set_session_guest_code", { p_session: sessionId, p_enable: true }); if (error) { toast("No se pudo generar: " + error.message); return; } code = data; await loadSession(); }
    const base = location.href.replace(/[^/]*$/, ""), link = base + "index.html?clase=" + code, viewLink = base + "ver.html?c=" + code;
    const msg = `Te invito a la clase "${S.session.title}" (${S.group.name}) del campus ${Campus.cfg.brand}.\nEntra aquí: ${link}\nEscribe tu nombre y el código ${code}. Sin registro.`;
    openDialog("Invitar a esta clase", `
      <p class="subtle" style="margin-top:0">Quien tenga este código entra solo a esta clase, sin correo ni contraseña, y caduca al terminar. Para asistentes habituales usa el código de invitados del grupo (Mis grupos → Invitar).</p>
      <div class="code-box"><strong>${esc(code)}</strong><span class="meta">Código de la clase</span></div>
      <div id="qr" style="display:grid;place-items:center;margin:14px 0"></div>
      <div class="live-controls"><button class="button secondary small" id="inv-copy">Copiar enlace</button><a class="button small" target="_blank" rel="noopener" href="${Campus.whatsappMessage(msg)}">Enviar por WhatsApp</a></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
      <label style="display:flex;gap:10px;align-items:center;font-size:15px"><input type="checkbox" id="pv" ${S.session.public_view ? "checked" : ""}> <span><strong>Modo «solo ver»</strong><br><span class="meta">Un enlace público que muestra lo proyectado y sigue al maestro, sin poder responder. Para proyectar en una sala o compartir con quien solo mira.</span></span></label>
      <div id="pv-link" ${S.session.public_view ? "" : "hidden"} style="margin-top:10px"><input readonly value="${esc(viewLink)}" style="width:100%"><div class="live-controls"><button class="button secondary small" id="pv-copy">Copiar enlace público</button></div></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
      <button class="button secondary small" id="inv-off">Dejar de admitir invitados</button>`, d => {
      d.querySelector("#inv-copy").addEventListener("click", () => copy(link));
      d.querySelector("#pv-copy")?.addEventListener("click", () => copy(viewLink));
      d.querySelector("#pv").addEventListener("change", async e => { await sb.from("sessions").update({ public_view: e.target.checked }).eq("id", sessionId); d.querySelector("#pv-link").hidden = !e.target.checked; });
      d.querySelector("#inv-off").addEventListener("click", async () => { await sb.rpc("set_session_guest_code", { p_session: sessionId, p_enable: false }); dialog.close(); toast("Invitados desactivados"); });
      const draw = () => { try { d.querySelector("#qr").innerHTML = ""; new QRCode(d.querySelector("#qr"), { text: link, width: 180, height: 180 }); } catch {} };
      if (window.QRCode) draw(); else { const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"; sc.onload = draw; document.head.appendChild(sc); }
    });
  }


  // ---- turno rápido: el maestro pregunta en voz alta, los alumnos escriben ----
  async function quickDialog() {
    const n = S.activities.filter(isQuick).length + 1, hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    openDialog("Abrir turno de respuesta", `
      <p class="subtle" style="margin-top:0">Lanza la pregunta en voz alta. Los alumnos verán una caja para responder; las respuestas llegan aquí en directo.</p>
      <div class="field"><label for="qk-title">Título (opcional, tres palabras bastan)</label><input id="qk-title" placeholder="Pregunta ${n} · ${hora}"></div>
      <button class="button" id="qk-go" style="width:100%">Abrir a los alumnos</button>`, d => {
      const go = async () => {
        const title = d.querySelector("#qk-title").value.trim() || `Pregunta ${n} · ${hora}`;
        const prev = openQuick(); if (prev) await sb.from("activities").update({ status: "closed" }).eq("id", prev.id);
        const { data, error } = await sb.from("activities").insert({ session_id: sessionId, kind: "open", title, status: "open", opened_at: new Date().toISOString(), position: S.activities.length, content: { quick: true, prompt: "" } }).select().single();
        if (error) { toast("No se pudo abrir: " + error.message); return; }
        S.focus = data.id; log("activity_opened", { activity_id: data.id, quick: true }); dialog.close(); toast("Turno abierto"); refreshAll(true);
      };
      d.querySelector("#qk-go").addEventListener("click", go);
      d.querySelector("#qk-title").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      setTimeout(() => d.querySelector("#qk-title").focus(), 50);
    });
  }
  function bubblesHtml(a, res) {
    const items = res?.items || [];
    const present = Object.values(S.presence).filter(p => p.id !== me.user.id && p.roleLabel !== "Maestro/a" && p.roleLabel !== "Coordinación").length;
    const answered = new Set(items.map(i => i.user_id)).size;
    return `<div class="turn-head"><h2>${esc(a.title)}</h2><span class="turn-counter">${answered} de ${Math.max(present, answered)} han respondido</span></div>
      ${a.content?.prompt ? `<p class="live-prompt">${esc(a.content.prompt)}</p>` : ""}
      <div class="bubbles">${items.length ? items.map(i => `<div class="bubble"><span class="who">${esc(i.name || "Alumno/a")}${i.guest ? " · invitado" : ""}${i.deferred ? " · diferido" : ""}</span><p>${esc(i.content.text || "")}</p>${i.content.storage_path ? `<a class="live-link" data-file="${esc(i.content.storage_path)}" href="#">Ver archivo</a>` : ""}</div>`).join("") : `<p class="meta">Esperando respuestas…</p>`}</div>`;
  }

  // ---- panel principal ----
  function renderMain() {
    const main = $("main");
    if (S.teacher) return renderTeacherMain(main);
    const s = S.session;
    const open = S.activities.find(a => a.status === "open" && !a.content?.auto);
    const q = openQuick();
    const askHtml = q ? `<div class="ask-card"><p class="eyebrow">${esc(teacherName())} te pregunta</p><h2>${esc(q.title)}</h2><p>${S.myResponses[q.id] ? "Tu respuesta está enviada. Puedes completarla en la caja de abajo." : "Escucha la pregunta y escribe tu respuesta en la caja de abajo."}</p>${S.myResponses[q.id] ? `<div class="mine">${esc(S.myResponses[q.id].content?.text || "")}</div>` : ""}${S.results[q.id]?.allowed ? `<h3 style="margin:12px 0 6px">Respuestas del grupo</h3>${resultsHtml(q, S.results[q.id])}` : ""}</div>` : "";
    const cardHtml = (open && !isQuick(open)) ? `<details class="activity-card" open><summary><span class="tag live">Actividad</span> ${esc(open.title)}</summary><div id="act-slot"></div></details>` : "";
    const renderAct = (open && !isQuick(open)) ? slot => renderStudentActivity(slot, open, false) : null;
    if (s.status === "closed") {
      const done = S.activities.filter(a => a.status !== "draft" && !a.content?.auto);
      if (S.focus && done.some(a => a.id === S.focus)) return renderStudentActivity(main, done.find(a => a.id === S.focus), true);
      const pm = projectedMaterial();
      main.innerHTML = `<div class="student-wait" style="padding:10px 0 18px"><h2>La clase terminó</h2><p>${s.recording_url ? `<a class="button" target="_blank" rel="noopener" href="${esc(s.recording_url)}">Ver la grabación</a><br><br>Puedes hacer las actividades igualmente.` : "Cuando esté la grabación, aparecerá aquí."}</p>${s.summary ? `<p><strong>Resumen:</strong> ${esc(s.summary)}</p>` : ""}</div>
        ${done.length ? `<ul class="seq">${done.map(a => `<li><span class="kind">${KIND[a.kind]}</span><div class="row"><strong>${esc(a.title)}</strong>${S.myResponses[a.id] ? `<span class="tag">Respondida</span>` : ""}<button class="button secondary small" data-focus="${a.id}">${S.myResponses[a.id] ? "Ver" : "Hacer"}</button></div></li>`).join("")}</ul>` : ""}
        ${pm ? `<div style="margin-top:16px">${stageHtml(pm)}</div>` : ""}`;
      if (pm) bindStage(main, pm);
      main.querySelectorAll("[data-focus]").forEach(b => b.addEventListener("click", async () => { S.focus = b.dataset.focus; await loadResults(S.focus); renderMain(); }));
      return;
    }
    if (s.board_active) {
      S.stageFrame = null;
      if (!main.querySelector("#board")) { main.innerHTML = `<div id="act-area"></div><div class="stage-head"><span class="eyebrow">En pantalla</span><strong>Pizarra de ${esc(teacherName())}</strong>${canWrite() ? `<span class="follow-chip">✎ Tienes el lápiz</span>` : ""}</div>${boardHtml()}`; bindBoard(main); }
      else { const chip = main.querySelector(".stage-head .follow-chip"); if (!!chip !== canWrite()) { main.innerHTML = ""; renderMain(); return; } }
      const area = main.querySelector("#act-area"); area.innerHTML = askHtml + cardHtml; if (renderAct) renderAct(area.querySelector("#act-slot"));
      return;
    }
    const pm = projectedMaterial();
    if (pm) { ensureStage(main, pm, askHtml + cardHtml, renderAct); return; }
    S.stageFrame = null;
    main.innerHTML = askHtml + cardHtml + (!q && !open ? `<div class="student-wait"><h2>${s.status === "live" ? "Escucha a " + esc(teacherName()) : "Todavía no ha empezado"}</h2><p>${s.status === "live" ? "Cuando muestre la lección o haga una pregunta, aparecerá aquí." : "La clase es " + fmtDate(s.starts_at) + ". Puedes dejar esta pantalla abierta."}</p></div>` : "");
    if (renderAct) renderAct(main.querySelector("#act-slot"));
  }
  function renderStudentActivity(main, a, deferred) {
    const c = a.content || {}, r = S.myResponses[a.id], rc = r?.content || {};
    if (isQuick(a) && !deferred) {
      main.innerHTML = `<div class="q-inline"><p class="eyebrow">El maestro ha lanzado una pregunta</p><strong>${esc(a.title)}</strong><p class="meta" style="margin:6px 0 0">${r ? "Tu respuesta está enviada. Puedes completarla desde la caja de abajo." : "Escucha la pregunta y responde en la caja de abajo."}</p></div>
        ${r ? `<div class="bubble" style="max-width:600px"><span class="who">Tu respuesta</span><p>${esc(rc.text || "")}</p></div>` : ""}
        ${S.results[a.id]?.allowed ? `<h3>Respuestas del grupo</h3>${resultsHtml(a, S.results[a.id])}` : ""}`;
      return;
    }
    const editable = a.status === "open" || (deferred && !r);
    const res = S.results[a.id];
    let form = "";
    if (a.kind === "reading") form = `<div class="live-lesson">${esc(c.text || "")}</div>${c.prompt ? `<p class="live-prompt" style="margin-top:16px">${esc(c.prompt)}</p><div class="field"><textarea id="ans-text" rows="3" ${editable ? "" : "disabled"}>${esc(rc.text || "")}</textarea></div>` : ""}`;
    else if (a.kind === "single_choice" || a.kind === "multi_choice") form = `<p class="live-prompt">${esc(c.prompt || "")}</p><div class="choice-list">${(c.options || []).map((o, i) => `<label><input type="${a.kind === "single_choice" ? "radio" : "checkbox"}" name="opt" value="${i}" ${(rc.choice || []).includes(i) ? "checked" : ""} ${editable ? "" : "disabled"}> ${esc(o)}</label>`).join("")}</div>`;
    else if (a.kind === "numeric") form = `<p class="live-prompt">${esc(c.prompt || "")}</p><div class="field"><input id="ans-num" type="number" step="any" value="${rc.value ?? ""}" ${editable ? "" : "disabled"}></div>`;
    else form = `<p class="live-prompt">${esc(c.prompt || "")}</p><div class="field"><textarea id="ans-text" rows="${a.kind === "exit_ticket" ? 2 : 4}" placeholder="${a.kind === "board" ? "Una idea corta" : a.kind === "exit_ticket" ? "¿Qué te llevas de hoy?" : "Tu respuesta"}" ${editable ? "" : "disabled"}>${esc(rc.text || "")}</textarea></div>
      ${a.kind === "submission" || c.allow_image ? `<div class="field"><label for="ans-file">Foto o archivo (opcional)</label><input id="ans-file" type="file" accept="image/*,.pdf" ${editable ? "" : "disabled"}>${rc.storage_path ? `<span class="meta">Ya subiste un archivo.</span>` : ""}</div>` : ""}`;
    const hasForm = !(a.kind === "reading" && !c.prompt);
    main.innerHTML = `<div class="live-activity-head"><div><p class="eyebrow">${KIND[a.kind]}${deferred ? " · en diferido" : ""}</p><h2 style="margin:0">${esc(a.title)}</h2></div>${deferred ? `<button class="button secondary small" id="back">Volver</button>` : a.closes_at ? `<span class="live-clock" id="clock"></span>` : ""}</div>
      ${form}
      ${hasForm ? `<div class="live-controls">${editable ? `<button class="button" id="send">${r ? "Actualizar respuesta" : "Enviar respuesta"}</button>` : ""}${r ? `<span class="status">Respuesta enviada${r.is_deferred ? " (diferido)" : ""}</span>` : a.status === "closed" ? `<span class="meta">Actividad cerrada</span>` : ""}</div>` : ""}
      ${res?.allowed ? `<h3>Resultados del grupo</h3>${resultsHtml(a, res)}` : ""}`;
    main.querySelector("#back")?.addEventListener("click", () => { S.focus = null; renderMain(); });
    main.querySelector("#send")?.addEventListener("click", () => sendResponse(a, deferred));
    if (a.closes_at) tickClock(a);
  }

  function tickClock(a) {
    const el = $("clock"); if (!el) return;
    const upd = () => { const ms = new Date(a.closes_at) - Date.now(); if (ms <= 0) { el.textContent = "Tiempo agotado"; return; } const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000); el.textContent = `${m}:${String(s).padStart(2, "0")}`; setTimeout(upd, 1000); };
    upd();
  }

  async function sendResponse(a, deferred) {
    const main = $("main"), content = {};
    if (a.kind === "single_choice" || a.kind === "multi_choice") { content.choice = [...main.querySelectorAll("[name=opt]:checked")].map(i => Number(i.value)); if (!content.choice.length) { toast("Elige una opción"); return; } }
    else if (a.kind === "numeric") { const v = main.querySelector("#ans-num").value; if (v === "") { toast("Escribe un número"); return; } content.value = Number(v); }
    else { content.text = main.querySelector("#ans-text")?.value.trim() || ""; const f = main.querySelector("#ans-file")?.files[0]; if (!content.text && !f) { toast("Escribe algo o adjunta un archivo"); return; }
      if (f) { const path = `${S.group.id}/${me.user.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`; const { error } = await sb.storage.from("submissions").upload(path, f); if (error) { toast("No se pudo subir el archivo"); return; } content.storage_path = path; }
      else if (S.myResponses[a.id]?.content?.storage_path) content.storage_path = S.myResponses[a.id].content.storage_path; }
    const existing = S.myResponses[a.id];
    const q = existing ? sb.from("responses").update({ content }).eq("id", existing.id) : sb.from("responses").insert({ activity_id: a.id, user_id: me.user.id, content, is_deferred: !!deferred });
    const { error } = await q;
    if (error) { toast("No se pudo enviar: " + (error.message.includes("policy") ? "la actividad ya está cerrada" : error.message)); return; }
    log("response", { activity_id: a.id, deferred: !!deferred });
    toast("Respuesta enviada"); refreshAll(true);
  }

  function resultsHtml(a, res) {
    const items = res.items || [], c = a.content || {};
    if (a.kind === "single_choice" || a.kind === "multi_choice") {
      const counts = (c.options || []).map((_, i) => items.filter(it => (it.content.choice || []).includes(i)).length), max = Math.max(1, ...counts);
      return `<p class="meta">${res.total} ${res.total === 1 ? "respuesta" : "respuestas"}</p>` + (c.options || []).map((o, i) => `<div class="result-bar"><span>${esc(o)}${S.teacher && (c.correct || []).includes(i) ? " ✓" : ""}</span><strong>${counts[i]}</strong><div class="track"><div class="fill" style="width:${counts[i] / max * 100}%"></div></div></div>`).join("");
    }
    if (a.kind === "numeric") { const vals = items.map(i => i.content.value).filter(v => typeof v === "number"); const avg = vals.length ? (vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(2) : "—"; return `<p class="meta">${vals.length} respuestas · media ${avg}</p>${S.teacher ? `<table class="responses-table">${items.map(i => `<tr><td>${esc(i.name || "Alumno/a")}</td><td>${esc(i.content.value)}</td></tr>`).join("")}</table>` : ""}`; }
    if (S.teacher && textKinds.includes(a.kind)) return bubblesHtml(a, res);
    if (a.kind === "board" || (!S.teacher && a.results_shared)) return `<div class="live-board">${items.map(i => `<div class="live-note">${esc(i.content.text || "")}${S.teacher && i.name ? `<br><small class="meta">${esc(i.name)}</small>` : ""}</div>`).join("") || `<p class="meta">Sin aportaciones todavía.</p>`}</div>`;
    return `<table class="responses-table">${items.map(i => `<tr><td>${esc(i.name || "Alumno/a")}${i.guest ? ` <span class="tag">invitado</span>` : ""}${i.deferred ? ` <span class="tag closed">diferido</span>` : ""}</td><td>${esc(i.content.text || "")}${i.content.storage_path ? `<a class="live-link" data-file="${esc(i.content.storage_path)}" href="#">Ver archivo</a>` : ""}</td></tr>`).join("") || `<tr><td colspan="2" class="meta">Sin respuestas todavía.</td></tr>`}</table>`;
  }

  // ---- panel principal del maestro ----
  function renderTeacherMain(main) {
    const pm = projectedMaterial(), q = openQuick();
    if (!S.ctab) S.ctab = pm ? "lesson" : "act";
    if (S.autoTab !== (q?.id || "") ) { S.autoTab = q?.id || ""; if (q) S.ctab = "act"; }
    if (S.lastPm !== (pm?.id || "")) { S.lastPm = pm?.id || ""; if (pm) S.ctab = "lesson"; }
    const followers = Object.values(S.presence).filter(p => p.id !== me.user.id).length;
    if (S.lastBoard !== !!S.session.board_active) { S.lastBoard = !!S.session.board_active; if (S.session.board_active) S.ctab = "board"; else if (S.ctab === "board") S.ctab = pm ? "lesson" : "act"; }
    $("c-tabs").innerHTML = `<button data-ctab="lesson" aria-pressed="${S.ctab === "lesson"}">Lección</button><button data-ctab="board" aria-pressed="${S.ctab === "board"}">Pizarra${S.session.board_active ? " ●" : ""}</button><button data-ctab="act" aria-pressed="${S.ctab === "act"}">Actividad${q ? " ●" : ""}</button><span class="spacer"></span>${S.session.board_active ? `<span class="sync">Pizarra en pantalla</span>` : pm ? `<span class="sync">${esc(pm.title)} en pantalla · ${followers} conectados</span>` : ""}`;
    $("c-tabs").querySelectorAll("[data-ctab]").forEach(b => b.addEventListener("click", () => { S.ctab = b.dataset.ctab; renderMain(); }));
    if (S.ctab === "board") {
      S.stageFrame = null;
      main.innerHTML = `<div class="stage-head"><span class="eyebrow">${S.session.board_active ? "En pantalla para todos" : "Solo la ves tú"}</span><strong>Pizarra</strong>${S.session.board_active ? `<button class="button secondary small" data-board-off>Quitar de pantalla</button>` : `<button class="button teal small" data-board-on>Mostrar a los alumnos</button>`}</div>${boardHtml()}`;
      main.querySelector("[data-board-on]")?.addEventListener("click", () => toggleBoard(true));
      main.querySelector("[data-board-off]")?.addEventListener("click", () => toggleBoard(false));
      bindBoard(main); return;
    }
    if (S.ctab === "lesson") {
      if (pm) { ensureStage(main, pm, "", null); return; }
      S.stageFrame = null;
      const list = S.materials;
      main.innerHTML = `<div class="live-wait"><h2>Nada en pantalla</h2><p>Elige un material para mostrarlo a todos los alumnos a la vez.</p>${list.length ? `<div class="live-controls" style="justify-content:center"><button class="button teal" data-act="project">Proyectar material</button></div>` : `<p class="meta">Añade material desde la tarjeta «Material» de abajo.</p>`}</div>`;
      main.querySelector("[data-act]")?.addEventListener("click", () => projectDialog());
      return;
    }
    S.stageFrame = null;
    const a = S.activities.find(x => x.id === S.focus);
    const seq = S.activities.length ? `<div class="seq-wrap"><p class="eyebrow" style="margin:0 0 8px">Secuencia</p><ul class="seq">${S.activities.map(x => `<li class="${x.status}${x.id === S.focus ? " focus" : ""}"><span class="kind">${x.content?.auto ? "Lección" : isQuick(x) ? "Pregunta en voz alta" : KIND[x.kind]}</span><div class="row"><strong>${esc(x.title)}</strong>${x.status === "open" ? `<span class="tag live">Abierta</span>` : x.status === "closed" ? `<span class="tag closed">Cerrada</span>` : ""}<button class="button secondary small" data-focus="${x.id}">Ver</button>${x.status !== "open" && !x.content?.auto ? `<button class="button teal small" data-open="${x.id}">Abrir</button>` : ""}</div></li>`).join("")}</ul></div>` : "";
    if (!a) { main.innerHTML = `<div class="live-wait" style="padding:20px"><h2>Prepara la secuencia</h2><p>Añade lecturas, preguntas, pizarra de ideas o entregas. En clase las abres una a una y ves las respuestas al momento. Para una pregunta improvisada usa el botón «Pregunta» de abajo.</p></div>${editorHtml()}${seq}`; bindEditor(main); bindSeq(main); return; }
    main.innerHTML = `<div id="act-view"></div>${seq}<div id="ed-slot"></div>`;
    renderTeacherActivity(main.querySelector("#act-view"), a); bindSeq(main);
    if (!main.querySelector("details.editor")) { main.querySelector("#ed-slot").innerHTML = editorHtml(); bindEditor(main); }
  }
  function bindSeq(root) {
    root.querySelectorAll("[data-focus]").forEach(b => b.addEventListener("click", async () => { S.focus = b.dataset.focus; S.focusPinned = true; setTimeout(() => S.focusPinned = false, 60000); await loadResults(S.focus); renderMain(); }));
    root.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => activityAction(S.activities.find(x => x.id === b.dataset.open), "open")));
  }
  function renderTeacherActivity(main, a) {
    const c = a.content || {}, res = S.results[a.id];
    if (isQuick(a)) {
      main.innerHTML = `<div class="live-activity-head"><div><p class="eyebrow">Pregunta en voz alta · ${a.status === "open" ? "abierta" : "cerrada"}</p></div><div class="live-controls" style="margin:0">
          ${a.status === "open" ? `<button class="button small" data-a="close">Cerrar</button>` : `<button class="button teal small" data-a="open">Reabrir</button>`}
          <button class="button secondary small" data-a="share" aria-pressed="${a.results_shared}">${a.results_shared ? "Visible para el grupo" : "Compartir con el grupo"}</button>
          <button class="button secondary small" data-a="delete">Borrar</button></div></div>
        ${bubblesHtml(a, res)}`;
      main.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => activityAction(a, b.dataset.a)));
      bindFiles(main); return;
    }
    main.innerHTML = `<div class="live-activity-head"><div><p class="eyebrow">${KIND[a.kind]} · ${a.status === "open" ? "abierta" : a.status === "closed" ? "cerrada" : "sin abrir"}</p><h2 style="margin:0">${esc(a.title)}</h2></div><div class="live-controls" style="margin:0">
        ${a.status !== "open" ? `<button class="button teal small" data-a="open">${a.status === "closed" ? "Reabrir" : "Abrir a los alumnos"}</button>` : `<button class="button small" data-a="close">Cerrar</button>`}
        <button class="button secondary small" data-a="share" aria-pressed="${a.results_shared}">${a.results_shared ? "Resultados visibles" : "Mostrar resultados"}</button>
        <button class="button secondary small" data-a="edit">Editar</button>
        <button class="button secondary small" data-a="delete">Borrar</button></div></div>
      ${a.kind === "reading" ? `<div class="live-lesson">${esc(c.text || "")}</div>` : ""}
      ${c.prompt ? `<p class="live-prompt">${esc(c.prompt)}</p>` : ""}
      ${(c.options || []).length ? `<ul class="list-clean" style="margin:0 0 12px">${c.options.map((o, i) => `<li>${(c.correct || []).includes(i) ? "✓ " : "· "}${esc(o)}</li>`).join("")}</ul>` : ""}
      <h3 style="margin-top:22px">Respuestas ${res ? `<span class="meta">(${res.total})</span>` : ""}</h3>
      ${res ? resultsHtml(a, res) : `<p class="meta">Cargando…</p>`}
      ${editorHtml()}`;
    main.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => activityAction(a, b.dataset.a)));
    bindEditor(main); bindFiles(main);
  }

  async function activityAction(a, act) {
    if (act === "open") { await sb.from("activities").update({ status: "open", opened_at: new Date().toISOString(), closes_at: a.content?.minutes ? new Date(Date.now() + a.content.minutes * 60000).toISOString() : null }).eq("id", a.id); log("activity_opened", { activity_id: a.id }); toast("Actividad abierta"); }
    if (act === "close") { await sb.from("activities").update({ status: "closed" }).eq("id", a.id); log("activity_closed", { activity_id: a.id }); }
    if (act === "share") { await sb.from("activities").update({ results_shared: !a.results_shared }).eq("id", a.id); log("results_shared", { activity_id: a.id, shared: !a.results_shared }); }
    if (act === "delete") { if (!confirm("¿Borrar esta actividad y sus respuestas?")) return; await sb.from("activities").delete().eq("id", a.id); S.focus = null; }
    if (act !== "edit") refreshAll(true);
    if (act === "edit") { const d = $("main").querySelector("details.editor"); d.open = true; fillEditor(d, a); d.scrollIntoView({ behavior: "smooth" }); }
  }

  function editorHtml() {
    return `<details class="editor"><summary>Nueva actividad</summary>
      <div class="inline-form" style="margin-top:12px">
        <input type="hidden" id="ed-id">
        <div class="row"><div class="field"><label for="ed-kind">Tipo</label><select id="ed-kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
          <div class="field"><label for="ed-title">Título</label><input id="ed-title" placeholder="Título corto"></div></div>
        <div class="field" id="ed-text-f" hidden><label for="ed-text">Texto de la lectura</label><textarea id="ed-text" rows="5"></textarea></div>
        <div class="field"><label for="ed-prompt">Pregunta o consigna</label><textarea id="ed-prompt" rows="2"></textarea></div>
        <div class="field" id="ed-opts-f" hidden><label for="ed-opts">Opciones (una por línea; marca la correcta con * al inicio, opcional)</label><textarea id="ed-opts" rows="4"></textarea></div>
        <div class="row"><div class="field"><label for="ed-min">Tiempo límite en minutos (opcional)</label><input id="ed-min" type="number" min="1"></div>
          <div class="field" id="ed-img-f"><label><input type="checkbox" id="ed-img"> Permitir subir foto o archivo</label></div></div>
        <p class="form-error" id="ed-error"></p>
        <div class="live-controls"><button class="button" id="ed-save">Guardar actividad</button><button class="button secondary" id="ed-cancel" hidden>Cancelar edición</button></div>
      </div></details>`;
  }
  function bindEditor(root) {
    const kind = root.querySelector("#ed-kind"); if (!kind) return;
    const upd = () => { const k = kind.value; root.querySelector("#ed-text-f").hidden = k !== "reading"; root.querySelector("#ed-opts-f").hidden = !(k === "single_choice" || k === "multi_choice"); root.querySelector("#ed-img-f").hidden = !["open", "team_challenge", "submission"].includes(k); };
    kind.addEventListener("change", upd); upd();
    root.querySelector("#ed-cancel").addEventListener("click", () => { fillEditor(root, null); });
    root.querySelector("#ed-save").addEventListener("click", async () => {
      const k = kind.value, title = root.querySelector("#ed-title").value.trim(), err = root.querySelector("#ed-error");
      if (!title) { err.textContent = "Ponle un título."; return; }
      const content = { prompt: root.querySelector("#ed-prompt").value.trim() };
      if (k === "reading") content.text = root.querySelector("#ed-text").value.trim();
      if (k === "single_choice" || k === "multi_choice") { const lines = root.querySelector("#ed-opts").value.split("\n").map(l => l.trim()).filter(Boolean); if (lines.length < 2) { err.textContent = "Escribe al menos dos opciones."; return; } content.options = lines.map(l => l.replace(/^\*\s*/, "")); content.correct = lines.map((l, i) => l.startsWith("*") ? i : -1).filter(i => i >= 0); }
      if (["open", "team_challenge", "submission"].includes(k)) content.allow_image = k === "submission" || root.querySelector("#ed-img").checked;
      const min = Number(root.querySelector("#ed-min").value); if (min > 0) content.minutes = min;
      const id = root.querySelector("#ed-id").value;
      const { data, error } = id ? await sb.from("activities").update({ kind: k, title, content }).eq("id", id).select().single()
        : await sb.from("activities").insert({ session_id: sessionId, kind: k, title, content, position: S.activities.length }).select().single();
      if (error) { err.textContent = error.message; return; }
      toast(id ? "Actividad actualizada" : "Actividad añadida"); S.focus = data.id; refreshAll(true);
    });
  }
  function fillEditor(root, a) {
    root.querySelector("#ed-id").value = a?.id || ""; root.querySelector("#ed-kind").value = a?.kind || "single_choice"; root.querySelector("#ed-kind").dispatchEvent(new Event("change"));
    root.querySelector("#ed-title").value = a?.title || ""; root.querySelector("#ed-prompt").value = a?.content?.prompt || ""; root.querySelector("#ed-text").value = a?.content?.text || "";
    root.querySelector("#ed-opts").value = (a?.content?.options || []).map((o, i) => ((a.content.correct || []).includes(i) ? "* " : "") + o).join("\n");
    root.querySelector("#ed-min").value = a?.content?.minutes || ""; root.querySelector("#ed-img").checked = !!a?.content?.allow_image;
    root.querySelector("#ed-cancel").hidden = !a; root.querySelector("#ed-save").textContent = a ? "Guardar cambios" : "Guardar actividad"; root.querySelector("summary").textContent = a ? "Editando: " + a.title : "Nueva actividad";
  }

  // ---- lateral ----
  function renderSide() {
    if (!S.teacher) return renderStudentSide();
    const tabs = [["chat", "Chat"], ["people", "Participantes"], ["notes", "Notas"]];
    if (!S.tab || !tabs.some(t => t[0] === S.tab)) S.tab = "chat";
    const pending = S.questions.filter(q => q.status === "pending").length, helping = S.help.length;
    let vs = $("video-slot"); if (!vs) { vs = document.createElement("div"); vs.id = "video-slot"; vs.className = "teacher-video c-video"; $("c-center").before(vs); }
    renderVideo();
    $("tabs").innerHTML = tabs.map(([k, l]) => `<button data-tab="${k}" aria-pressed="${S.tab === k}">${l}${k === "chat" && pending ? ` (${pending})` : ""}${k === "people" && helping ? ` (${helping}!)` : ""}</button>`).join("");
    $("tabs").querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderSide(); }));
    const side = $("side");
    if (S.tab === "chat") {
      const items = [];
      S.questions.forEach(q => items.push({ t: new Date(q.created_at), html: `<div class="msg duda ${q.status}"><span class="avatar teal">${esc(initials(q.author?.full_name))}</span><div><span class="who">${esc(q.author?.full_name || "")} · ${fmtDate(q.created_at, { hour: "2-digit", minute: "2-digit" })} <span class="tag" style="background:#faf0d6;color:#7a5c14">Duda</span>${votes(q.id) ? ` · ${votes(q.id)} votos` : ""}</span><div class="b">${esc(q.text)}</div>${q.answer ? `<div class="b ans">↳ ${esc(q.answer)}</div>` : ""}<div class="acts"><button class="button secondary small" data-reply="${q.id}">${q.answer ? "Editar respuesta" : "Responder"}</button>${q.status === "pending" ? `<button class="button secondary small" data-answered="${q.id}">Respondida</button>` : ""}</div></div></div>` }));
      S.activities.filter(a => isQuick(a) || a.content?.auto).forEach(a => {
        const res = S.results[a.id], its = res?.items || [];
        items.push({ t: new Date(a.opened_at || a.created_at), html: `<div class="turn"><div class="th">${a.content?.auto ? "✎" : "🎙"} ${esc(a.title)} <span class="cnt">${its.length} ${a.status === "open" ? "· abierta" : ""}</span></div><div class="msgs">${its.slice(-4).map(i => `<div><b>${esc((i.name || "Alumno/a").split(" ")[0])}</b>${esc((i.content?.text || "").slice(0, 160))}</div>`).join("") || `<div class="meta">Sin respuestas todavía.</div>`}${its.length > 4 || its.some(i => (i.content?.text || "").length > 160) ? `<button class="more" data-focus="${a.id}">ver todas →</button>` : ""}</div></div>` });
      });
      items.sort((x, y) => y.t - x.t);
      side.innerHTML = items.length ? `<div class="thread">${items.map(i => i.html).join("")}</div>` : `<p class="subtle">Aquí aparecerán las dudas de los alumnos, las respuestas a tus preguntas en voz alta y lo que escriban en la lección.</p>`;
      side.querySelectorAll("[data-answered]").forEach(b => b.addEventListener("click", async () => { await sb.from("questions").update({ status: "answered" }).eq("id", b.dataset.answered); refreshAll(true); }));
      side.querySelectorAll("[data-reply]").forEach(b => b.addEventListener("click", () => { const q = S.questions.find(x => x.id === b.dataset.reply); openDialog("Responder por escrito", `<p class="subtle" style="margin-top:0">${esc(q.text)}</p><textarea id="rp" rows="3" style="width:100%">${esc(q.answer || "")}</textarea><div class="live-controls"><button class="button" id="rp-go">Enviar a ${esc((q.author?.full_name || "").split(" ")[0])}</button></div>`, d => d.querySelector("#rp-go").addEventListener("click", async () => { const { error } = await sb.from("questions").update({ answer: d.querySelector("#rp").value.trim() || null, answered_at: new Date().toISOString(), status: "answered" }).eq("id", q.id); if (error) toast(error.message); dialog.close(); refreshAll(true); })); }));
      side.querySelectorAll("[data-focus]").forEach(b => b.addEventListener("click", async () => { S.focus = b.dataset.focus; S.ctab = "act"; await loadResults(S.focus); renderMain(); }));
    }
    if (S.tab === "people") {
      const open = S.activities.find(a => a.status === "open" && !a.content?.auto); const answered = new Set((S.results[open?.id]?.items || []).map(i => i.user_id));
      const students = S.members.filter(m => m.role === "student" || m.role === "guest");
      const order = { lost: 0, meh: 1, ok: 3 };
      students.sort((a, b) => (order[S.reactions.find(r => r.user_id === a.user_id)?.value] ?? 2) - (order[S.reactions.find(r => r.user_id === b.user_id)?.value] ?? 2));
      const rows = students.map(m => { const on = !!S.presence[m.user_id], h = S.help.find(x => x.user_id === m.user_id); const rx = S.reactions.find(r => r.user_id === m.user_id); return `<li><span class="dot ${on ? "on" : ""}"></span><span>${esc(m.profile?.full_name || "")}${m.role === "guest" ? ` <span class="meta">(invitado)</span>` : ""}</span><span class="flags">${rx ? `<span class="rx rx-${rx.value}" title="${rx.value === "ok" ? "Voy bien" : rx.value === "meh" ? "Más o menos" : "No lo entiendo"}"></span>` : ""}${h ? `<span class="tag help">Pide ayuda</span><button class="button secondary small" data-resolve="${h.id}">Atendido</button>` : ""}${open && answered.has(m.user_id) ? `<span class="tag done">Respondió</span>` : ""}</span></li>`; });
      const guests = Object.values(S.presence).filter(p => !students.some(m => m.user_id === p.id) && p.id !== me.user.id).map(p => `<li><span class="dot on"></span><span>${esc(p.name)}</span><span class="meta" style="margin-left:auto">${esc(p.roleLabel)}</span></li>`);
      side.innerHTML = `<p class="meta" style="margin:0 0 8px">${Object.keys(S.presence).length} conectados · ${students.length} en el grupo</p>${semaforoHtml()}<ul class="presence">${rows.join("")}${guests.join("")}</ul>${S.help.filter(h => h.message).map(h => `<p class="live-answer" style="margin-top:10px"><strong>${esc(h.author?.full_name)}:</strong> ${esc(h.message)}</p>`).join("")}`;
      side.querySelectorAll("[data-resolve]").forEach(b => b.addEventListener("click", async () => { await sb.from("help_requests").update({ status: "resolved" }).eq("id", b.dataset.resolve); refreshAll(true); }));
    }
    if (S.tab === "notes") {
      side.innerHTML = `<p class="meta" style="margin:0 0 8px">Notas privadas: solo las ves tú. Se guardan solas.</p><textarea class="notes" id="notes">${esc(S.session.teacher_notes || "")}</textarea><p class="meta" id="notes-st"></p>`;
      const ta = side.querySelector("#notes"); let t;
      ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(async () => { const { error } = await sb.from("sessions").update({ teacher_notes: ta.value }).eq("id", sessionId); side.querySelector("#notes-st").textContent = error ? "No se pudo guardar" : "Guardado ✓"; S.session.teacher_notes = ta.value; }, 800); });
    }
  }
  function renderStudentSide() {
    if (!S.seenAnswers) { try { S.seenAnswers = JSON.parse(localStorage.getItem("seen:" + sessionId) || "[]"); } catch { S.seenAnswers = []; } }
    const visible = S.materials.filter(m => m.visible);
    $("tabs").innerHTML = "";
    const answered = S.questions.filter(q => q.user_id === me.user.id && q.answer && !(S.seenAnswers || []).includes(q.id));
    const side = $("side"); if (!side.querySelector("#video-slot")) { side.innerHTML = `<button class="side-toggle" id="side-toggle" title="Reducir el vídeo"></button><div id="video-slot"></div><div id="side-rest"></div>`;
      try { if (localStorage.getItem("side-mini") === "1") document.body.classList.add("side-mini"); } catch {}
      const upd = () => { const mini = document.body.classList.contains("side-mini"); $("side-toggle").textContent = mini ? "⤢ Ampliar" : "⤡ Reducir"; };
      $("side-toggle").addEventListener("click", () => { document.body.classList.toggle("side-mini"); try { localStorage.setItem("side-mini", document.body.classList.contains("side-mini") ? "1" : "0"); } catch {} upd(); }); upd(); }
    side.querySelector("#side-rest").innerHTML = `${answered.map(q => `<div class="c-card answer-card"><p class="eyebrow" style="margin:0">${esc(teacherName())} te responde</p><p class="q">${esc(q.text)}</p><p class="a">${esc(q.answer)}</p><button class="button secondary small" data-seen="${q.id}">Vale</button></div>`).join("")}
      <div class="c-card mat-card"><h3>Material de hoy</h3>${visible.length ? `<ul class="mat-list">${visible.map(m => `<li>${matIcon(m)}<div class="nm"><b>${esc(m.title)}</b></div><div class="acts">${matOpenBtn(m)}</div></li>`).join("")}</ul>` : `<p class="meta">${esc(teacherName())} aún no ha mostrado material.</p>`}</div>`;
    bindMaterials($("side"));
    $("side").querySelectorAll("[data-seen]").forEach(b => b.addEventListener("click", () => { S.seenAnswers = [...(S.seenAnswers || []), b.dataset.seen]; try { localStorage.setItem("seen:" + sessionId, JSON.stringify(S.seenAnswers)); } catch {} renderSide(); }));
    renderVideo();
  }
  const isQuick = a => !!a?.content?.quick;
  const openQuick = () => S.activities.find(a => a.status === "open" && isQuick(a));
  const textKinds = ["open", "board", "exit_ticket", "team_challenge", "submission"];
  const openText = () => S.activities.find(a => a.status === "open" && !a.content?.auto && textKinds.includes(a.kind));
  const votes = id => S.votes.filter(v => v.question_id === id).length;

  function materialsHtml(list, manage) {
    return `<ul class="materials-list">${list.map(m => `<li class="${m.visible ? "" : "hidden-m"}"><div class="row"><strong>${esc(m.title)}</strong>
      ${m.kind === "link" ? `<a class="button secondary small" target="_blank" rel="noopener" href="${esc(m.url)}">Abrir</a>` : ""}
      ${m.kind === "file" ? `<a class="button secondary small" href="#" data-file="${esc(m.storage_path)}" data-bucket="${esc(m.bucket || "materials")}">Abrir</a>` : ""}
      ${manage ? `<button class="button ${S.session.projected_material_id === m.id ? "" : "teal"} small" data-project="${m.id}">${S.session.projected_material_id === m.id ? "Quitar" : "Proyectar"}</button><button class="button secondary small" data-toggle="${m.id}" data-visible="${m.visible}">${m.visible ? "Ocultar" : "Mostrar"}</button><button class="button secondary small" data-del="${m.id}">Borrar</button>` : ""}</div>
      ${m.kind === "text" ? `<div class="material-text">${esc(m.content)}</div>` : ""}</li>`).join("")}</ul>`;
  }
  function bindMaterials(root) {
    root.querySelectorAll("[data-text]").forEach(b => b.addEventListener("click", () => { const m = S.materials.find(x => x.id === b.dataset.text); if (m) openDialog(m.title, `<div class="material-text">${esc(m.content)}</div>`); }));
    root.querySelectorAll("[data-project]").forEach(b => b.addEventListener("click", async () => {
      const id = b.dataset.project, on = S.session.projected_material_id !== id;
      const r1 = await sb.from("materials").update({ visible: true }).eq("id", id).eq("visible", false);
      const r2 = await sb.from("sessions").update({ projected_material_id: on ? id : null, projected_state: {} }).eq("id", sessionId);
      if (r1.error || r2.error) { toast("No se pudo proyectar: " + (r2.error || r1.error).message); return; }
      log(on ? "material_projected" : "material_unprojected", { material_id: id });
      if (on) await ensureLessonActivity(S.materials.find(m => m.id === id));
      toast(on ? "Proyectado para todos" : "Quitado de pantalla"); refreshAll(true);
    }));
    root.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", async () => { await sb.from("materials").update({ visible: b.dataset.visible !== "true" }).eq("id", b.dataset.toggle); refreshAll(true); }));
    root.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => { if (confirm("¿Borrar este material?")) { await sb.from("materials").delete().eq("id", b.dataset.del); refreshAll(true); } }));
    bindFiles(root);
  }
  function bindFiles(root) {
    root.querySelectorAll("[data-file]").forEach(a => a.addEventListener("click", async e => {
      e.preventDefault();
      const bucket = a.dataset.bucket || "submissions", path = a.dataset.file;
      // Supabase sirve los .html como texto plano: el campus los descarga y los abre él mismo como página
      if (/\.html?$/i.test(path)) {
        const win = window.open("", "_blank");
        if (win) win.document.write("<p style='font-family:sans-serif;padding:20px'>Abriendo la lección…</p>");
        const { data, error } = await sb.storage.from(bucket).download(path);
        if (error) { toast("No se pudo abrir la lección"); win && win.close(); return; }
        const url = URL.createObjectURL(new Blob([guardLesson(await data.text())], { type: "text/html;charset=utf-8" }));
        if (win) win.location.href = url; else location.href = url;
        return;
      }
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 600);
      if (error) { toast("No se pudo abrir el archivo"); return; }
      window.open(data.signedUrl, "_blank");
    }));
  }




  // ---- vídeo de la clase (Jitsi incrustado o Meet/Zoom aparte) ----
  const videoMode = () => (S.group.video_provider || "jitsi") === "jitsi" && Campus.cfg.jitsiDomain ? "jitsi" : "external";
  const jitsiRoom = () => "campus-rj-" + sessionId.replace(/-/g, "").slice(0, 20);
  const jitsiUrl = () => `https://${Campus.cfg.jitsiDomain}/${jitsiRoom()}`;
  function loadJitsiApi() {
    return new Promise((res, rej) => { if (window.JitsiMeetExternalAPI) return res(); const sc = document.createElement("script"); sc.src = `https://${Campus.cfg.jitsiDomain}/external_api.js`; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
  }
  async function mountJitsi(container) {
    if (S.jitsi && S.jitsiEl && document.body.contains(S.jitsiEl)) { container.appendChild(S.jitsiEl); return; }
    try { await loadJitsiApi(); } catch { container.innerHTML = `<p class="hint">No se pudo cargar el vídeo. ${videoLinkHtml()}</p>`; return; }
    const el = document.createElement("div"); el.className = "jitsi-box"; container.appendChild(el); S.jitsiEl = el;
    S.jitsi = new JitsiMeetExternalAPI(Campus.cfg.jitsiDomain, {
      roomName: jitsiRoom(), parentNode: el, width: "100%", height: "100%", lang: "es",
      userInfo: { displayName: me.profile.full_name },
      configOverwrite: { startWithAudioMuted: !S.teacher, startWithVideoMuted: !S.teacher && !Campus.cfg.studentsCameraOn, prejoinConfig: { enabled: false }, disableDeepLinking: true, toolbarButtons: S.teacher ? ["microphone", "camera", "desktop", "recording", "mute-everyone", "tileview", "settings", "hangup"] : ["microphone", "camera", "tileview", "hangup"], hideConferenceSubject: true, disableInviteFunctions: true, notifications: [] },
      interfaceConfigOverwrite: { SHOW_JITSI_WATERMARK: false, SHOW_WATERMARK_FOR_GUESTS: false, MOBILE_APP_PROMO: false, DEFAULT_REMOTE_DISPLAY_NAME: "Participante" }
    });
    if (S.teacher && Campus.cfg.teacherTileView) S.jitsi.addListener("videoConferenceJoined", () => { try { S.jitsi.executeCommand("setTileView", true); } catch {} });
    if (!S.teacher) {
      // el alumno ve siempre al maestro en grande
      const tName = (nameCache[S.group.teacher_id] || "").trim().toLowerCase();
      const pinTeacher = () => { try { const list = S.jitsi.getParticipantsInfo ? S.jitsi.getParticipantsInfo() : []; const t = list.find(p => (p.displayName || "").trim().toLowerCase() === tName); if (t) { S.jitsi.executeCommand("setTileView", false); S.jitsi.pinParticipant(t.participantId); } } catch {} };
      S.jitsi.addListener("videoConferenceJoined", () => setTimeout(pinTeacher, 800));
      S.jitsi.addListener("participantJoined", () => setTimeout(pinTeacher, 800));
      S.jitsi.addListener("displayNameChange", () => setTimeout(pinTeacher, 300));
    }
    S.jitsi.addListener("videoConferenceLeft", () => { S.jitsi?.dispose(); S.jitsi = null; S.jitsiEl = null; renderVideo(); });
  }
  function videoLinkHtml() {
    const zoom = S.session.zoom_url || S.group.zoom_url;
    if (videoMode() === "jitsi") return `<a class="button gold small" target="_blank" rel="noopener" href="${jitsiUrl()}">Abrir el vídeo aparte</a>`;
    if (!zoom) return "";
    return `<a class="button gold small" target="_blank" rel="noopener" href="${esc(zoom)}">${/meet\.google/.test(zoom) ? "Abrir Meet" : "Abrir Zoom"}</a>`;
  }
  function renderVideo() {
    const box = $("video-slot"); if (!box) return;
    if (S.jitsi && S.jitsiEl && box.contains(S.jitsiEl)) { if (S.session.status === "closed") { S.jitsi.dispose(); S.jitsi = null; S.jitsiEl = null; } else return; }
    if (videoMode() !== "jitsi") {
      const zoom = S.session.zoom_url || S.group.zoom_url, isMeet = /meet\.google/.test(zoom || "");
      box.innerHTML = `<div class="video-card"><div><div class="face">👤</div><div class="name">${esc(teacherName())}</div><div class="hint">${zoom ? (isMeet ? "Abre Meet y pulsa «ventana flotante» para verle aquí encima." : "Abre Zoom y usa la ventana flotante.") : "El vídeo se abre aparte."}</div>${videoLinkHtml()}</div></div>`; return;
    }
    if (S.session.status !== "live" && !S.teacher) { box.innerHTML = `<div class="video-card"><div><div class="face">👤</div><div class="name">${esc(teacherName())}</div><div class="hint">El vídeo aparecerá aquí cuando empiece la clase.</div></div></div>`; return; }
    if (S.jitsi) { const c = box.querySelector(".video-live"); if (c && S.jitsiEl && !c.contains(S.jitsiEl)) c.appendChild(S.jitsiEl); if (c) return; }
    box.innerHTML = `<div class="video-card video-live" id="video-live"></div><p class="video-note">${S.teacher ? (Campus.cfg.jitsiDomain === "meet.jit.si" ? `Si el vídeo se queda en «esperando al moderador», <a target="_blank" rel="noopener" href="${jitsiUrl()}">ábrelo en una pestaña</a>, inicia sesión una vez y vuelve.` : `Vídeo por ${esc(Campus.cfg.jitsiDomain)}. Botón de cuadrícula para ver a todos; «Pantalla completa» para ampliar.`) : `Si no ves a ${esc(teacherName())}, pulsa «Unirme al vídeo».`}</p>`;
    const live = box.querySelector("#video-live");
    if (!S.teacher && !S.videoJoined) { live.innerHTML = `<div><div class="face">👤</div><div class="name">${esc(teacherName())}</div><button class="button gold small" id="video-join">Unirme al vídeo</button></div>`; live.querySelector("#video-join").addEventListener("click", () => { S.videoJoined = true; live.innerHTML = ""; mountJitsi(live); }); return; }
    mountJitsi(live);
  }


  // ---- pizarra ----
  const canWrite = () => S.teacher || (S.session.board_writers || []).includes(me.user.id);
  function boardHtml() {
    const writers = (S.session.board_writers || []);
    return `<div class="board-wrap"><div class="board-tools">
      ${canWrite() ? `<span class="board-colors">${["#101827", "#087f74", "#d4515c", "#d9aa50", "#2563eb"].map(c => `<button class="bc" data-color="${c}" style="background:${c}" aria-pressed="${(S.boardColor || "#101827") === c}"></button>`).join("")}</span>
        <button class="button secondary small" data-width="3" aria-pressed="${(S.boardWidth || 3) === 3}">Fino</button><button class="button secondary small" data-width="8" aria-pressed="${S.boardWidth === 8}">Grueso</button>
        <button class="button secondary small" data-eraser aria-pressed="${!!S.boardEraser}">Borrador</button>` : `<span class="meta">Solo ${esc(teacherName())} dibuja. Pide el lápiz si quieres participar.</span>`}
      ${S.teacher ? `<span class="spacer"></span><button class="button secondary small" data-board-undo>Deshacer</button><button class="button secondary small" data-board-clear>Limpiar</button><button class="button secondary small" data-board-save>Guardar imagen</button><button class="button secondary small" data-board-lend>Ceder lápiz${writers.length ? ` (${writers.length})` : ""}</button>` : ""}
      </div><div class="board-area"><canvas id="board" aria-label="Pizarra"></canvas></div></div>`;
  }
  function bindBoard(root) {
    const cv = root.querySelector("#board"); if (!cv) return;
    S.boardCanvas = cv; fitBoard(); drawBoard(); if (!S.boardLoaded) loadStrokes();
    root.querySelectorAll("[data-color]").forEach(b => b.addEventListener("click", () => { S.boardColor = b.dataset.color; S.boardEraser = false; root.querySelectorAll("[data-color]").forEach(x => x.setAttribute("aria-pressed", x === b)); root.querySelector("[data-eraser]")?.setAttribute("aria-pressed", "false"); }));
    root.querySelectorAll("[data-width]").forEach(b => b.addEventListener("click", () => { S.boardWidth = Number(b.dataset.width); root.querySelectorAll("[data-width]").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
    root.querySelector("[data-eraser]")?.addEventListener("click", b => { S.boardEraser = !S.boardEraser; b.currentTarget.setAttribute("aria-pressed", S.boardEraser); });
    root.querySelector("[data-board-undo]")?.addEventListener("click", async () => { const mine = [...S.strokes].reverse().find(x => x.user_id === me.user.id); if (!mine) return; await sb.from("board_strokes").delete().eq("id", mine.id); S.strokes = S.strokes.filter(x => x.id !== mine.id); drawBoard(); });
    root.querySelector("[data-board-clear]")?.addEventListener("click", async () => { if (!confirm("¿Limpiar la pizarra para todos?")) return; await sb.from("board_strokes").delete().eq("session_id", sessionId); S.strokes = []; drawBoard(); });
    root.querySelector("[data-board-save]")?.addEventListener("click", saveBoardImage);
    root.querySelector("[data-board-lend]")?.addEventListener("click", lendDialog);
    if (!canWrite()) return;
    let cur = null;
    const pos = e => { const r = cv.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return [(p.clientX - r.left) / r.width, (p.clientY - r.top) / r.height]; };
    const start = e => { e.preventDefault(); cur = { color: S.boardEraser ? "#ffffff" : (S.boardColor || "#101827"), width: S.boardEraser ? 24 : (S.boardWidth || 3), points: [pos(e)] }; };
    const move = e => { if (!cur) return; e.preventDefault(); cur.points.push(pos(e)); drawStroke(cur, true); };
    const end = async () => { if (!cur) return; const st = cur; cur = null; if (st.points.length < 2) st.points.push(st.points[0]); const local = { id: "tmp" + Date.now(), user_id: me.user.id, stroke: st }; S.strokes.push(local); const { data, error } = await sb.from("board_strokes").insert({ session_id: sessionId, user_id: me.user.id, stroke: st }).select("id").single(); if (error) { toast("No se pudo dibujar: " + error.message); S.strokes = S.strokes.filter(x => x !== local); drawBoard(); } else local.id = data.id; };
    cv.addEventListener("mousedown", start); cv.addEventListener("mousemove", move); window.addEventListener("mouseup", end);
    cv.addEventListener("touchstart", start, { passive: false }); cv.addEventListener("touchmove", move, { passive: false }); cv.addEventListener("touchend", end);
  }
  function fitBoard() { const cv = S.boardCanvas; if (!cv || !cv.isConnected) return; const w = cv.parentElement.clientWidth || 800; const h = Math.round(w * 0.62); const dpr = window.devicePixelRatio || 1; cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px"; }
  window.addEventListener("resize", () => { fitBoard(); drawBoard(); });
  function drawStroke(st, partial) {
    const cv = S.boardCanvas; if (!cv || !cv.isConnected) return; const ctx = cv.getContext("2d"), W = cv.width, H = cv.height, dpr = window.devicePixelRatio || 1;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = st.color; ctx.lineWidth = st.width * dpr;
    const pts = st.points; if (!pts.length) return;
    ctx.beginPath(); const from = partial && pts.length > 2 ? pts.length - 2 : 0; ctx.moveTo(pts[from][0] * W, pts[from][1] * H);
    for (let i = from + 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * W, pts[i][1] * H);
    if (pts.length === 1) ctx.lineTo(pts[0][0] * W + 0.1, pts[0][1] * H);
    ctx.stroke();
  }
  function drawBoard() { const cv = S.boardCanvas; if (!cv || !cv.isConnected) return; const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); S.strokes.forEach(x => drawStroke(x.stroke)); }
  async function saveBoardImage() {
    const cv = S.boardCanvas; if (!cv) return;
    cv.toBlob(async blob => {
      const path = `${S.group.id}/${Date.now()}-pizarra.png`;
      const { error } = await sb.storage.from("materials").upload(path, blob, { contentType: "image/png" });
      if (error) { toast("No se pudo guardar: " + error.message); return; }
      await sb.from("materials").insert({ session_id: sessionId, title: "Pizarra · " + new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }), kind: "file", storage_path: path, visible: true, position: S.materials.length });
      toast("Pizarra guardada en el material"); refreshAll(true);
    }, "image/png");
  }
  function lendDialog() {
    const students = S.members.filter(m => m.role === "student" || m.role === "guest"), writers = S.session.board_writers || [];
    openDialog("Ceder el lápiz", students.length ? `<p class="subtle" style="margin-top:0">Quien tenga el lápiz puede dibujar en la pizarra de todos.</p><ul class="members">${students.map(m => `<li><span style="flex:1">${esc(m.profile?.full_name || "")}${S.presence[m.user_id] ? "" : ` <span class="meta">(no conectado)</span>`}</span><button class="button ${writers.includes(m.user_id) ? "" : "secondary"} small" data-lend="${m.user_id}">${writers.includes(m.user_id) ? "Quitar lápiz" : "Dar lápiz"}</button></li>`).join("")}</ul><div class="live-controls"><button class="button secondary small" id="lend-none">Recoger todos</button></div>` : `<p class="subtle">No hay alumnos en el grupo.</p>`, d => {
      d.querySelectorAll("[data-lend]").forEach(b => b.addEventListener("click", async () => { const id = b.dataset.lend; const w = writers.includes(id) ? writers.filter(x => x !== id) : [...writers, id]; await sb.from("sessions").update({ board_writers: w }).eq("id", sessionId); dialog.close(); refreshAll(true); }));
      d.querySelector("#lend-none")?.addEventListener("click", async () => { await sb.from("sessions").update({ board_writers: [] }).eq("id", sessionId); dialog.close(); refreshAll(true); });
    });
  }
  async function toggleBoard(on) { const { error } = await sb.from("sessions").update({ board_active: on }).eq("id", sessionId); if (error) { toast("No se pudo abrir la pizarra: " + error.message); return; } log(on ? "board_on" : "board_off"); refreshAll(true); }


  // ---- resumen al terminar ----
  async function summaryDialog() {
    const { data, error } = await sb.rpc("session_summary", { p_session: sessionId });
    if (error || !data) { toast("No se pudo cargar el resumen" + (error ? ": " + error.message : "")); return; }
    const li = arr => arr.length ? `<ul class="sum-list">${arr.map(x => `<li>${esc(typeof x === "string" ? x : x.name + (x.guest ? " (invitado)" : ""))}</li>`).join("")}</ul>` : `<p class="meta">Nadie.</p>`;
    const obj = data.objectives || [];
    openDialog("Resumen de la clase", `<div class="sum">
      <div class="sum-grid">
        <div><b>${data.attendees.length}</b><span>asistieron</span></div>
        <div><b>${data.turns.length}</b><span>actividades</span></div>
        <div><b>${data.questions.length}</b><span>dudas</span></div>
        <div><b>${obj.filter(o => o.done).length}/${obj.length}</b><span>objetivos</span></div>
      </div>
      <p class="meta">Semáforo final: 🟢 ${data.reactions.ok} · 🟡 ${data.reactions.meh} · 🔴 ${data.reactions.lost}</p>
      <h3>Asistentes</h3>${li(data.attendees)}
      <h3>Del grupo que no vinieron</h3>${li(data.absent)}
      <h3>Actividades</h3>${data.turns.length ? `<ul class="sum-list">${data.turns.map(t => `<li>${t.quick ? "🎙 " : ""}${esc(t.title)} <span class="meta">· ${t.responses} respuestas</span></li>`).join("")}</ul>` : `<p class="meta">Ninguna.</p>`}
      <h3>Asistieron pero no respondieron a nada</h3>${li(data.silent)}
      <h3>Dudas</h3>${data.questions.length ? `<ul class="sum-list">${data.questions.map(q => `<li>${esc(q.text)} <span class="meta">· ${esc(q.by)} · ${q.status === "answered" ? "respondida" : "pendiente"}</span>${q.answer ? `<br><span class="meta">↳ ${esc(q.answer)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="meta">Ninguna.</p>`}
      ${obj.length ? `<h3>Objetivos</h3><ul class="sum-list">${obj.map(o => `<li>${o.done ? "✅" : "⬜"} ${esc(o.text)}</li>`).join("")}</ul>` : ""}
      <div class="live-controls"><button class="button secondary small" id="sum-print">Imprimir / guardar PDF</button><button class="button secondary small" id="sum-copy">Copiar como texto</button></div></div>`, d => {
      d.querySelector("#sum-print").addEventListener("click", () => { document.body.classList.add("print-summary"); window.print(); setTimeout(() => document.body.classList.remove("print-summary"), 500); });
      d.querySelector("#sum-copy").addEventListener("click", () => copy(d.querySelector(".sum").innerText));
    });
  }

  // ---- tarjetas inferiores (maestro) ----
  function matIcon(m) { const k = m.kind === "link" ? "link" : /\.html?$/i.test(m.storage_path || "") ? "html" : /\.pdf$/i.test(m.storage_path || "") ? "pdf" : /\.(png|jpe?g|gif|webp)$/i.test(m.storage_path || "") ? "img" : "txt"; const lbl = { link: "WEB", html: "HTML", pdf: "PDF", img: "IMG", txt: "TXT" }[k]; return `<span class="ic ${k}">${lbl}</span>`; }
  function matOpenBtn(m) { return m.kind === "link" ? `<a class="button secondary small" target="_blank" rel="noopener" href="${esc(m.url)}">Abrir</a>` : m.kind === "file" ? `<a class="button secondary small" href="#" data-file="${esc(m.storage_path)}" data-bucket="${esc(m.bucket || "materials")}">Abrir</a>` : `<button class="button secondary small" data-text="${m.id}">Leer</button>`; }
  async function loadAgenda() { const { data } = await sb.from("sessions").select("id, title, starts_at, status, recording_url").eq("group_id", S.group.id).order("starts_at"); S.agenda = data || []; }
  function renderBottom() {
    if (!S.teacher) { $("c-bottom").innerHTML = ""; return; }
    const obj = S.session.objectives || [], pm = S.session.projected_material_id;
    const now = Date.now(), ag = (S.agenda || []).filter(x => new Date(x.starts_at) > now - 14 * 86400e3).slice(0, 6);
    $("c-bottom").innerHTML = `
      <div class="c-card"><h3>Lección de hoy <button class="lk" data-edit-obj>Editar</button></h3>
        ${obj.length ? `<p class="meta" style="margin:0 0 8px">Objetivos · toca para marcar</p><ul class="obj">${obj.map((o, i) => `<li class="${o.done ? "ok" : ""}" data-obj="${i}"><i></i><span>${esc(o.text)}</span></li>`).join("")}</ul>` : `<p class="meta">Escribe los objetivos de la clase para marcarlos según avances.</p>`}</div>
      <div class="c-card"><h3>Material <button class="lk" data-add-mat>+ Añadir</button></h3>
        ${S.materials.length ? `<ul class="mat-list">${S.materials.map(m => `<li class="${m.visible ? "" : "hidden-m"}">${matIcon(m)}<div class="nm"><b>${esc(m.title)}</b><small>${pm === m.id ? "En pantalla" : m.visible ? "Visible para los alumnos" : "Oculto"}</small></div><div class="acts"><button class="button ${pm === m.id ? "" : "teal"} small" data-project="${m.id}">${pm === m.id ? "Quitar" : "Proyectar"}</button><button class="icon-button" title="Más" data-mat-menu="${m.id}">⋯</button></div></li>`).join("")}</ul>` : `<p class="meta">Sube la lección, un PDF, un texto o un enlace.</p>`}</div>
      <div class="c-card sema-card" id="sema-card"></div>
      <div class="c-card"><h3>Agenda del grupo <a class="lk" href="panel.html">Ver todas</a></h3>
        ${ag.length ? `<ul class="agenda">${ag.map(x => `<li class="${x.id === sessionId ? "now" : ""}"><b>${x.id === sessionId ? "Hoy" : fmtDate(x.starts_at, { day: "2-digit", month: "short" })}</b><div><a href="sesion.html?id=${x.id}">${esc(x.title)}</a><small>${x.status === "live" ? "En directo" : x.status === "closed" ? (x.recording_url ? "Grabada" : "Terminada") : "Programada · " + fmtDate(x.starts_at, { hour: "2-digit", minute: "2-digit" })}</small></div></li>`).join("")}</ul>` : `<p class="meta">Sin más clases programadas.</p>`}</div>`;
    const b = $("c-bottom");
    b.querySelector("[data-edit-obj]").addEventListener("click", objectivesDialog);
    semaWidget();
    b.querySelector("[data-add-mat]").addEventListener("click", addMaterialDialog);
    b.querySelectorAll("[data-obj]").forEach(li => li.addEventListener("click", () => toggleObjective(Number(li.dataset.obj))));
    b.querySelectorAll("[data-mat-menu]").forEach(x => x.addEventListener("click", () => materialMenuDialog(S.materials.find(m => m.id === x.dataset.matMenu))));
    bindMaterials(b);
  }
  async function saveObjectives(list) { const { error } = await sb.from("sessions").update({ objectives: list }).eq("id", sessionId); if (error) toast("No se pudieron guardar los objetivos"); else refreshAll(true); }
  async function toggleObjective(i) { const list = [...(S.session.objectives || [])]; if (!list[i]) return; list[i] = { ...list[i], done: !list[i].done }; await saveObjectives(list); }
  async function toggleNextObjective() { const list = S.session.objectives || []; const i = list.findIndex(o => !o.done); if (i < 0) { toast(list.length ? "Todos los objetivos marcados" : "Escribe primero los objetivos en «Lección de hoy»"); return; } await toggleObjective(i); toast("Objetivo marcado: " + list[i].text); }
  function objectivesDialog() {
    openDialog("Objetivos de la clase", `<p class="subtle" style="margin-top:0">Uno por línea. Durante la clase los marcas con un toque o con el botón «Objetivo».</p><textarea id="obj-text" rows="6" style="width:100%">${esc((S.session.objectives || []).map(o => o.text).join("\n"))}</textarea><div class="live-controls"><button class="button" id="obj-save">Guardar</button></div>`, d => {
      d.querySelector("#obj-save").addEventListener("click", async () => { const old = S.session.objectives || []; const list = d.querySelector("#obj-text").value.split("\n").map(t => t.trim()).filter(Boolean).map(t => ({ text: t, done: !!old.find(o => o.text === t && o.done) })); await saveObjectives(list); dialog.close(); });
    });
  }
  async function libraryPickDialog() {
    const { data, error } = await sb.from("library_items").select("*").order("updated_at", { ascending: false });
    if (error) { toast("La biblioteca no está disponible: " + error.message); return; }
    const items = data || []; let q = "";
    const render = d => { const t = q.toLowerCase(); const list = items.filter(i => !t || (i.title + " " + i.folder + " " + i.tags.join(" ")).toLowerCase().includes(t)); d.querySelector("#lp-list").innerHTML = list.length ? list.map(i => `<li><b>${esc(i.title)}</b><small>${esc(i.folder)}</small><button class="button teal small" data-pick="${i.id}">Añadir</button></li>`).join("") : `<li><span class="meta">Nada encontrado.</span></li>`;
      d.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", async () => { const i = items.find(x => x.id === b.dataset.pick); const { error } = await sb.from("materials").insert({ session_id: sessionId, title: i.title, kind: i.kind, storage_path: i.storage_path, url: i.url, content: i.content, bucket: i.kind === "file" ? "library" : "materials", library_item_id: i.id, visible: true, position: S.materials.length }); if (error) { toast("No se pudo añadir: " + error.message); return; } toast("Añadido desde la biblioteca"); refreshAll(true); })); };
    openDialog("De la biblioteca", `<div class="inline-form"><input type="search" id="lp-q" placeholder="Buscar…"><ul class="sess-pick" id="lp-list"></ul><p class="meta"><a href="biblioteca.html" target="_blank">Abrir la biblioteca completa</a> · <button class="button secondary small" id="lp-new">Subir uno nuevo a esta clase</button></p></div>`, d => { render(d); d.querySelector("#lp-q").addEventListener("input", e => { q = e.target.value; render(d); }); d.querySelector("#lp-new").addEventListener("click", () => { dialog.close(); addMaterialDialog(true); }); });
  }
  function addMaterialDialog(direct) {
    if (!direct) { libraryPickDialog(); return; }
    openDialog("Subir material a esta clase", `<div class="inline-form">
      <div class="field"><label for="m-title">Título</label><input id="m-title"></div>
      <div class="field"><label for="m-kind">Tipo</label><select id="m-kind"><option value="file">Archivo (lección HTML, PDF, imagen…)</option><option value="link">Enlace</option><option value="text">Texto</option></select></div>
      <div class="field" id="m-file-f"><label for="m-file">Archivo</label><input id="m-file" type="file"></div>
      <div class="field" id="m-url-f" hidden><label for="m-url">Enlace</label><input id="m-url" placeholder="https://…"></div>
      <div class="field" id="m-text-f" hidden><label for="m-text">Texto</label><textarea id="m-text" rows="5"></textarea></div>
      <label style="font-size:14px"><input type="checkbox" id="m-visible" checked> Visible para los alumnos</label>
      <label style="font-size:14px"><input type="checkbox" id="m-lib" checked> Guardar también en la biblioteca</label>
      <button class="button" id="m-save" style="margin-top:8px">Guardar material</button></div>`, d => {
      const mk = d.querySelector("#m-kind"); const u = () => { d.querySelector("#m-url-f").hidden = mk.value !== "link"; d.querySelector("#m-text-f").hidden = mk.value !== "text"; d.querySelector("#m-file-f").hidden = mk.value !== "file"; }; mk.addEventListener("change", u); u();
      d.querySelector("#m-file").addEventListener("change", e => { const f = e.target.files[0]; if (f && !d.querySelector("#m-title").value) d.querySelector("#m-title").value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "); });
      d.querySelector("#m-save").addEventListener("click", async () => {
        const title = d.querySelector("#m-title").value.trim(); if (!title) { toast("Ponle un título"); return; }
        const row = { session_id: sessionId, title, kind: mk.value, visible: d.querySelector("#m-visible").checked, position: S.materials.length };
        if (mk.value === "link") row.url = d.querySelector("#m-url").value.trim();
        if (mk.value === "text") row.content = d.querySelector("#m-text").value.trim();
        const toLib = d.querySelector("#m-lib").checked;
        if (mk.value === "file") { const f = d.querySelector("#m-file").files[0]; if (!f) { toast("Elige un archivo"); return; } d.querySelector("#m-save").disabled = true;
          const bucket = toLib ? "library" : "materials", path = toLib ? `${me.user.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}` : `${S.group.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
          const { error } = await sb.storage.from(bucket).upload(path, f); if (error) { toast("No se pudo subir: " + error.message); d.querySelector("#m-save").disabled = false; return; } row.storage_path = path; row.bucket = bucket; row.size = f.size; }
        if (toLib) { const li = { owner_id: me.user.id, title, kind: mk.value, storage_path: row.storage_path, url: row.url, content: row.content, folder: S.group.name, size_bytes: row.size || null }; delete row.size; const r = await sb.from("library_items").insert(li).select("id").single(); if (!r.error) row.library_item_id = r.data.id; else if (!/library_items/.test(r.error.message)) toast("No se guardó en la biblioteca: " + r.error.message); }
        delete row.size;
        const { error } = await sb.from("materials").insert(row); if (error) { toast(error.message); return; } dialog.close(); toast("Material guardado"); refreshAll(true);
      });
    });
  }
  function materialMenuDialog(m) {
    if (!m) return;
    openDialog(m.title, `<div class="live-controls" style="flex-direction:column;align-items:stretch">
      ${matOpenBtn(m).replace("small", "")}
      <button class="button secondary" data-toggle="${m.id}" data-visible="${m.visible}">${m.visible ? "Ocultar a los alumnos" : "Mostrar a los alumnos"}</button>
      <button class="button danger" data-del="${m.id}">Borrar</button></div>`, d => { bindMaterials(d); d.querySelectorAll("[data-toggle],[data-del]").forEach(b => b.addEventListener("click", () => dialog.close())); });
  }
  function projectDialog() {
    if (!S.materials.length) { addMaterialDialog(); return; }
    openDialog("Proyectar", `<p class="subtle" style="margin-top:0">Se mostrará en la pantalla de todos los alumnos.</p><ul class="mat-list">${S.materials.map(m => `<li>${matIcon(m)}<div class="nm"><b>${esc(m.title)}</b></div><div class="acts"><button class="button teal small" data-project="${m.id}">Proyectar</button></div></li>`).join("")}</ul>`, d => { bindMaterials(d); d.querySelectorAll("[data-project]").forEach(b => b.addEventListener("click", () => dialog.close())); });
  }
  function materialsDialog() {
    const visible = S.materials.filter(m => m.visible);
    openDialog("Material de hoy", visible.length ? `<ul class="mat-list">${visible.map(m => `<li>${matIcon(m)}<div class="nm"><b>${esc(m.title)}</b></div><div class="acts">${matOpenBtn(m)}</div></li>`).join("")}</ul><p class="meta" style="margin-top:14px"><button class="button secondary small" id="dlg-logout">Salir del campus</button></p>` : `<p class="subtle">${esc(teacherName())} aún no ha mostrado material.</p><p class="meta"><button class="button secondary small" id="dlg-logout">Salir del campus</button></p>`, d => { bindMaterials(d); d.querySelector("#dlg-logout")?.addEventListener("click", async () => { await sb.auth.signOut(); location.replace("index.html"); }); });
  }
  function renderTools() {
    const t = $("c-tools"); t.hidden = !S.teacher; if (!S.teacher) return;
    const s = S.session, q = openQuick(), pm = S.session.projected_material_id;
    t.innerHTML = `
      <button class="tb ask" data-act="${q ? "quick-close" : "quick"}" ${s.status !== "live" ? "disabled" : ""}><span>🎙</span>${q ? `Cerrar · ${S.results[q.id]?.total ?? 0}` : "Pregunta"}</button>
      <button class="tb ${pm ? "active" : ""}" data-act="project"><span>▣</span>${pm ? "Cambiar" : "Proyectar"}</button>
      <button class="tb ${S.session.board_active ? "active" : ""}" data-act="board"><span>✎</span>Pizarra</button>
      <button class="tb" data-act="activity"><span>☑</span>Actividad</button>
      <button class="tb" data-act="objective"><span>⚑</span>Objetivo</button>
      ${s.status !== "closed" ? `<button class="tb" data-act="invite"><span>👥</span>Invitar</button>` : ""}
      <div class="sema-tools" title="Cómo van los alumnos">${semaforoHtml()}</div>
      ${s.status === "scheduled" ? `<a class="tb" href="preparar.html?id=${sessionId}"><span>🧰</span>Preparar</a><button class="tb start" data-act="start"><span>▶</span>Iniciar</button>` : s.status === "live" ? `<button class="tb end" data-act="end"><span>■</span>Terminar</button>` : `<button class="tb" data-act="summary"><span>📋</span>Resumen</button><button class="tb start" data-act="reopen"><span>↻</span>Reabrir</button><button class="tb" data-act="recording"><span>🎬</span>Grabación</button><button class="tb" data-act="delete-session"><span>🗑</span>Borrar</button>`}`;
    t.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => sessionAction(b.dataset.act)));
  }


  // ---- semáforo ----
  const rxCount = v => S.reactions.filter(r => r.value === v && S.presence[r.user_id]).length;
  function semaWidget() {
    if (!S.teacher) return;
    const w = $("sema-card"); if (!w) return;
    const present = id => !!S.presence[id];
    const byName = v => S.reactions.filter(r => r.value === v && present(r.user_id)).map(r => (S.members.find(m => m.user_id === r.user_id)?.profile?.full_name || nameCache[r.user_id] || "Alumno/a").split(" ")[0]);
    const ok = byName("ok"), meh = byName("meh"), lost = byName("lost"), total = Object.values(S.presence).filter(p => p.id !== me.user.id).length;
    const lbl = { ok: "Voy bien", meh: "Más o menos", lost: "No lo entiendo" }, ic = { ok: "🟢", meh: "🟡", lost: "🔴" };
    w.innerHTML = `<h3>¿Cómo van? <span class="meta" style="margin-left:auto;font-family:inherit;font-size:12px">${total} conectados</span></h3>
      <div class="sema-big">${["ok", "meh", "lost"].map(v => `<button class="${v}" data-sema-list="${v}" title="Ver quién lo ha marcado"><span class="rx rx-${v}"></span><b>${byName(v).length}</b><small>${lbl[v]}</small></button>`).join("")}</div>
      <div class="sema-body"><p class="meta" style="margin:0">Toca un color para ver quiénes son y ponerlo a cero cuando lo hayas atendido.</p><button class="button secondary small" data-sema-reset>Poner todo a cero</button></div>`;
    w.querySelectorAll("[data-sema-list]").forEach(b => b.addEventListener("click", () => {
      const v = b.dataset.semaList;
      const rows = S.reactions.filter(r => r.value === v && present(r.user_id)).map(r => ({ id: r.user_id, name: S.members.find(m => m.user_id === r.user_id)?.profile?.full_name || nameCache[r.user_id] || "Alumno/a", at: r.updated_at }));
      openDialog(`${ic[v]} ${lbl[v]}`, rows.length ? `<ul class="members">${rows.map(x => `<li><span style="flex:1">${esc(x.name)}<br><small class="meta">${fmtDate(x.at, { hour: "2-digit", minute: "2-digit" })}</small></span><button class="button secondary small" data-clear-one="${x.id}">Atendido</button></li>`).join("")}</ul><div class="live-controls"><button class="button" data-clear-color="${v}">Atendidos todos · poner a cero</button></div>` : `<p class="subtle">Nadie ha marcado «${lbl[v]}» ahora mismo.</p>`, d => {
        d.querySelectorAll("[data-clear-one]").forEach(x => x.addEventListener("click", async () => { await sb.from("reactions").delete().match({ session_id: sessionId, user_id: x.dataset.clearOne }); dialog.close(); refreshAll(true); }));
        d.querySelector("[data-clear-color]")?.addEventListener("click", async () => { await sb.from("reactions").delete().eq("session_id", sessionId).eq("value", v); dialog.close(); refreshAll(true); });
      });
    }));
    w.querySelector("[data-sema-reset]").addEventListener("click", async () => { await sb.from("reactions").delete().eq("session_id", sessionId); refreshAll(true); });
    // avisos al cambiar a rojo o amarillo
    const seen = S.rxSeen || (S.rxSeen = {});
    S.reactions.forEach(r => { const key = r.user_id + ":" + r.value + ":" + r.updated_at; if (!seen[r.user_id + ":" + r.updated_at] && (r.value === "lost" || r.value === "meh") && S.rxInit) { const n = (S.members.find(m => m.user_id === r.user_id)?.profile?.full_name || nameCache[r.user_id] || "Un alumno").split(" ")[0]; toast(`${r.value === "lost" ? "🔴" : "🟡"} ${n}: ${r.value === "lost" ? "no lo entiende" : "más o menos"}`); } seen[r.user_id + ":" + r.updated_at] = true; });
    S.rxInit = true;
  }
  function semaBarHtml() {
    const present = id => !!S.presence[id]; const c = v => S.reactions.filter(r => r.value === v && present(r.user_id)).length;
    const t = c("ok") + c("meh") + c("lost"); if (!t) return "";
    return `<span class="sema-bar" title="Cómo van los alumnos"><i class="ok" style="flex:${c("ok")}"></i><i class="meh" style="flex:${c("meh")}"></i><i class="lost" style="flex:${c("lost")}"></i></span>`;
  }
  function semaforoHtml() { return `<div class="sema-sum"><span class="rx rx-ok"></span>${rxCount("ok")} <span class="rx rx-meh"></span>${rxCount("meh")} <span class="rx rx-lost"></span>${rxCount("lost")}</div>`; }
  async function setReaction(v) {
    const mine = S.reactions.find(r => r.user_id === me.user.id);
    if (mine && mine.value === v) { await sb.from("reactions").delete().match({ session_id: sessionId, user_id: me.user.id }); }
    else { const { error } = await sb.from("reactions").upsert({ session_id: sessionId, user_id: me.user.id, value: v, updated_at: new Date().toISOString() }); if (error) { toast("No se pudo enviar: " + error.message); return; } if (v === "lost") log("lost"); }
    refreshAll(true);
  }

  // ---- barra de respuesta del alumno ----
  function updateBar() {
    const bar = $("reply-bar"); if (!bar) return;
    const show = !S.teacher && S.session.status !== "scheduled";
    bar.hidden = !show; document.body.classList.toggle("has-bar", show);
    if (!show) return;
    const t = openText(), label = $("bar-label"), ta = $("bar-text");
    const mine = t && S.myResponses[t.id];
    if (t) { label.textContent = isQuick(t) ? "Tu respuesta · a la pregunta de " + teacherName() : "Tu respuesta · " + t.title; label.className = "reply-label"; ta.placeholder = mine ? "Puedes completar tu respuesta…" : "Escribe tu respuesta…"; if (mine && !ta.value && ta !== document.activeElement) ta.value = mine.content?.text || ""; }
    else { label.textContent = S.session.status === "closed" ? "Comentario o duda" : "Duda o comentario para " + teacherName() + " · lo verá en su pantalla"; label.className = "reply-label duda"; ta.placeholder = "Escribe una duda o comentario…"; }
    const mineRx = S.reactions.find(r => r.user_id === me.user.id)?.value;
    let semaEl = $("bar-sema"); if (!semaEl) { semaEl = document.createElement("div"); semaEl.id = "bar-sema"; semaEl.className = "sema"; bar.insertBefore(semaEl, $("bar-status")); }
    semaEl.innerHTML = [["ok", "🟢", "Voy bien"], ["meh", "🟡", "Más o menos"], ["lost", "🔴", "No lo entiendo"]].map(([v, ic, l]) => `<button data-rx="${v}" aria-pressed="${mineRx === v}"><span>${ic}</span>${l}</button>`).join("");
    semaEl.querySelectorAll("[data-rx]").forEach(b => b.addEventListener("click", () => setReaction(b.dataset.rx)));
    $("bar-help").hidden = true;
    $("bar-send").textContent = mine && t ? "Actualizar" : "Enviar";
  }
  async function barSend() {
    const ta = $("bar-text"), text = ta.value.trim(); if (!text) return;
    const t = openText(), st = $("bar-status"); $("bar-send").disabled = true;
    try {
      if (t) {
        const existing = S.myResponses[t.id]; const content = { ...(existing?.content || {}), text };
        const { error } = existing ? await sb.from("responses").update({ content }).eq("id", existing.id) : await sb.from("responses").insert({ activity_id: t.id, user_id: me.user.id, content, is_deferred: S.session.status === "closed" });
        if (error) { toast("No se pudo enviar: " + error.message); return; }
        log("response", { activity_id: t.id }); st.textContent = "Enviada ✓ · puedes completarla mientras siga abierta"; st.hidden = false;
      } else {
        const { error } = await sb.from("questions").insert({ session_id: sessionId, user_id: me.user.id, text });
        if (error) { toast("No se pudo enviar: " + error.message); return; }
        log("question", { text }); ta.value = ""; st.textContent = "Duda enviada ✓ · " + teacherName() + " la verá"; st.hidden = false;
      }
      setTimeout(() => st.hidden = true, 4000); refreshAll(true);
    } finally { $("bar-send").disabled = false; }
  }
  $("bar-send")?.addEventListener("click", barSend);
  $("bar-text")?.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 900) { e.preventDefault(); barSend(); } });
  $("bar-text")?.addEventListener("input", e => { e.target.style.height = "auto"; e.target.style.height = Math.min(120, e.target.scrollHeight) + "px"; });
  $("bar-help")?.addEventListener("click", () => $("help-btn").click());

  // ---- ayuda ----
  $("help-btn").addEventListener("click", async () => {
    const mine = S.help.find(h => h.user_id === me.user.id);
    if (mine) { await sb.from("help_requests").update({ status: "resolved" }).eq("id", mine.id); toast("Aviso retirado"); }
    else { const msg = prompt("¿Qué necesitas? (opcional)"); const { error } = await sb.from("help_requests").insert({ session_id: sessionId, user_id: me.user.id, message: msg || null }); if (error) { toast("No se pudo avisar: " + error.message); return; } log("help"); toast("Tu maestro ha recibido el aviso"); }
    refreshAll(true);
  });

  // ---------- tiempo real ----------
  function subscribe() {
    const presence = sb.channel("session:" + sessionId, { config: { presence: { key: me.user.id } } });
    presence.on("presence", { event: "sync" }, () => {
      const st = presence.presenceState(); S.presence = {};
      Object.entries(st).forEach(([k, v]) => { if (v[0]) S.presence[k] = v[0]; });
      renderTop(); if (S.teacher && S.tab === "people") renderSide();
    }).subscribe(async status => { if (status === "SUBSCRIBED") await presence.track({ id: me.user.id, name: me.profile.full_name, roleLabel: me.user.is_anonymous ? "Invitado/a" : Campus.ROLE_LABEL[me.profile.role] }); });

    const f = "session_id=eq." + sessionId;
    const bump = () => refreshAll(false);
    sb.channel("db:" + sessionId)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: "id=eq." + sessionId }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "activities", filter: f }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "materials", filter: f }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "help_requests", filter: f }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: f }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "question_votes" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions", filter: f }, bump)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "board_strokes", filter: f }, payload => { if (!S.strokes.some(x => x.id === payload.new.id)) { S.strokes.push(payload.new); drawStroke(payload.new.stroke); } })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "board_strokes" }, () => { loadStrokes(); })
      .subscribe(status => { S.rtStatus = status; const el = $("rt-dot"); if (el) { el.dataset.on = status === "SUBSCRIBED"; el.title = status === "SUBSCRIBED" ? "Conexión en directo" : "Actualizando cada pocos segundos"; } });
    setInterval(() => refreshAll(false), S.teacher ? 5000 : 4000);
  }

  // ---------- arranque ----------
  if (!(await loadSession())) return;
  if (!S.teacher) sb.from("attendance").insert({ session_id: sessionId, user_id: me.user.id }).then(() => {});
  await namesFor([S.group.teacher_id]);
  if (S.teacher) await loadAgenda();
  await refreshAll(true); subscribe();
  $("loading")?.remove(); $("contenido").hidden = false;
})();
