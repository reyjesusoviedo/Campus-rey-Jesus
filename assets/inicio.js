(async () => {
  const app0 = document.getElementById("app");
  const fail = msg => { app0.innerHTML = `<div style="max-width:640px;margin:40px auto;padding:20px;background:#fff7e0;border:1px solid #f1dfa2;border-radius:12px"><b>La portada no pudo cargar.</b><br><small>${msg}</small><br><br><a class="button" href="entrar.html">Ir al acceso</a></div>`; };
  if (!window.Campus || !Campus.loadSettings) { fail("El navegador está usando una versión antigua del campus. Recarga con Ctrl+F5 o abre en una pestaña de incógnito."); return; }
  const { sb, esc, cfg, loadSettings, brandMark } = Campus;
  // Asegurar la estructura aunque el index.html sea antiguo
  const ensure = (id, make) => document.getElementById(id) || make();
  const header = document.querySelector("header") || (() => { const h = document.createElement("header"); h.className = "s-top"; document.body.prepend(h); return h; })();
  header.id = "top"; header.className = "s-top";
  if (!header.querySelector("[data-brand]")) { const a = document.createElement("a"); a.className = "brand"; a.href = "index.html"; a.setAttribute("data-brand", ""); header.prepend(a); }
  ensure("menu-btn", () => { const b = document.createElement("button"); b.id = "menu-btn"; b.className = "menu-btn"; b.textContent = "☰"; header.querySelector("[data-brand]").after(b); return b; });
  ensure("nav", () => { const n = document.createElement("nav"); n.id = "nav"; header.querySelector("#menu-btn").after(n); return n; });
  header.querySelectorAll("nav:not(#nav)").forEach(n => n.remove());
  if (!header.querySelector(".enter")) { const a = document.createElement("a"); a.className = "enter"; a.href = "entrar.html"; a.textContent = "Entrar al campus"; header.appendChild(a); }
  ensure("foot", () => { const f = document.createElement("footer"); f.id = "foot"; f.className = "s-foot"; document.body.appendChild(f); return f; });
  ensure("soon", () => { const d = document.createElement("dialog"); d.id = "soon"; d.className = "soon-dialog"; d.innerHTML = `<h3 id="soon-title">Próximamente</h3><p>Estamos preparando esta sección. Mientras tanto, echa un vistazo a los cursos.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn green" href="#cursos" id="soon-go">Ver cursos</a><button class="btn outline" style="color:#0b2f6b;border-color:#0b2f6b" id="soon-close">Cerrar</button></div>`; document.body.appendChild(d); return d; });
  try {
    const st = await loadSettings();
    const chk = await sb.from("courses").select("id", { count: "exact", head: true });
    if (chk.error) { fail("Falta ejecutar en Supabase el parche de cursos. Detalle: " + esc(chk.error.message)); return; }
    const ICON = {
      book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z"/><path d="M20 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/></svg>',
      chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M19 9h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-3"/></svg>',
      people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M2.5 19c0-3.3 3-5.5 6.5-5.5S15.5 15.7 15.5 19"/><path d="M15 14.5c3 0 6 1.8 6 4.5"/></svg>',
      megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10v4a1 1 0 0 0 1 1h3l8 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M18 9a4 4 0 0 1 0 6"/><path d="M7 15v4"/></svg>',
      cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M6 8h12"/></svg>',
      heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
      star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1L3.2 9.4l6.1-.8z"/></svg>',
      globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
      clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
      laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>',
      devices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="13" height="10" rx="1.5"/><rect x="17" y="9" width="5" height="10" rx="1.2"/><path d="M6 19h6"/></svg>',
      cap: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 1 8l11 5 9-4.1V15h2V8L12 3Zm-6 9.3V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.7l-6 2.7-6-2.7Z"/></svg>'
    };
    const ico = (k, w = 20) => `<span style="display:inline-grid;place-items:center;width:${w}px;height:${w}px">${ICON[k] || ICON.book}</span>`;
    const { data: courses } = await sb.from("courses").select("*").eq("open", true).order("position").order("created_at");
    const gids = (courses || []).map(c => c.group_id).filter(Boolean); const groups = {};
    if (gids.length) { const { data } = await sb.from("groups").select("id, name, schedule_text").in("id", gids); (data || []).forEach(g => groups[g.id] = g); }

    // Cabecera
    document.querySelector("[data-brand]").innerHTML = `${brandMark()}<span class="nm"><b>Campus<br>${esc(cfg.brand)}</b><small>${esc(st.motto || "Formación · Comunidad · Impacto")}</small></span>`;
    const menu = Array.isArray(st.menu) && st.menu.length ? st.menu : [{ label: "Inicio", href: "index.html", state: "active" }, { label: "Cursos", href: "#cursos", state: "active" }];
    document.getElementById("nav").innerHTML = menu.map((m, i) => `<a href="${m.state === "active" && m.href ? esc(m.href) : "#"}" class="${i === 0 ? "on" : ""} ${m.state !== "active" ? "soon" : ""}" data-soon="${m.state !== "active" ? esc(m.label) : ""}">${esc(m.label)}</a>`).join("");
    document.getElementById("menu-btn").addEventListener("click", () => document.getElementById("top").classList.toggle("open"));
    const soon = document.getElementById("soon");
    document.querySelectorAll("[data-soon]").forEach(a => { if (a.dataset.soon) a.addEventListener("click", e => { e.preventDefault(); document.getElementById("soon-title").textContent = a.dataset.soon + " · próximamente"; soon.showModal(); }); });
    document.getElementById("soon-close").addEventListener("click", () => soon.close()); document.getElementById("soon-go").addEventListener("click", () => soon.close());

    const heroImg = st.hero_image ? sb.storage.from("public").getPublicUrl(st.hero_image).data.publicUrl : "assets/img/portada.jpg";
    const points = Array.isArray(st.hero_points) ? st.hero_points : []; const pIcons = ["laptop", "clock", "devices"];
    const vals = Array.isArray(st.values_strip) ? st.values_strip : [];
    const weeks = d => d >= 14 ? Math.round(d / 7) + " semanas" : d + " días";
    app0.innerHTML = `
      <section class="hero ${st.hero_image ? "custom" : ""}" ${st.hero_image ? `style="background-image:url('${heroImg}')"` : ""}><div class="txt"><h1>${esc(st.hero_line1 || "")}<span class="l2">${esc(st.hero_line2 || "")}</span></h1><p class="sub">${esc(st.hero_sub || "")}</p>
        <div class="cta"><a class="btn green" href="#cursos">${ico("cap", 22)} Explorar cursos gratuitos</a><a class="btn outline" href="entrar.html">Entrar al campus</a></div>
        <div class="points">${points.map((p, i) => `<span>${ico(pIcons[i % 3], 18)} ${esc(p)}</span>`).join("")}</div></div>
</section>
      <section class="section" id="cursos"><div class="section-head"><h2>${ico("cap", 30)} Cursos gratuitos para comenzar</h2><a class="all" href="#cursos">Ver todos los cursos →</a></div>
        ${(courses || []).length ? `<div class="courses">${courses.map(c => { const g = groups[c.group_id]; const n = (c.lessons || []).length; return `<article class="course"><div class="ic">${ICON[c.icon] || ICON.book}</div><div><span class="free">GRATIS</span><h3>${esc(c.title)}</h3><div class="meta"><span>${ico("doc", 16)} ${n ? n + " lecciones" : weeks(c.duration_days)}</span><span>${ico("star", 16)} ${esc(c.level || "Nivel básico")}</span>${c.type === "live" && g?.schedule_text ? `<span>${ico("clock", 16)} ${esc(g.schedule_text)}</span>` : ""}</div></div><p>${esc(c.short_desc || c.description || "")}</p><a class="go" href="entrar.html?curso=${encodeURIComponent(c.slug)}">Ver curso →</a></article>`; }).join("")}</div>` : `<p class="subtle">Pronto publicaremos los primeros cursos.</p>`}</section>
      <section class="values">${vals.map((v, i) => `<div><span class="vi ${i === 1 ? "g" : ""}">${ico(v.icon || ["clock", "people", "doc"][i % 3], 26)}</span><span><b>${esc(v.title || "")}</b><small>${esc(v.text || "")}</small></span></div>`).join("")}</section>`;
    const soc = st.social || {}; const SI = {
      youtube: '<svg viewBox="0 0 24 24"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .6 12 31 31 0 0 0 1 16.8a3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-4.8 31 31 0 0 0-.4-4.8ZM9.8 15V9l5.7 3-5.7 3Z"/></svg>',
      instagram: '<svg viewBox="0 0 24 24"><path d="M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm5.9-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21 7.1c-.1-1.5-.4-2.8-1.5-3.9S17.1 1.8 15.6 1.7C14.1 1.6 9.9 1.6 8.4 1.7 6.9 1.8 5.6 2.1 4.5 3.2S3.1 5.6 3 7.1c-.1 1.5-.1 5.7 0 7.2.1 1.5.4 2.8 1.5 3.9s2.4 1.4 3.9 1.5c1.5.1 5.7.1 7.2 0 1.5-.1 2.8-.4 3.9-1.5s1.4-2.4 1.5-3.9c.1-1.5.1-5.7 0-7.2Zm-2 8.8a3 3 0 0 1-1.7 1.7c-1.2.5-4 .4-5.3.4s-4.1.1-5.3-.4a3 3 0 0 1-1.7-1.7c-.5-1.2-.4-4-.4-5.3s-.1-4.1.4-5.3A3 3 0 0 1 6.7 3.6c1.2-.5 4-.4 5.3-.4s4.1-.1 5.3.4a3 3 0 0 1 1.7 1.7c.5 1.2.4 4 .4 5.3s.1 4.1-.4 5.3Z"/></svg>',
      facebook: '<svg viewBox="0 0 24 24"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.2H7.3V14h2.8v8h3.4Z"/></svg>',
      whatsapp: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.2.7 3 .6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg>'
    };
    const socHtml = Object.entries(SI).filter(([k]) => soc[k]).map(([k, svg]) => `<a href="${k === "whatsapp" ? "https://wa.me/" + String(soc[k]).replace(/\D/g, "") : esc(soc[k])}" target="_blank" rel="noopener" aria-label="${k}">${svg}</a>`).join("");
    document.getElementById("foot").innerHTML = `<div class="fb">${brandMark()}<span><b>Campus ${esc(cfg.brand)}</b><small>${esc(st.motto || "")}</small></span></div>
      <div class="q">${esc(st.footer_quote || "")}</div>
      ${socHtml ? `<div class="soc">${socHtml}</div>` : "<span></span>"}
      <div class="ftag">${esc(st.footer_tag || "")}</div>
      <div class="legal"><span>${esc(st.ministry_name || "")}${st.city ? " · " + esc(st.city) : ""}</span>${st.help_email ? `<a href="mailto:${esc(st.help_email)}">${esc(st.help_email)}</a>` : ""}<a href="entrar.html">Entrar al campus</a></div>`;
    if (st.help_whatsapp) document.body.insertAdjacentHTML("beforeend", `<a class="wa-float" href="https://wa.me/${String(st.help_whatsapp).replace(/\D/g, "")}" target="_blank" rel="noopener" aria-label="WhatsApp">${SI.whatsapp}</a>`);
  } catch (e) { fail("Error inesperado: " + esc(String(e && e.message || e))); }
})();
