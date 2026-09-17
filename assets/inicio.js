(async () => {
  const app0 = document.getElementById("app");
  const fail = msg => { app0.innerHTML = `<div style="max-width:640px;margin:40px auto;padding:20px;background:#fff7e0;border:1px solid #f1dfa2;border-radius:12px"><b>La portada no pudo cargar.</b><br><small>${msg}</small><br><br><a class="button" href="index.html">Ir al acceso</a></div>`; };
  if (!window.Campus || !Campus.loadSettings) { fail("El navegador está usando una versión antigua del campus. Recarga con Ctrl+F5 o abre en una pestaña de incógnito."); return; }
  const { sb, esc, cfg, toast, loadSettings, brandMark, helpLinks } = Campus;
  try {
  const st = await loadSettings();
  const chk = await sb.from("courses").select("id", { count: "exact", head: true });
  if (chk.error) { fail("Falta ejecutar en Supabase el parche de cursos (supabase_parche_cursos.sql). Detalle: " + esc(chk.error.message)); return; }
  document.querySelector("[data-brand]").innerHTML = `${brandMark()}<span>${esc(cfg.brand)}<small>${esc(st.ministry_name || cfg.tagline)}</small></span>`;
  const app = document.getElementById("app");
  const { data: courses } = await sb.from("courses").select("*").eq("open", true).order("position").order("created_at");
  let groups = {};
  const gids = (courses || []).map(c => c.group_id).filter(Boolean);
  if (gids.length) { const { data } = await sb.from("groups").select("id, name, schedule_text, teacher_id").in("id", gids); (data || []).forEach(g => groups[g.id] = g); }
  const tids = Object.values(groups).map(g => g.teacher_id).filter(Boolean); let names = {};
  if (tids.length) { const { data } = await sb.from("profiles").select("id, full_name").in("id", tids); (data || []).forEach(p => names[p.id] = p.full_name); }
  const help = helpLinks();
  const weeks = d => d >= 14 ? Math.round(d / 7) + " semanas" : d + " días";
  app.innerHTML = `
    <section class="hero"><div><h1>${esc(st.home_headline || "")}</h1><p>${esc(st.home_intro || "")}</p><div class="cta"><a class="button gold big" href="#cursos">Ver cursos gratuitos</a><a class="button secondary" href="#como" style="background:transparent;color:#fff;border:2px solid #fff">Cómo funciona</a></div></div>
      <div class="shot"><b style="font-family:Georgia,serif">Nuevos creyentes · Lección 3</b><div class="bar"><i></i></div><small class="meta">3 de 8 lecciones · te quedan 5 semanas</small><div class="l"><b>La oración: hablar y escuchar</b><br><small>Orar es una conversación: tiene dos direcciones…</small></div><div class="l" style="background:#fff7e0"><small><b>Tu maestra te pregunta:</b> ¿qué te cuesta más, hablar o escuchar?</small></div></div></section>
    <section class="section" id="cursos"><h2>Cursos abiertos</h2><p class="sub">Todos gratuitos. Apúntate y empieza hoy.</p>
      ${(courses || []).length ? `<div class="courses">${courses.map(c => { const g = groups[c.group_id]; const n = (c.lessons || []).length; return `<article class="course"><div class="band ${c.type}"><span>${c.type === "live" ? "Con clases en directo" : "A tu ritmo"}</span><span>${c.type === "live" ? esc(g?.schedule_text || "") : "Sin horario"}</span></div>
        <div class="body"><h3>${esc(c.title)}</h3>${c.audience ? `<p><b>${esc(c.audience)}</b></p>` : ""}<p>${esc(c.description || "")}</p><ul>${n ? `<li>${n} lecciones · ${weeks(c.duration_days)}</li>` : `<li>${weeks(c.duration_days)}</li>`}${c.type === "live" ? `<li>Clase en directo semanal${g?.teacher_id && names[g.teacher_id] ? " · " + esc(names[g.teacher_id]) : ""}</li>` : `<li>Empiezas el día que te apuntas</li>`}<li>Certificado al terminar</li></ul></div>
        <div class="foot"><span class="free">Gratuito</span><a class="button" href="index.html?curso=${encodeURIComponent(c.slug)}">Apuntarme</a></div></article>`; }).join("")}</div>` : `<p class="subtle">Pronto publicaremos los primeros cursos.</p>`}</section>
    <section class="section alt" id="como"><h2>Cómo funciona</h2><p class="sub">Tres pasos y estás dentro.</p>
      <div class="steps"><div class="step"><b>1</b><h3>Te apuntas</h3><p>Nombre, correo y teléfono. Sin aprobación ni espera.</p></div><div class="step"><b>2</b><h3>Recibes tu enlace</h3><p>Por correo. Entras sin contraseña.</p></div><div class="step"><b>3</b><h3>Empiezas</h3><p>Lecciones desde el móvil; si el curso tiene clase en directo, verás cuándo es.</p></div></div></section>
    <section class="section faq"><h2>Preguntas frecuentes</h2>
      <details open><summary>¿Necesito instalar algo?</summary><p>No. Funciona en el navegador del móvil, la tablet o el ordenador.</p></details>
      <details><summary>¿Qué pasa si falto a una clase en directo?</summary><p>Queda grabada y puedes hacer las actividades después.</p></details>
      <details><summary>¿Cuánto tiempo tengo?</summary><p>Cada curso indica su duración. Al terminar, lo tienes disponible ${Math.round((st.review_days || 90) / 30)} meses más para repasar.</p></details>
      <details><summary>¿Tiene coste?</summary><p>No. Todos los cursos son gratuitos.</p></details></section>`;
  document.getElementById("foot").innerHTML = `<span>${esc(st.ministry_name || "")} · ${esc(cfg.brand)}${st.city ? " · " + esc(st.city) : ""}</span><span>${help.length ? "Ayuda: " + help.map(h => `<a href="${h.href}" target="_blank" rel="noopener">${h.label}</a>`).join(" · ") : ""}</span><span><a href="index.html">Entrar al campus</a></span>`;
  } catch (e) { fail("Error inesperado: " + esc(String(e && e.message || e))); }
})();
