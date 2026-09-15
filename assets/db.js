/* Cliente compartido del campus · requiere config.js y supabase-js (UMD) */
(function () {
  const cfg = window.CAMPUS_CONFIG;
  const sb = window.supabase.createClient(cfg.url, cfg.key);

  const ROLE_LABEL = { coordinator: "Coordinación", teacher: "Maestro/a", student: "Alumno/a" };

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
    const me = await currentProfile();
    if (!me) { location.replace("index.html"); return new Promise(() => {}); }
    return me;
  }

  function renderShell(me, active) {
    const brand = document.querySelector("[data-brand]");
    if (brand) brand.innerHTML = `<span class="brand-mark">${esc(cfg.brandShort)}</span><span>${esc(cfg.brand)}<small>${esc(cfg.tagline)}</small></span>`;
    const foot = document.querySelector("[data-profile]");
    const anon = !!me.user.is_anonymous;
    if (foot) foot.innerHTML = `<div class="profile-mini"><span class="avatar teal">${esc(initials(me.profile.full_name))}</span><div><strong>${esc(me.profile.full_name)}</strong><span>${anon ? "Invitado/a" : ROLE_LABEL[me.profile.role] || ""}</span></div></div>
      ${anon ? `<button class="button small" style="margin-top:12px;width:100%" data-keep>Guardar mi acceso</button>` : ""}
      <button class="button secondary small" style="margin-top:12px;width:100%" data-rename>Cambiar mi nombre</button>
      <button class="button secondary small" style="margin-top:8px;width:100%" data-logout>Salir</button>`;
    document.querySelector("[data-logout]")?.addEventListener("click", async () => { await sb.auth.signOut(); location.replace("index.html"); });
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
    document.querySelectorAll(".nav-link").forEach(a => { const on = a.dataset.nav === active; a.classList.toggle("active", on); if (on) a.setAttribute("aria-current", "page"); });
    const menu = document.querySelector("[data-menu]");
    if (menu) menu.addEventListener("click", () => document.body.classList.toggle("nav-open"));
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
  window.Campus = { isAnon, sb, cfg, esc, fmtDate, initials, toast, currentProfile, requireUser, renderShell, isStaff, whatsappMessage, copy, qs, ROLE_LABEL };
})();
