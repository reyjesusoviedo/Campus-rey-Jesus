# Campus Rey Jesús Oviedo · piloto "clase en vivo interactiva"

Vídeo por Zoom (ventana aparte). Presencia, material, actividades, respuestas,
dudas, ayuda, asistencia y grabación: en el campus, sobre Supabase.

## Archivos
- index.html      → entrar (contraseña o enlace al correo)
- panel.html      → grupos, clases, invitaciones, código de grupo
- sesion.html     → la clase (vista maestro y vista alumno)
- assets/config.js → URL y clave publishable del proyecto Supabase
- supabase_parche_resultados.sql → ejecutar UNA vez en el SQL Editor

## Puesta en marcha
1. Supabase → SQL Editor → pegar `supabase_parche_resultados.sql` → Run.
2. Supabase → Authentication → URL Configuration:
   - Site URL: la dirección donde publiques el campus (ej. https://campus.pages.dev)
   - Redirect URLs: esa misma dirección + "/index.html"
3. Publicar la carpeta completa en Cloudflare Pages (Workers & Pages → Create →
   Pages → Upload assets) o en cualquier hosting estático.
4. Entrar con tu usuario coordinador → "Nuevo grupo" → "Invitar" → enviar el
   código por WhatsApp. Cada alumno necesita usuario: Authentication → Users →
   Add user (o activar el registro público si preferís que se den de alta solos).

## Flujo de una clase
Maestro: Nueva clase → añade actividades y material → "Iniciar la clase" →
abre actividades una a una → "Mostrar resultados" cuando quiera → "Finalizar" →
pega el enlace de la grabación.
Alumno: Abrir Zoom → Ir a la clase → responde lo que se abra → "Pido ayuda" si
lo necesita → si faltó, ve la grabación y responde en diferido.

## Fase 1 (nueva pantalla de clase)
- Ejecutar `supabase_parche_fase1.sql` (objetivos, notas y cronómetro).
- Archivos: `sesion.html`, `assets/clase.css` (nuevo), `assets/sesion.js`.
- Maestro: pestañas Lección/Actividad en el centro, Chat/Participantes/Notas a la derecha,
  Lección de hoy (objetivos), Material y Agenda abajo, barra de herramientas inferior.
- Alumno: pantalla única: vídeo (Meet flotante), pregunta de la maestra, lección sincronizada,
  caja fija abajo. Botón Material arriba.

## Fase 2 (vídeo incrustado, semáforo, respuestas)
- Ejecutar `supabase_parche_fase2.sql`.
- Archivos: `assets/sesion.js`, `assets/clase.css`, `assets/config.js` (jitsiDomain), `assets/panel.js` (selector de vídeo por grupo).

## Fase 3 (pizarra y resumen)
- Ejecutar `supabase_parche_fase3.sql`.
- Archivos: `assets/sesion.js`, `assets/clase.css`.

## Fase A (biblioteca)
- Ejecutar `supabase_parche_faseA.sql`.
- Archivos: `biblioteca.html`, `panel.html`, `ver.html`, `assets/biblioteca.js`, `assets/biblioteca.css`, `assets/sesion.js`, `assets/panel.js`.

## Fase B (preparar)
- Sin SQL. Archivos: `preparar.html`, `assets/preparar.js`, `assets/preparar.css`, `assets/panel.js`, `assets/sesion.js`, `assets/clase.css`.

## Fase C (plantillas y recurrencia)
- Ejecutar `supabase_parche_faseC.sql`.
- Archivos: `assets/preparar.js`, `assets/panel.js`, `assets/biblioteca.js`, `assets/piloto.css`.

## Escritorio
- Ejecutar `supabase_parche_escritorio.sql`.
- Archivos: `escritorio.html`, `panel.html`, `biblioteca.html`, `assets/escritorio.js`, `assets/escritorio.css`, `assets/panel.js`, `assets/biblioteca.js`, `assets/sesion.js`, `assets/preparar.js`.

## Equipo
- Ejecutar `supabase_parche_equipo.sql`.
- Archivos: `equipo.html`, `entrar.html` (acceso), `escritorio.html`, `panel.html`, `biblioteca.html`, `assets/equipo.js`, `assets/equipo.css`, `assets/db.js`, `assets/escritorio.js`, `assets/panel.js`.

## Ajustes, inicio y cursos
- Ejecutar `supabase_parche_cursos.sql`.
- Archivos: `index.html (portada)`, `curso.html`, `ajustes.html`, `certificado.html`, `entrar.html` (acceso), `ver.html`, `escritorio.html`, `equipo.html`, `biblioteca.html`, `panel.html`, `assets/inicio.js`, `assets/inicio.css`, `assets/curso.js`, `assets/curso.css`, `assets/ajustes.js`, `assets/db.js`, `assets/panel.js`, `assets/equipo.js`, `assets/escritorio.js`, `assets/piloto.css`.

## Orden de subida completo (si partes de la versión anterior a "cierre")
SQL, en orden: cierre → escritorio → equipo → cursos. Después subir todo el contenido de esta carpeta a GitHub.

## Panel del coordinador
- Ejecutar `supabase_parche_resumen.sql`.
- Archivos: `resumen.html`, `seguimiento.html`, `escritorio.html`, `equipo.html`, `biblioteca.html`, `ajustes.html`, `panel.html`, `entrar.html`, `assets/shell.js`, `assets/shell.css`, `assets/resumen.js`, `assets/resumen.css`, `assets/seguimiento.js`, `assets/escritorio.js`, `assets/equipo.js`, `assets/biblioteca.js`, `assets/ajustes.js`, `assets/panel.js`, `assets/db.js`.

## Paneles de maestro y alumno, Equipo
- Ejecutar `supabase_parche_paneles.sql`.
- Archivos: `panel.html`, `assets/shell.js`, `assets/shell.css`, `assets/resumen.js`, `assets/panel.js`, `assets/equipo.js`, `assets/equipo.css`.

## Arreglos de simplificación
- Ejecutar `supabase_parche_arreglos.sql`.
- Archivos: `entrar.html`, `assets/db.js`, `assets/shell.js`, `assets/shell.css`, `assets/resumen.js`, `assets/resumen.css`, `assets/panel.js`, `assets/equipo.js`, `assets/escritorio.js`, `assets/sesion.js`, `assets/seguimiento.js`.

## Puerta directa a la clase
- Ejecutar `supabase_parche_clase.sql`.
- Archivos: `clase.html`, `index.html`, `entrar.html`, `ver.html`, `assets/inicio.js`, `assets/sesion.js`, `assets/panel.js`, `assets/equipo.js`.

## Material con destino y autor
- Ejecutar `supabase_parche_material.sql`.
- Archivos: `assets/biblioteca.js`, `assets/sesion.js`, `assets/preparar.js`.

## Eliminar y limpiar
- Ejecutar `supabase_parche_borrado.sql`.
- Archivos: `assets/equipo.js`, `assets/ajustes.js`.

## Invitado atado a su clase
- Ejecutar `supabase_parche_invitado_clase.sql`.
- Archivos: `clase.html`, `entrar.html`, `assets/db.js`, `assets/sesion.js`, `assets/clase.css`, `assets/inicio.js`.

## Versionado, errores visibles y comprobación
- Sin SQL.
- Archivos: todos los `.html` (llevan ?v=), `_headers`, `release.sh`, `version.txt`, `assets/config.js`, `assets/db.js`, `assets/sesion.js`, `assets/ajustes.js`.
- Al publicar cambios: ejecutar `./release.sh` y subir todo.

## Arranque sin dependencias externas
- Sin SQL. Archivos: todos los `.html` (usan `assets/vendor/supabase.js` y llevan el vigilante), `assets/vendor/supabase.js` (nuevo), `assets/db.js`, `assets/config.js`, `version.txt`.

## Acceso estable de invitados (función única)
- Ejecutar `supabase_parche_bundle_invitado.sql` después de los parches de invitados.
- Archivo de frontend: `assets/sesion.js`.
- Los invitados cargan el estado de la clase mediante `class_bundle(uuid)`; no se modifican las políticas RLS existentes.
