/* Cliente compartido del campus · requiere config.js y supabase-js (UMD) */
(function () {
  const cfg = window.CAMPUS_CONFIG;
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
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data: profile } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    return { user: session.user, profile: profile || { id: session.user.id, full_name: session.user.email, role: "student" } };
  }

  async function requireUser() {
    await loadSettings();
    let me = await currentProfile();
    if (!me) { location.replace("entrar.html"); return new Promise(() => {}); }
    // Invitado: solo puede estar en su clase
    if (me.user.is_anonymous) {
      const { data: gs } = await sb.rpc("my_guest_session");
      const here = /sesion\.html/.test(location.pathname), id = new URLSearchParams(location.search).get("id");
      if (gs) { if (!here || id !== gs) { location.replace("sesion.html?id=" + gs); return new Promise(() => {}); } }
      else { document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;background:#0b2f6b;color:#fff;font-family:Inter,sans-serif;padding:24px;text-align:center"><div style="background:#fff;color:#101827;border-radius:22px;padding:28px;max-width:420px"><h1 style="font-family:Georgia,serif;font-size:1.4rem;margin:0 0 8px">La clase ha terminado</h1><p style="color:#5b6673">Gracias por venir. Cuando tu maestro abra la siguiente, te pasará un enlace nuevo.</p></div></div>`; return new Promise(() => {}); }
    }
    let pendingClass = null; try { pendingClass = localStorage.getItem("pendingClass"); } catch {}
    if (pendingClass && !me.user.is_anonymous && !/sesion\.html/.test(location.pathname)) {
      try { localStorage.removeItem("pendingClass"); } catch {}
      const { data: sid, error } = await sb.rpc("join_with_code_target", { p_code: pendingClass });
      if (!error && sid) { location.replace("sesion.html?id=" + sid); return new Promise(() => {}); }
      if (error) toast("Código de clase: " + error.message);
    }
    let course = null; try { course = localStorage.getItem("pendingCourse"); } catch {}
    if (course && !me.user.is_anonymous) {
      try { localStorage.removeItem("pendingCourse"); } catch {}
      const { data: c } = await sb.from("courses").select("id").eq("slug", course).maybeSingle();
      if (c) { let phone = null; try { phone = localStorage.getItem("pendingPhone"); localStorage.removeItem("pendingPhone"); } catch {} const { data: eid, error } = await sb.rpc("enroll", { p_course: c.id, p_phone: phone }); if (error) toast("No se pudo apuntar: " + error.message); else if (!/curso\.html/.test(location.pathname)) { location.replace("curso.html?e=" + eid); return new Promise(() => {}); } }
    }
    let token = null; try { token = localStorage.getItem("staffInvite"); } catch {}
    if (token && !me.user.is_anonymous) {
      const { data, error } = await sb.rpc("accept_staff_invite", { p_token: token });
      try { localStorage.removeItem("staffInvite"); } catch {}
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
  window.Campus = { isAnon, loadSettings, brandMark, helpLinks, settings: () => settingsCache || {}, sb, cfg, esc, fmtDate, initials, toast, currentProfile, requireUser, renderShell, isStaff, whatsappMessage, copy, qs, ROLE_LABEL };
})();
