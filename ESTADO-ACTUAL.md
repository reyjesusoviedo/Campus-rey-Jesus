# Campus Rey Jesús Oviedo · Estado del proyecto

Fecha: 19 de septiembre de 2026 · Versión publicada: ver `version.txt`

## Qué es
Web estática (HTML + JavaScript + CSS, sin framework) en **Cloudflare Pages**,
conectada a **Supabase** (base de datos y autenticación).
Repositorio: `reyjesusoviedo/Campus-rey-Jesus` · Web: campus-rey-jesus.pages.dev

## Qué funciona
- Portada pública con cursos, acceso, paneles de coordinación, maestro y alumno.
- Clase en directo: vídeo, lección proyectada, pizarra, actividades, semáforo, chat, resumen.
- Cursos libres con inscripción, progreso y certificado.
- Equipo: alta directa de personas con contraseña, roles, grupos, eliminar.
- Biblioteca de material con destino y autor; plantillas y clases recurrentes.
- Versionado automático: cada página comprueba `version.txt` y se actualiza sola.

## Qué está pendiente (problema abierto)
**El acceso de invitados a una clase no funciona en móviles.**
Síntoma actual: la pantalla se queda en «Comprobando tu acceso…» y expulsa al usuario.

Diagnóstico hasta donde llegamos:
1. El enlace correcto es `clase.html?c=CODIGO` (ya lo genera así el botón Invitar).
2. Faltaban funciones en Supabase (`class_info`, `join_class`, `my_guest_session`): se crearon.
3. El invitado necesita permiso de lectura en `sessions`, `groups`, `memberships` y `profiles`.
   Los intentos de ampliar esas políticas provocaron **recursión infinita** en `memberships`
   y, al usar `is_staff()` dentro de la política de `profiles`, se bloqueó el acceso de
   coordinación y maestros.
4. **Estado de los permisos**: puede haber quedado a medias. El archivo
   `supabase/REVERTIR-permisos.sql` devuelve las políticas al estado original.

### Solución preparada en esta entrega (pendiente de ejecutar/publicar)
Se ha implementado el enfoque recomendado sin ampliar políticas tabla por tabla:
- `supabase/supabase_parche_bundle_invitado.sql` crea `class_bundle(uuid)` como
  `security definer`, valida el vínculo del invitado y devuelve el estado necesario.
- `assets/sesion.js` usa esa función para invitados y conserva las lecturas actuales
  para coordinación, maestros y alumnos con cuenta.
- `assets/db.js` deja de consultar `profiles` para usuarios anónimos, evitando otra
  dependencia de RLS antes de abrir la clase.
- La asistencia pasa a `upsert` para que una recarga no falle por duplicado.

**Importante:** hasta ejecutar el parche SQL en Supabase y publicar estos archivos,
el fallo de producción debe considerarse pendiente. Después hay que probar el recorrido
maestro → clase → invitación → móvil invitado.

## Orden de los parches SQL (carpeta `supabase/`)
`00-esquema-inicial.sql` primero (solo en instalaciones nuevas), y después los
`supabase_parche_*.sql` por orden de fecha. Ver `LEEME.md` para el detalle.

## Normas de trabajo
Ver `CLAUDE.md`. Lo esencial: ejecutar `./release.sh` antes de publicar,
no usar librerías externas, y que ninguna pantalla se quede cargando sin mensaje.
