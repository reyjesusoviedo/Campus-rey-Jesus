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
