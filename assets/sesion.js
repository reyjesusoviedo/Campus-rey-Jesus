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

  const S = { lessonCache: {}, stageFrame: null, follow: true, lastSection: null, answersTimer: null, savedOnce: false, session: null, group: null, teacher: false, activities: [], materials: [], questions: [], votes: [], help: [], myResponses: {}, presence: {}, focus: null, tab: null, results: {}, members: [] };
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
    else if (!S.focus || !S.activities.some(a => a.id === S.focus)) S.focus = open ? open.id : (S.activities[0]?.id || null);
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
    const s = S.session; return JSON.stringify([s.status, s.projected_material_id, s.projected_state, s.recording_url, s.allow_guests, s.public_view,
      S.activities.map(a => [a.id, a.status, a.results_shared, a.title, a.closes_at, a.content]), S.materials.map(m => [m.id, m.visible, m.title]),
      S.questions.map(q => [q.id, q.status]), S.votes.length, S.help.map(h => h.id), Object.keys(S.myResponses), S.results[S.focus]?.total, S.results[S.focus]?.allowed]);
  }
  function captureForm() {
    const main = $("main"); const f = { text: main.querySelector("#ans-text")?.value, num: main.querySelector("#ans-num")?.value, opts: [...main.querySelectorAll("[name=opt]:checked")].map(i => i.value), q: main.querySelector("#q-text")?.value };
    const side = $("side"); f.qside = side.querySelector("#q-text")?.value; f.edTitle = main.querySelector("#ed-title")?.value; f.edPrompt = main.querySelector("#ed-prompt")?.value; f.edOpts = main.querySelector("#ed-opts")?.value; f.edText = main.querySelector("#ed-text")?.value; f.edOpen = main.querySelector("details.editor")?.open;
    return f;
  }
  function restoreForm(f) {
    const main = $("main"), side = $("side");
    const set = (el, v) => { if (el && v !== undefined && v !== null && v !== "" && !el.value) el.value = v; };
    set(main.querySelector("#ans-text"), f.text); set(main.querySelector("#ans-num"), f.num); set(side.querySelector("#q-text"), f.qside);
    if (f.opts?.length && !main.querySelector("[name=opt]:checked")) f.opts.forEach(v => { const i = main.querySelector(`[name=opt][value="${v}"]`); if (i) i.checked = true; });
    set(main.querySelector("#ed-title"), f.edTitle); set(main.querySelector("#ed-prompt"), f.edPrompt); set(main.querySelector("#ed-opts"), f.edOpts); set(main.querySelector("#ed-text"), f.edText);
    if (f.edOpen && main.querySelector("details.editor")) main.querySelector("details.editor").open = true;
  }
  let lastSig = "", refreshing = false;
  async function refreshAll(force) {
    if (refreshing) return; refreshing = true;
    try {
      if (!(await loadSession())) return;
      await Promise.all([loadActivities(), loadMaterials(), loadQuestions(), loadHelp()]);
      await loadMyResponses(); await loadResults(S.focus);
      const sig = signature();
      if (force || sig !== lastSig) { lastSig = sig; const f = captureForm(); render(); restoreForm(f); gotoTeacherSection(false); }
    } finally { refreshing = false; }
  }

  // ---------- render ----------
  function render() {
    renderTop(); renderMain(); renderSide();
    $("help-btn").hidden = S.teacher || S.session.status !== "live";
    const mine = S.help.find(h => h.user_id === me.user.id);
    $("help-btn").setAttribute("aria-pressed", String(!!mine));
    $("help-btn").textContent = mine ? "Ya voy · cancelar aviso" : "Pido ayuda";
  }

  function statusTag() {
    const s = S.session;
    if (s.status === "live") return `<span class="live-badge">En directo</span>`;
    if (s.status === "closed") return `<span class="tag closed">${s.recording_url ? "Grabada" : "Terminada"}</span>`;
    return `<span class="tag">Programada · ${fmtDate(s.starts_at)}</span>`;
  }

  function renderTop() {
    const s = S.session, zoom = s.zoom_url || S.group.zoom_url;
    $("top-title").textContent = s.title;
    $("top-status").textContent = S.group.name;
    $("session-top").innerHTML = `<div><p class="eyebrow">${esc(S.group.name)}</p><h1>${esc(s.title)}</h1><p class="meta" style="margin:8px 0 0">${statusTag()} ${S.teacher ? `· <span class="meta">${Object.keys(S.presence).length} conectados</span>` : ""} <span class="rt-dot" id="rt-dot" data-on="${S.rtStatus === "SUBSCRIBED"}" title="${S.rtStatus === "SUBSCRIBED" ? "Conexión en directo" : "Actualizando cada pocos segundos"}"></span></p></div>
      <div class="actions">
        ${zoom ? `<a class="button gold" target="_blank" rel="noopener" href="${esc(zoom)}">Abrir Zoom</a>` : ""}
        ${S.teacher && s.status !== "closed" ? `<button class="button secondary" data-act="invite">Invitar a esta clase</button>` : ""}
        ${S.teacher && s.status === "scheduled" ? `<button class="button teal" data-act="start">Iniciar la clase</button>` : ""}
        ${S.teacher && s.status === "live" ? `<button class="button danger" data-act="end">Finalizar la clase</button>` : ""}
        ${S.teacher && s.status === "closed" ? `<button class="button secondary" data-act="recording">${s.recording_url ? "Cambiar grabación" : "Añadir grabación"}</button><button class="button secondary" data-act="reopen">Reabrir</button>` : ""}
      </div>`;
    $("brief").innerHTML = s.status === "closed"
      ? `<div class="recording-box">${s.recording_url ? `<a class="button" target="_blank" rel="noopener" href="${esc(s.recording_url)}">Ver la grabación</a><span>Puedes ver la clase y hacer las actividades igualmente: tus respuestas quedarán marcadas como «en diferido».</span>` : `<span class="subtle">Esta clase terminó. ${S.teacher ? "Añade el enlace de la grabación para quienes no pudieron asistir." : "Tu maestro añadirá la grabación cuando esté disponible."}</span>`}
         ${s.summary ? `<p style="width:100%;margin:6px 0 0"><strong>Resumen:</strong> ${esc(s.summary)}</p>` : ""}</div>`
      : s.status === "scheduled" && !S.teacher ? `<div class="live-brief compact"><div><strong>La clase aún no ha empezado</strong><p>Cuando tu maestro la inicie, aquí aparecerán el material y las actividades. Mientras tanto, abre Zoom.</p></div></div>` : "";
    $("session-top").querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => sessionAction(b.dataset.act)));
  }

  async function sessionAction(act) {
    if (act === "start") { const { error } = await sb.from("sessions").update({ status: "live" }).eq("id", sessionId); if (error) { toast("No se pudo iniciar: " + error.message); return; } log("session_started"); toast("Clase iniciada"); refreshAll(true); }
    if (act === "end") {
      openDialog("Finalizar la clase", `<div class="inline-form"><div class="field"><label for="e-rec">Enlace de la grabación (puedes añadirlo después)</label><input id="e-rec" placeholder="https://…"></div><div class="field"><label for="e-sum">Resumen para el grupo (opcional)</label><textarea id="e-sum" rows="3"></textarea></div><button class="button danger" id="e-go">Finalizar</button></div>`, d => {
        d.querySelector("#e-go").addEventListener("click", async () => {
          await sb.from("activities").update({ status: "closed" }).eq("session_id", sessionId).eq("status", "open").or("content->>auto.is.null,content->>auto.neq.true");
          await sb.from("sessions").update({ status: "closed", recording_url: d.querySelector("#e-rec").value.trim() || null, summary: d.querySelector("#e-sum").value.trim() || null }).eq("id", sessionId);
          log("session_ended"); dialog.close(); toast("Clase finalizada"); refreshAll(true);
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
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-modals");
      if (!S.lessonCache[m.id]) { const { data, error } = await sb.storage.from("materials").download(m.storage_path); if (error) { container.innerHTML = `<p class="notice">No se pudo cargar la lección.</p>`; return; } S.lessonCache[m.id] = await data.text(); }
      frame.srcdoc = S.lessonCache[m.id]; return;
    }
    const { data, error } = await sb.storage.from("materials").createSignedUrl(m.storage_path, 3600);
    if (error) { container.innerHTML = `<p class="notice">No se pudo cargar el archivo.</p>`; return; }
    frame.src = data.signedUrl;
  }
  function stageHtml(m) {
    return `<div class="stage-head"><span class="eyebrow">En pantalla</span><strong>${esc(m.title)}</strong>
      ${S.teacher ? `<button class="button secondary small" data-project="${m.id}">Quitar de pantalla</button>` : `<a class="button secondary small" href="#" data-file="${esc(m.storage_path || "")}" data-bucket="materials" ${m.storage_path ? "" : "hidden"}>Abrir aparte</a>`}
      ${S.teacher ? "" : `<button class="button ${S.follow ? "teal" : "secondary"} small" data-follow aria-pressed="${S.follow}">${S.follow ? "Siguiendo al maestro" : "Seguir al maestro"}</button><span class="meta" id="lesson-saved" hidden>Respuestas guardadas ✓</span>`}
      <button class="button secondary small" data-stage-full>Pantalla completa</button></div><div class="stage" id="stage"></div>`;
  }
  // Mantiene el iframe montado entre renders (moverlo o recrearlo recargaría la lección)
  function ensureStage(main, pm, cardHtml, renderAct) {
    const stage = main.querySelector("#stage");
    if (!stage || stage.dataset.material !== pm.id) {
      S.stageFrame = null;
      main.innerHTML = `<div id="act-area"></div>` + stageHtml(pm) + (S.teacher ? "" : pipHint());
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
    root.querySelector("[data-follow]")?.addEventListener("click", b => { S.follow = !S.follow; const btn = b.currentTarget; btn.setAttribute("aria-pressed", S.follow); btn.textContent = S.follow ? "Siguiendo al maestro" : "Seguir al maestro"; btn.classList.toggle("teal", S.follow); btn.classList.toggle("secondary", !S.follow); if (S.follow) gotoTeacherSection(true); });
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
  function postToLesson(msg) { try { S.stageFrame?.contentWindow?.postMessage(Object.assign({ campus: "campus" }, msg), "*"); } catch {} }
  function gotoTeacherSection(force) {
    const st = S.session.projected_state || {};
    if (!st.section || S.teacher || !S.follow) return;
    if (!force && st.section === S.lastSection) return;
    S.lastSection = st.section; postToLesson({ type: "goto", section: st.section });
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
    if (d.type === "ready") { postToLesson({ type: "context", role: S.teacher ? "teacher" : "student", name: me.profile.full_name, follow: S.follow }); if (!S.teacher) setTimeout(() => gotoTeacherSection(true), 300); }
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

  // ---- panel principal ----
  function renderMain() {
    const main = $("main");
    if (S.teacher) return renderTeacherMain(main);
    const s = S.session;
    const open = S.activities.find(a => a.status === "open" && !a.content?.auto);
    if (s.status === "closed") {
      const done = S.activities.filter(a => a.status !== "draft" && !a.content?.auto);
      if (S.focus && done.some(a => a.id === S.focus)) return renderStudentActivity(main, done.find(a => a.id === S.focus), true);
      main.innerHTML = `<div class="live-activity-head"><div><p class="eyebrow">Después de la clase</p><h2 style="margin:0">Actividades de esta clase</h2></div></div>
        ${done.length ? `<ul class="seq" style="margin-top:18px">${done.map(a => `<li><span class="kind">${KIND[a.kind]}</span><div class="row"><strong>${esc(a.title)}</strong>${S.myResponses[a.id] ? `<span class="tag">Respondida</span>` : ""}<button class="button secondary small" data-focus="${a.id}">${S.myResponses[a.id] ? "Ver" : "Hacer"}</button></div></li>`).join("")}</ul>` : `<p class="subtle">Esta clase no tuvo actividades.</p>`}`;
      main.querySelectorAll("[data-focus]").forEach(b => b.addEventListener("click", async () => { S.focus = b.dataset.focus; await loadResults(S.focus); renderMain(); }));
      return;
    }
    const pm = projectedMaterial();
    if (pm) {
      ensureStage(main, pm, open ? `<details class="activity-card" open><summary><span class="tag live">Actividad abierta</span> ${esc(open.title)}</summary><div id="act-slot"></div></details>` : "", open ? slot => renderStudentActivity(slot, open, false) : null);
      return;
    }
    if (open) return renderStudentActivity(main, open, false);
    const visible = S.materials.filter(m => m.visible);
    main.innerHTML = `<div class="live-wait"><h2>${s.status === "live" ? "Atento a Zoom" : "Todavía no ha empezado"}</h2><p>${s.status === "live" ? "Cuando tu maestro lance una actividad aparecerá aquí." : "La clase está programada para " + fmtDate(s.starts_at) + "."}</p></div>
      ${visible.length ? `<h3>Material de hoy</h3>${materialsHtml(visible, false)}` : ""}`;
    bindMaterials(main);
  }

  function renderStudentActivity(main, a, deferred) {
    const c = a.content || {}, r = S.myResponses[a.id], rc = r?.content || {};
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
    if (a.kind === "board" || (!S.teacher && a.results_shared)) return `<div class="live-board">${items.map(i => `<div class="live-note">${esc(i.content.text || "")}${S.teacher && i.name ? `<br><small class="meta">${esc(i.name)}</small>` : ""}</div>`).join("") || `<p class="meta">Sin aportaciones todavía.</p>`}</div>`;
    return `<table class="responses-table">${items.map(i => `<tr><td>${esc(i.name || "Alumno/a")}${i.guest ? ` <span class="tag">invitado</span>` : ""}${i.deferred ? ` <span class="tag closed">diferido</span>` : ""}</td><td>${esc(i.content.text || "")}${i.content.storage_path ? `<a class="live-link" data-file="${esc(i.content.storage_path)}" href="#">Ver archivo</a>` : ""}</td></tr>`).join("") || `<tr><td colspan="2" class="meta">Sin respuestas todavía.</td></tr>`}</table>`;
  }

  // ---- panel principal del maestro ----
  function renderTeacherMain(main) {
    const pm = projectedMaterial();
    if (pm) {
      const a = S.activities.find(x => x.id === S.focus);
      ensureStage(main, pm, a ? `<details class="activity-card" ${a.status === "open" ? "open" : ""}><summary>${a.status === "open" ? `<span class="tag live">Abierta</span>` : `<span class="tag">Actividad</span>`} ${esc(a.title)}</summary><div id="act-slot"></div></details>` : "", a ? slot => renderTeacherActivity(slot, a) : null);
      return;
    }
    const a = S.activities.find(x => x.id === S.focus);
    if (!a) {
      main.innerHTML = `<div class="live-wait"><h2>Prepara la secuencia</h2><p>Añade lecturas, preguntas, pizarra o entregas. Cuando empiece la clase, ábrelas una a una y verás las respuestas en directo.</p></div>${editorHtml()}`;
      bindEditor(main); return;
    }
    renderTeacherActivity(main, a);
  }
  function renderTeacherActivity(main, a) {
    const c = a.content || {}, res = S.results[a.id];
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
    const tabs = S.teacher ? [["seq", "Secuencia"], ["people", "Conectados"], ["materials", "Material"], ["questions", "Dudas"]] : [["materials", "Material"], ["questions", "Dudas"]];
    if (!S.tab || !tabs.some(t => t[0] === S.tab)) S.tab = tabs[0][0];
    $("tabs").innerHTML = tabs.map(([k, l]) => `<button data-tab="${k}" aria-pressed="${S.tab === k}">${l}${k === "people" && S.help.length ? ` (${S.help.length}!)` : ""}</button>`).join("");
    $("tabs").querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderSide(); }));
    const side = $("side");
    if (S.tab === "seq") {
      side.innerHTML = S.activities.length ? `<ul class="seq">${S.activities.map(a => `<li class="${a.status}${a.id === S.focus ? " focus" : ""}"><span class="kind">${a.content?.auto ? "Lección" : KIND[a.kind]}</span><div class="row"><strong>${esc(a.title)}</strong>${a.status === "open" ? `<span class="tag live">Abierta</span>` : a.status === "closed" ? `<span class="tag closed">Cerrada</span>` : ""}<button class="button secondary small" data-focus="${a.id}">Ver</button>${a.status !== "open" ? `<button class="button teal small" data-open="${a.id}">Abrir</button>` : ""}</div></li>`).join("")}</ul>` : `<p class="subtle">Aún no hay actividades. Añádelas desde «Nueva actividad».</p>`;
      side.querySelectorAll("[data-focus]").forEach(b => b.addEventListener("click", async () => { S.focus = b.dataset.focus; await loadResults(S.focus); renderMain(); renderSide(); }));
      side.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => activityAction(S.activities.find(a => a.id === b.dataset.open), "open")));
    }
    if (S.tab === "people") {
      const open = S.activities.find(a => a.status === "open"); const answered = new Set((S.results[open?.id]?.items || []).map(i => i.user_id));
      const students = S.members.filter(m => m.role === "student" || m.role === "guest");
      const rows = students.map(m => { const on = !!S.presence[m.user_id], h = S.help.find(x => x.user_id === m.user_id); return `<li><span class="dot ${on ? "on" : ""}"></span><span>${esc(m.profile?.full_name || "")}${m.role === "guest" ? ` <span class="meta">(invitado)</span>` : ""}</span><span class="flags">${h ? `<span class="tag help">Pide ayuda</span><button class="button secondary small" data-resolve="${h.id}">Atendido</button>` : ""}${open && answered.has(m.user_id) ? `<span class="tag done">Respondió</span>` : ""}</span></li>`; });
      const guests = Object.values(S.presence).filter(p => !students.some(m => m.user_id === p.id) && p.id !== me.user.id).map(p => `<li><span class="dot on"></span><span>${esc(p.name)}</span><span class="meta" style="margin-left:auto">${esc(p.roleLabel)}</span></li>`);
      side.innerHTML = `<p class="meta" style="margin:0 0 8px">${Object.keys(S.presence).length} conectados · ${students.length} en el grupo</p><ul class="presence">${rows.join("")}${guests.join("")}</ul>${S.help.filter(h => h.message).map(h => `<p class="live-answer" style="margin-top:10px"><strong>${esc(h.author?.full_name)}:</strong> ${esc(h.message)}</p>`).join("")}`;
      side.querySelectorAll("[data-resolve]").forEach(b => b.addEventListener("click", async () => { await sb.from("help_requests").update({ status: "resolved" }).eq("id", b.dataset.resolve); refreshAll(true); }));
    }
    if (S.tab === "materials") {
      const list = S.teacher ? S.materials : S.materials.filter(m => m.visible);
      side.innerHTML = (list.length ? materialsHtml(list, S.teacher) : `<p class="subtle">${S.teacher ? "Sube material o pega un enlace; se mostrará a los alumnos cuando lo actives." : "Tu maestro aún no ha mostrado material."}</p>`) +
        (S.teacher ? `<details class="editor"><summary>Añadir material</summary><div class="inline-form" style="margin-top:12px">
          <div class="field"><label for="m-title">Título</label><input id="m-title"></div>
          <div class="field"><label for="m-kind">Tipo</label><select id="m-kind"><option value="link">Enlace</option><option value="text">Texto</option><option value="file">Archivo (PDF, imagen…)</option></select></div>
          <div class="field" id="m-url-f"><label for="m-url">Enlace</label><input id="m-url" placeholder="https://…"></div>
          <div class="field" id="m-text-f" hidden><label for="m-text">Texto</label><textarea id="m-text" rows="4"></textarea></div>
          <div class="field" id="m-file-f" hidden><label for="m-file">Archivo</label><input id="m-file" type="file"></div>
          <label style="font-size:14px"><input type="checkbox" id="m-visible" checked> Mostrar a los alumnos ya</label>
          <button class="button" id="m-save" style="margin-top:8px">Guardar material</button></div></details>` : "");
      bindMaterials(side);
      const mk = side.querySelector("#m-kind");
      if (mk) { const u = () => { side.querySelector("#m-url-f").hidden = mk.value !== "link"; side.querySelector("#m-text-f").hidden = mk.value !== "text"; side.querySelector("#m-file-f").hidden = mk.value !== "file"; }; mk.addEventListener("change", u); u();
        side.querySelector("#m-save").addEventListener("click", async () => {
          const title = side.querySelector("#m-title").value.trim(); if (!title) { toast("Ponle un título"); return; }
          const row = { session_id: sessionId, title, kind: mk.value, visible: side.querySelector("#m-visible").checked, position: S.materials.length };
          if (mk.value === "link") row.url = side.querySelector("#m-url").value.trim();
          if (mk.value === "text") row.content = side.querySelector("#m-text").value.trim();
          if (mk.value === "file") { const f = side.querySelector("#m-file").files[0]; if (!f) { toast("Elige un archivo"); return; } const path = `${S.group.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`; const { error } = await sb.storage.from("materials").upload(path, f); if (error) { toast("No se pudo subir: " + error.message); return; } row.storage_path = path; }
          const { error } = await sb.from("materials").insert(row); if (error) { toast(error.message); return; } toast("Material guardado"); refreshAll(true);
        }); }
    }
    if (S.tab === "questions") {
      const sorted = [...S.questions].sort((a, b) => (a.status === "answered") - (b.status === "answered") || votes(b.id) - votes(a.id));
      side.innerHTML = `${S.session.status !== "closed" ? `<div class="inline-form" style="margin-bottom:14px"><textarea id="q-text" rows="2" placeholder="Escribe tu duda; el grupo puede votarla"></textarea><button class="button secondary small" id="q-send" style="justify-self:start">Enviar duda</button></div>` : ""}
        ${sorted.length ? sorted.map(q => `<div class="q-item ${q.status}"><div class="row"><button class="button secondary small vote" data-vote="${q.id}" aria-pressed="${S.votes.some(v => v.question_id === q.id && v.user_id === me.user.id)}">▲ ${votes(q.id)}</button><strong>${esc(q.text)}</strong>${S.teacher && q.status === "pending" ? `<button class="button small" data-answered="${q.id}">Respondida</button>` : ""}</div><small class="meta">${esc(q.author?.full_name || "")}${q.status === "answered" ? " · respondida" : ""}</small></div>`).join("") : `<p class="subtle">Sin dudas todavía.</p>`}`;
      side.querySelector("#q-send")?.addEventListener("click", async () => { const t = side.querySelector("#q-text").value.trim(); if (!t) return; const { error } = await sb.from("questions").insert({ session_id: sessionId, user_id: me.user.id, text: t }); if (error) { toast("No se pudo enviar la duda: " + error.message); return; } side.querySelector("#q-text").value = ""; log("question", { text: t }); toast("Duda enviada"); refreshAll(true); });
      side.querySelectorAll("[data-vote]").forEach(b => b.addEventListener("click", async () => { const id = b.dataset.vote, mine = S.votes.find(v => v.question_id === id && v.user_id === me.user.id); if (mine) await sb.from("question_votes").delete().match({ question_id: id, user_id: me.user.id }); else await sb.from("question_votes").insert({ question_id: id, user_id: me.user.id }); refreshAll(true); }));
      side.querySelectorAll("[data-answered]").forEach(b => b.addEventListener("click", async () => { await sb.from("questions").update({ status: "answered" }).eq("id", b.dataset.answered); refreshAll(true); }));
    }
  }
  function pipHint() {
    return `<p class="meta pip-hint">Para ver al maestro mientras trabajas: en Meet o Zoom pulsa «ventana flotante» (picture-in-picture) y su cámara quedará encima del campus.</p>`;
  }
  const votes = id => S.votes.filter(v => v.question_id === id).length;

  function materialsHtml(list, manage) {
    return `<ul class="materials-list">${list.map(m => `<li class="${m.visible ? "" : "hidden-m"}"><div class="row"><strong>${esc(m.title)}</strong>
      ${m.kind === "link" ? `<a class="button secondary small" target="_blank" rel="noopener" href="${esc(m.url)}">Abrir</a>` : ""}
      ${m.kind === "file" ? `<a class="button secondary small" href="#" data-file="${esc(m.storage_path)}" data-bucket="materials">Abrir</a>` : ""}
      ${manage ? `<button class="button ${S.session.projected_material_id === m.id ? "" : "teal"} small" data-project="${m.id}">${S.session.projected_material_id === m.id ? "Quitar" : "Proyectar"}</button><button class="button secondary small" data-toggle="${m.id}" data-visible="${m.visible}">${m.visible ? "Ocultar" : "Mostrar"}</button><button class="button secondary small" data-del="${m.id}">Borrar</button>` : ""}</div>
      ${m.kind === "text" ? `<div class="material-text">${esc(m.content)}</div>` : ""}</li>`).join("")}</ul>`;
  }
  function bindMaterials(root) {
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
        const url = URL.createObjectURL(new Blob([await data.text()], { type: "text/html;charset=utf-8" }));
        if (win) win.location.href = url; else location.href = url;
        return;
      }
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 600);
      if (error) { toast("No se pudo abrir el archivo"); return; }
      window.open(data.signedUrl, "_blank");
    }));
  }

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
      .subscribe(status => { S.rtStatus = status; const el = $("rt-dot"); if (el) { el.dataset.on = status === "SUBSCRIBED"; el.title = status === "SUBSCRIBED" ? "Conexión en directo" : "Actualizando cada pocos segundos"; } });
    setInterval(() => refreshAll(false), S.teacher ? 5000 : 4000);
  }

  // ---------- arranque ----------
  if (!(await loadSession())) return;
  if (!S.teacher) sb.from("attendance").insert({ session_id: sessionId, user_id: me.user.id }).then(() => {});
  await refreshAll(true); subscribe();
  $("loading").hidden = true; $("app").hidden = false;
})();
