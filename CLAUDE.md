# Campus Rey Jesús Oviedo · Normas del proyecto

Web estática (HTML + JS + CSS, sin framework) desplegada en **Cloudflare Pages**
desde este repositorio. Base de datos y autenticación: **Supabase**.

## Estructura
- `index.html` portada pública · `entrar.html` acceso · `clase.html` entrada directa a una clase por enlace
- `resumen.html` panel (maestro/coordinación) · `panel.html` «Mi campus» (alumno) · `sesion.html` clase en directo
- `escritorio.html` calendario · `equipo.html` · `ajustes.html` · `biblioteca.html` · `preparar.html` · `seguimiento.html` · `curso.html` · `certificado.html` · `ver.html`
- `assets/` scripts y estilos; `assets/vendor/supabase.js` copia local de la librería (NO usar CDN externo)
- `supabase/` parches SQL, en el orden en que deben ejecutarse (ver LEEME.md)

## Reglas al trabajar
1. **Antes de publicar**: ejecutar `./release.sh` (renumera `?v=` de todos los assets y `assets/config.js`).
2. **Nunca** cargar librerías desde servidores externos: todo dentro de `assets/`.
3. Ninguna pantalla puede quedarse en «Cargando»: siempre tope de tiempo y mensaje con Reintentar.
4. Probar los cambios antes de subir (navegador sin ventana) y comprobar que no hay errores en consola.
5. No tocar `assets/config.js` (claves del proyecto) salvo petición expresa.
6. Los cambios de base de datos van en un archivo nuevo en `supabase/`, nunca modificando los ya ejecutados.
7. Mensajes de commit en español y descriptivos.
8. Textos de la interfaz en español claro, sin tecnicismos: los usan maestros y alumnos de todas las edades.

## Publicar
`git add -A && git commit -m "..." && git push` · Cloudflare despliega solo.
Para deshacer la última entrega: `git revert HEAD && git push`.
