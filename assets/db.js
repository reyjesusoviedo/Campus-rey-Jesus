/* Cliente compartido del campus · requiere config.js y supabase-js (UMD) */
(function () {
  if (window.__campusBoot) window.__campusBoot.step = "conectando";
  const cfg = window.CAMPUS_CONFIG;
  if (!window.supabase || !window.supabase.createClient) { if (window.__campusFail) window.__campusFail("Falta una parte del campus (la conexión).", "supabase-js"); return; }
  const sb = window.supabase.createClient(cfg.url, cfg.key);

  const ROLE_LABEL = { coordinator: "Coordinación", teacher: "Maestro/a", student: "Alumno/a" };
  let settingsCache = null;
  async function loadSettings() {
    if (settingsCache) return settingsCache;
    try { const { data } = await sb.from("settings").select("*").eq("id", 1).maybeSingle(); settingsCache = data || {}; } catch { settingsCache = {}; }
    const st = settingsCache;
    if (st.brand_name) cfg.brand = st.brand_name; if (st.brand_short) cfg.brandShort = st.brand_short; if (st.tagline) cfg.tagline = st.tagline;
    cfg.logoUrl = st.logo_path ? sb.storage.from("public").getPublicUrl(st.logo_path).data.publicUrl : null;
    return st;
  }
  const brandMark = () => cfg.logoUrl ? `<img class="brand-mark brand-logo" src="${cfg.logoUrl}" alt="">` : `<span class="brand-mark">${esc(cfg.brandShort)}</span>`;
  const helpLinks = () => { const st = settingsCache || {}; const out = []; if (st.help_whatsapp) out.push({ kind: "wa", href: "https://wa.me/" + String(st.help_whatsapp).replace(/\D/g, ""), label: "WhatsApp" }); if (st.help_email) out.push({ kind: "mail", href: "mailto:" + st.help_email, label: "Correo" }); return out; };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function fmtDate(iso, opts) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("es-ES", opts || { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function initials(name) {
    return (name || "?").split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  }

  let toastTimer;
  function toast(msg) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  async function currentProfile() {
    // La comprobación de sesión también tiene límite de tiempo. En algunos navegadores
    // getSession() puede quedar esperando un bloqueo interno de almacenamiento; nunca
    // dejamos la pantalla colgada indefinidamente.
    const auth = await withTimeout(sb.auth.getSession(), 6000, "sesión");
    if (auth?.error) {
      showFatal("No se pudo comprobar tu sesión", auth.error.message);
      throw new Error(auth.error.message || "SESION_NO_DISPONIBLE");
    }
    const session = auth?.data?.session || null;
    if (!session) return null;

    // Un invitado no necesita consultar profiles para abrir su clase. El nombre ya
    // viaja en los metadatos de Auth y se conserva localmente.
    if (session.user.is_anonymous) {
      let saved = "";
      try { saved = localStorage.getItem("guestName") || ""; } catch {}
      const fullName = session.user.user_metadata?.full_name || saved || "Invitado/a";
      return { user: session.user, profile: { id: session.user.id, full_name: fullName, role: "student", incompleto: true } };
    }

    // El arranque de una cuenta registrada NO depende ya de las políticas RLS de
    // profiles. my_profile() solo puede devolver la fila de auth.uid() y se ejecuta
    // como SECURITY DEFINER, evitando las recursiones que bloquearon a maestros.
    const pr = await withTimeout(sb.rpc("my_profile"), 6000, "perfil");
    if (pr?.error) {
      const detail = String(pr.error.message || "");
      showFatal("No se pudo leer tu perfil", detail.includes("my_profile") ? "Falta ejecutar el parche SQL de arranque estable." : detail);
      throw new Error(detail || "PERFIL_NO_DISPONIBLE");
    }
    const profile = Array.isArray(pr?.data) ? pr.data[0] : pr?.data;
    if (!profile) {
      showFatal("Tu cuenta no tiene perfil en el campus", "Avisa a coordinación: " + (session.user.email || session.user.id));
      throw new Error("PERFIL_AUSENTE");
    }
    if (profile.active === false) {
      showFatal("Esta cuenta está desactivada", "Pide a coordinación que reactive tu acceso.");
      throw new Error("CUENTA_DESACTIVADA");
    }
    return { user: session.user, profile };
  }

  function guestNoClass() {
    document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:linear-gradient(160deg,#0b2f6b,#0a4f85 60%,#1263b8);color:#fff;font-family:Inter,system-ui,sans-serif;padding:24px;text-align:center">
      <div style="background:#fff;color:#101827;border-radius:22px;padding:28px;max-width:420px">
        <h1 style="font-family:Georgia,serif;font-size:1.4rem;margin:0 0 8px">Tu acceso no está en ninguna clase</h1>
        <p style="color:#5b6673;margin:0 0 6px">${esc(CODE_MSG.SIN_VINCULO)}</p>
        <p style="color:#9aa6b2;font-size:12px;margin:0 0 14px">Si la clase acaba de terminar, es normal: tu maestro te pasará un enlace nuevo la próxima vez.</p>
        <a href="entrar.html" style="display:inline-block;background:#0c70bb;color:#fff;border-radius:10px;padding:12px 18px;font-weight:700;text-decoration:none">Escribir un código</a>
      </div></div>`;
  }

  async function requireUser() {
    step("Preparando el campus…");
    await withTimeout(loadSettings(), 9000, "ajustes");
    step("Comprobando tu acceso…");
    let me = await currentProfile();
    if (me && !me.user.is_anonymous) { try { sessionStorage.removeItem("hops"); } catch {} }
    if (!me) { location.replace("entrar.html"); return new Promise(() => {}); }
    // Invitado: solo puede estar en su clase
    if (me.user.is_anonymous) {
      const { data: gs, error: gsErr } = await withTimeout(sb.rpc("my_guest_session"), 9000, "tu clase");
      if (gsErr) { showFatal("No se pudo comprobar tu clase", gsErr.message); return new Promise(() => {}); }
      const here = /sesion\.html/.test(location.pathname), id = new URLSearchParams(location.search).get("id");
      if (gs) { if (here && id === gs) { try { sessionStorage.removeItem("hops"); } catch {} }
        else { hop("sesion.html?id=" + gs, "tu acceso apunta a otra clase"); return new Promise(() => {}); } }
      else { guestNoClass(); return new Promise(() => {}); }
    }
    let pendingClass = null; try { pendingClass = localStorage.getItem("pendingClass"); } catch {}
    if (pendingClass && !me.user.is_anonymous && !/sesion\.html/.test(location.pathname)) {
      const { data, error } = await sb.rpc("join_class", { p_code: pendingClass, p_name: null });
      const sid = data && data.session_id;
      if (!error && sid) { try { localStorage.removeItem("pendingClass"); } catch {} location.replace("sesion.html?id=" + sid); return new Promise(() => {}); }
      if (error) { toast(codeMessage(error.message)); if (/CODIGO_NO_VALIDO|CLASE_TERMINADA/.test(error.message)) { try { localStorage.removeItem("pendingClass"); } catch {} } }
    }
    let course = null; try { course = localStorage.getItem("pendingCourse"); } catch {}
    if (course && !me.user.is_anonymous) {
      const { data: c, error: cErr } = await sb.from("courses").select("id").eq("slug", course).maybeSingle();
      if (cErr) toast("No se pudo abrir el curso: " + cErr.message);
      else if (!c) { try { localStorage.removeItem("pendingCourse"); } catch {} }
      else { let phone = null; try { phone = localStorage.getItem("pendingPhone"); } catch {}
        const { data: eid, error } = await sb.rpc("enroll", { p_course: c.id, p_phone: phone });
        if (error) toast("No se pudo apuntar: " + error.message);
        else { try { localStorage.removeItem("pendingCourse"); localStorage.removeItem("pendingPhone"); } catch {}
          if (!/curso\.html/.test(location.pathname)) { location.replace("curso.html?e=" + eid); return new Promise(() => {}); } } }
    }
    let token = null; try { token = localStorage.getItem("staffInvite"); } catch {}
    if (token && !me.user.is_anonymous) {
      const { data, error } = await sb.rpc("accept_staff_invite", { p_token: token });
      if (!error || /no encontrada|caducad/i.test(error.message)) { try { localStorage.removeItem("staffInvite"); } catch {} }
      if (error) toast("Invitación: " + error.message);
      else if (data && !data.already) { toast("Ya formas parte del equipo"); me = await currentProfile(); if (!/resumen/.test(location.pathname)) { location.replace("resumen.html"); return new Promise(() => {}); } }
    }
    return me;
  }

  function renderShell(me, active) {
    const brand = document.querySelector("[data-brand]");
    if (brand) brand.innerHTML = `${brandMark()}<span>${esc(cfg.brand)}<small>${esc(cfg.tagline)}</small></span>`;
    const foot = document.querySelector("[data-profile]");
    const anon = !!me.user.is_anonymous;
    if (foot) foot.innerHTML = `<div class="profile-mini"><span class="avatar teal">${esc(initials(me.profile.full_name))}</span><div><strong>${esc(me.profile.full_name)}</strong><span>${anon ? "Invitado/a" : ROLE_LABEL[me.profile.role] || ""}</span></div></div>
      ${anon ? `<button class="button small" style="margin-top:12px;width:100%" data-keep>Guardar mi acceso</button>` : ""}
      <button class="button secondary small" style="margin-top:12px;width:100%" data-rename>Cambiar mi nombre</button>
      <button class="button secondary small" style="margin-top:8px;width:100%" data-logout>Salir</button>`;
    document.querySelector("[data-logout]")?.addEventListener("click", async () => { await sb.auth.signOut(); location.replace("entrar.html"); });
    document.querySelector("[data-keep]")?.addEventListener("click", async () => {
      const email = prompt("Escribe tu correo para conservar tu acceso al campus:");
      if (!email || !email.includes("@")) return;
      const { error } = await sb.auth.updateUser({ email: email.trim() });
      if (error) { toast("No se pudo guardar: " + error.message); return; }
      alert("Te hemos enviado un correo a " + email.trim() + ". Ábrelo para confirmar. Después podrás entrar con «Ya tengo cuenta» y unirte a tu grupo con el código de grupo.");
    });
    document.querySelector("[data-rename]")?.addEventListener("click", async () => {
      const name = prompt("Tu nombre y apellido:", me.profile.full_name);
      if (!name || !name.trim()) return;
      const { error } = await sb.from("profiles").update({ full_name: name.trim() }).eq("id", me.user.id);
      if (error) { toast("No se pudo guardar el nombre"); return; }
      me.profile.full_name = name.trim(); toast("Nombre guardado"); location.reload();
    });
    if (me.profile.role !== "coordinator") document.querySelectorAll("[data-coord-only]").forEach(a => a.remove());
    if (!["coordinator", "teacher"].includes(me.profile.role)) document.querySelectorAll("[data-staff-only]").forEach(a => a.remove());
    document.querySelectorAll(".nav-link").forEach(a => { const on = a.dataset.nav === active; a.classList.toggle("active", on); if (on) a.setAttribute("aria-current", "page"); });
    const menu = document.querySelector("[data-menu]");
    if (menu) {
      let ov = document.getElementById("nav-overlay");
      if (!ov) { ov = document.createElement("div"); ov.id = "nav-overlay"; ov.className = "nav-overlay"; document.body.appendChild(ov); }
      const side = document.querySelector(".sidebar");
      if (side && !side.querySelector(".nav-close")) { const x = document.createElement("button"); x.className = "icon-button nav-close"; x.setAttribute("aria-label", "Cerrar menú"); x.textContent = "×"; side.prepend(x); x.addEventListener("click", () => document.body.classList.remove("nav-open")); }
      menu.addEventListener("click", () => document.body.classList.toggle("nav-open"));
      ov.addEventListener("click", () => document.body.classList.remove("nav-open"));
      document.querySelectorAll(".nav-link").forEach(a => a.addEventListener("click", () => document.body.classList.remove("nav-open")));
    }
  }

  function isStaff(me, group) {
    return me.profile.role === "coordinator" || (group && group.teacher_id === me.user.id) || me.profile.role === "teacher";
  }

  function whatsappMessage(text) {
    return "https://wa.me/?text=" + encodeURIComponent(text);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copiado"); } catch { prompt("Copia este texto:", text); }
  }

  function qs(name) { return new URLSearchParams(location.search).get(name); }

  const isAnon = me => !!me?.user?.is_anonymous;
  // Errores visibles en lugar de pantallas colgadas
  function showFatal(msg, detail) {
    if (document.getElementById("campus-fatal")) return;
    const d = document.createElement("div"); d.id = "campus-fatal";
    d.style.cssText = "position:fixed;inset:auto 12px 12px 12px;z-index:9999;background:#fff;border:2px solid #d4515c;border-radius:14px;padding:14px 16px;box-shadow:0 18px 45px rgba(0,0,0,.25);font-family:Inter,system-ui,sans-serif;font-size:14px;max-width:520px;margin:0 auto";
    d.innerHTML = `<b style="color:#a1343e">${msg}</b>${detail ? `<div style="color:#5b6673;font-size:12px;margin-top:4px;word-break:break-word">${String(detail).slice(0, 220)}</div>` : ""}
      <div style="display:flex;gap:8px;margin-top:10px"><button id="cf-reload" style="border:0;border-radius:10px;padding:8px 14px;font:inherit;font-weight:700;background:#0c70bb;color:#fff">Reintentar</button><button id="cf-hide" style="border:1px solid #dce3e8;border-radius:10px;padding:8px 14px;font:inherit;background:#fff">Cerrar</button></div>
      <div style="color:#9aa6b2;font-size:11px;margin-top:8px">Campus v${cfg.version || "?"}</div>`;
    document.body.appendChild(d);
    d.querySelector("#cf-reload").addEventListener("click", () => location.reload(true));
    d.querySelector("#cf-hide").addEventListener("click", () => d.remove());
  }
  window.addEventListener("error", e => { if (e.message && !/ResizeObserver|Script error/.test(e.message)) showFatal("Algo no ha cargado bien", e.message); });
  window.addEventListener("unhandledrejection", e => { const m = e.reason?.message || e.reason; if (m && !/AbortError/.test(String(m))) showFatal("Algo no ha cargado bien", m); });
  // Si una pantalla se queda en "Cargando…" más de 12 segundos, avisamos
  setTimeout(() => { const l = document.getElementById("loading"); if (l && !l.hidden && l.offsetParent !== null) showFatal("La pantalla está tardando demasiado", "Comprueba tu conexión y pulsa Reintentar. Si sigue igual, avisa a coordinación (v" + (cfg.version || "?") + ")."); }, 12000);

  if (window.__campusBoot) { window.__campusBoot.assetsReady = true; window.__campusBoot.step = "código cargado"; }
  const CODE_MSG = {
    CODIGO_NO_VALIDO: "El código no es válido o ha caducado. Pídele a tu maestro el enlace de hoy.",
    SIN_CLASE: "Ahora mismo no hay ninguna clase abierta en este grupo. Vuelve cuando empiece.",
    CLASE_TERMINADA: "Esta clase ya ha terminado. Gracias por venir.",
    SIN_INVITADOS: "Esta clase todavía no admite invitados. Pide a tu maestro que active la invitación.",
    SIN_VINCULO: "Tu acceso no está vinculado a ninguna clase. Entra con el enlace o el código que te ha dado tu maestro."
  };
  function codeMessage(raw) {
    const k = Object.keys(CODE_MSG).find(x => String(raw || "").includes(x));
    if (k) return CODE_MSG[k];
    if (/Failed to fetch|NetworkError|network/i.test(String(raw))) return "No hay conexión ahora mismo. Comprueba tu internet y vuelve a intentarlo.";
    return "No se pudo entrar: " + String(raw || "").slice(0, 140);
  }

  // Ninguna consulta puede colgarse sin decir nada
  function withTimeout(promise, ms, label) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise(resolve => setTimeout(() => resolve({ data: null, error: { message: "TIEMPO_AGOTADO" + (label ? " (" + label + ")" : "") } }), ms || 9000))
    ]);
  }
  function hop(dest, why) {
    let n = 0; try { n = Number(sessionStorage.getItem("hops") || 0); } catch {}
    if (n >= 3) { try { sessionStorage.removeItem("hops"); } catch {} showFatal("El campus no consigue abrir tu clase", (why || "") + " · Pulsa Reintentar o pide a tu maestro un enlace nuevo."); return false; }
    try { sessionStorage.setItem("hops", String(n + 1)); } catch {}
    location.replace(dest); return true;
  }
  function step(txt) { const l = document.getElementById("loading"); if (l) l.textContent = txt; if (window.__campusBoot) window.__campusBoot.step = txt; }

  window.Campus = { isAnon, showFatal, codeMessage, CODE_MSG, withTimeout, step, hop, loadSettings, brandMark, helpLinks, settings: () => settingsCache || {}, sb, cfg, esc, fmtDate, initials, toast, currentProfile, requireUser, renderShell, isStaff, whatsappMessage, copy, qs, ROLE_LABEL };
})();
