# Prompt · Lección interactiva a partir de un documento propio

Cómo usarlo: adjunta el PDF o documento y pega el texto de abajo tal cual.
Si el documento es largo, indica al final qué páginas o apartado corresponden
a esta lección (una lección = un archivo HTML).

------------------------------------------------------------------------------

Actúa como diseñador de material didáctico digital para el Campus Rey Jesús
Oviedo. Voy a adjuntarte un documento nuestro (PDF o texto). Tu tarea es
convertirlo en UNA lección interactiva en un único archivo HTML con CSS y
JavaScript incluidos, lista para abrir en cualquier navegador y en el móvil.

## Regla principal: fidelidad al documento
- Usa ÚNICAMENTE el contenido del documento adjunto. No añadas información,
  datos, citas, ejemplos ni interpretaciones que no estén en él. Si algo del
  documento resulta ambiguo, mantén su redacción literal en lugar de completarla.
- Respeta el orden del documento de principio a fin. Antes de escribir nada,
  identifica su estructura (títulos, apartados, pasos numerados, secuencias) y
  reprodúcela en el mismo orden. Nunca empieces por el final ni reordenes los
  pasos. Si el documento describe un proceso, la lección debe avanzar paso 1 →
  paso 2 → paso 3 exactamente como aparece.
- Conserva la terminología, los nombres propios y las citas tal como están.
- Si el documento tiene partes que no encajan en una lección (índices, portadas,
  pies de página), omítelas y dímelo al final en una nota.

## Antes de generar: análisis
Empieza tu respuesta con un esquema breve (no más de 15 líneas) que muestre la
estructura que has detectado en el documento: apartados en orden y, si los hay,
los pasos o secuencias. Espera a que yo confirme el esquema antes de generar el
HTML. Si te digo "adelante", genera el archivo completo.

## Estructura de la lección (en este orden)
1. Cabecera: título de la lección (el del documento), a qué apartado o páginas
   corresponde, y objetivo en una frase tomada o resumida del propio texto.
2. Mapa de la lección: índice navegable con los apartados en su orden; al pulsar
   cada uno se salta a su sección. Marca visualmente el apartado actual.
3. Un bloque por apartado del documento, cada uno con:
   - El contenido del apartado, redactado a partir del documento (puedes
     resumir y dividir en párrafos cortos, nunca añadir).
   - Una ilustración o infografía en SVG inline (dibujada en código, sin
     imágenes externas) que represente lo que dice ese apartado: esquema,
     secuencia de pasos, comparación, línea de tiempo, diagrama de relaciones…
     Elige el tipo según el contenido. Si el apartado describe pasos, la
     infografía debe ser una secuencia numerada interactiva: al pulsar cada
     paso se resalta y muestra su explicación, y solo se puede avanzar en orden
     (el paso 3 no se abre hasta haber visto el 2).
   - Una zona "Escribe": una o dos preguntas de reflexión sobre ESE apartado con
     un cuadro de texto donde el alumno escribe. Lo escrito se guarda en el
     navegador (localStorage) para que no se pierda al recargar.
4. Repaso interactivo antes del examen: tarjetas para voltear o un
   "ordena los pasos" (arrastrar o pulsar para colocar en orden) construido
   solo con contenido del documento.
5. Examen final de la lección: entre 5 y 10 preguntas, todas respondibles con
   el documento. Mezcla tipos: opción única, verdadero/falso, ordenar pasos y
   al menos una de respuesta escrita. Al pulsar "Corregir" muestra la
   puntuación de las de opción, la respuesta correcta con la frase del
   documento que la justifica, y deja la escrita para que la revise el
   maestro. Incluye un botón "Copiar mis respuestas" que copie al portapapeles
   todas las respuestas del alumno (escritas y de examen) con el título de la
   lección, para pegarlas en el campus como entrega.
6. Pie: "Fuente: [nombre del documento]" y botón "Volver arriba".

## Diseño
- Un solo archivo .html, sin librerías externas ni conexión a internet.
- Estilo sereno y legible: fondo claro, texto oscuro, un color de acento
  (verde azulado #0f766e) y un dorado suave para destacados (#d9a441). Títulos
  en serif (Georgia), texto en sans-serif del sistema. Tamaño de letra generoso
  (mínimo 17 px en móvil).
- Responsive: en móvil las infografías se apilan y todo se ve sin desplazamiento
  lateral. Botones grandes, tocables con el dedo.
- Accesible: contraste alto, todo usable con teclado, textos alternativos en los
  SVG (title/desc), foco visible.
- Nada de animaciones decorativas; solo las que ayudan a entender (resaltar el
  paso activo, desplegar una explicación).
- Muestra el progreso: una barra que avanza según los apartados visitados.


## Conexión con el campus (obligatorio)
Incluye este bloque tal cual justo antes de </body>. Permite que el campus
sincronice a los alumnos con el maestro ("Seguir al maestro") y guarde
automáticamente lo que el alumno escribe.

```html
<script>
(function(){
  const P = m => { if (parent !== window) parent.postMessage(Object.assign({campus:"lesson"}, m), "*"); };
  window.CampusBridge = {
    position: (section, label) => P({type:"position", section, label}),
    answers:  answers => P({type:"answers", answers, title: document.title})
  };
  window.addEventListener("message", e => {
    const d = e.data || {}; if (d.campus !== "campus") return;
    if (d.type === "goto") { const el = document.getElementById(d.section); if (el) { el.scrollIntoView({behavior:"smooth", block:"start"}); document.dispatchEvent(new CustomEvent("campus:goto", {detail:d})); } }
    if (d.type === "context") { window.CAMPUS_CONTEXT = d; document.dispatchEvent(new CustomEvent("campus:context", {detail:d})); }
  });
  P({type:"ready"});
})();
</script>
```

Y aplica estas reglas en la lección:
- Cada apartado y cada paso de infografía tiene un `id` único y estable
  (`ap-1`, `ap-2`, `paso-3`…).
- Cuando un apartado entra en pantalla (IntersectionObserver) o el usuario
  pulsa un paso de una infografía, llama a
  `CampusBridge.position(id, "Título del apartado")`.
- Al recibir el evento `campus:goto`, además de desplazarse, activa el paso o
  apartado indicado (si es un paso de infografía, muéstralo como activo).
- Cada vez que el alumno escribe en una zona "Escribe" o responde el examen
  (con un retardo de 1 segundo tras dejar de teclear, y al pulsar "Corregir"),
  llama a `CampusBridge.answers({...})` con un objeto donde cada clave es el
  título de la pregunta y el valor es la respuesta (y en el examen, añade la
  clave "Puntuación" con el resultado).
- Si `window.CAMPUS_CONTEXT.role === "teacher"`, oculta las zonas "Escribe" y
  el examen o muéstralos plegados: el maestro proyecta, no responde.
- Mantén también el guardado en localStorage y el botón "Copiar mis respuestas"
  por si la lección se abre fuera del campus.

## Entrega
- Primero el esquema de estructura (pide confirmación).
- Después el archivo HTML completo dentro de un único bloque de código, sin
  fragmentos parciales ni "continúa aquí".
- Al final, una nota breve: qué partes del documento se omitieron y por qué, y
  si alguna frase del documento no se pudo ilustrar y se dejó solo como texto.
- Comprueba antes de entregar: que cada apartado del documento aparece una vez
  y en su orden, que ninguna afirmación de la lección falta en el documento, y
  que el examen se corrige sin errores en consola.

------------------------------------------------------------------------------

## Variantes útiles (añadir al final del prompt si hace falta)
- "Esta lección cubre solo las páginas X a Y."
- "El público son adolescentes de 13 a 17 años: frases más cortas."
- "Reduce el examen a 5 preguntas de opción única."
- "Genera también un archivo aparte con la versión imprimible en blanco y negro."
- "Traduce la lección al inglés manteniendo las citas en español."

## Cómo llevarlo al campus
Guarda el HTML generado y súbelo como material de la clase (Material → Añadir
material → Archivo). En clase, pulsa "Proyectar": la lección aparece dentro del
campus para todos; los alumnos que tengan activado "Seguir al maestro" se
mueven contigo por los apartados. Lo que escriben y el examen se guardan solos
en la actividad "Respuestas de la lección: …" que verás en la Secuencia.

------------------------------------------------------------------------------

# Prompt B · Adaptar una lección ya hecha al campus

Cómo usarlo: adjunta el archivo HTML de la lección existente y pega este texto.

------------------------------------------------------------------------------

Te adjunto una lección interactiva en HTML ya terminada. NO cambies su
contenido, su orden, su diseño ni sus textos. Solo añade la conexión con el
campus Rey Jesús Oviedo siguiendo estas instrucciones, y devuélveme el archivo
completo en un único bloque de código.

1. Inserta este bloque tal cual justo antes de </body>:

```html
<script>
(function(){
  const P = m => { if (parent !== window) parent.postMessage(Object.assign({campus:"lesson"}, m), "*"); };
  window.CampusBridge = {
    position: (section, label) => P({type:"position", section, label}),
    answers:  answers => P({type:"answers", answers, title: document.title})
  };
  window.addEventListener("message", e => {
    const d = e.data || {}; if (d.campus !== "campus") return;
    if (d.type === "goto") { const el = document.getElementById(d.section); if (el) { el.scrollIntoView({behavior:"smooth", block:"start"}); document.dispatchEvent(new CustomEvent("campus:goto", {detail:d})); } }
    if (d.type === "context") { window.CAMPUS_CONTEXT = d; document.dispatchEvent(new CustomEvent("campus:context", {detail:d})); }
  });
  P({type:"ready"});
})();
</script>
```

2. Asegúrate de que cada apartado (section) y cada paso de infografía tiene un
   atributo id único y estable; si falta, añádelo sin cambiar nada más.
3. Añade un IntersectionObserver que, cuando un apartado ocupe al menos la
   mitad de la pantalla, llame a CampusBridge.position(id, títuloDelApartado).
   Cuando el usuario pulse un paso de una infografía, llama también a
   CampusBridge.position(idDelPaso, "Paso N").
4. Escucha el evento campus:goto y, además del desplazamiento, activa el paso
   o apartado indicado (como si el usuario lo hubiera pulsado), permitiendo
   abrir pasos aunque los anteriores no se hayan visto.
5. Escucha el evento campus:context: si detail.role es "teacher", oculta las
   zonas de escritura y el examen (el maestro proyecta, no responde).
6. Cada vez que el usuario escriba en un campo de texto o marque una opción
   (1 segundo después de dejar de escribir) y al pulsar el botón de corregir,
   llama a CampusBridge.answers(objeto), donde cada clave es el título de la
   pregunta y el valor es la respuesta; en el examen añade la clave
   "Puntuación" con el resultado.
7. Conserva el guardado en localStorage y el botón "Copiar mis respuestas" si
   ya existen; si no existen, no los añadas.
8. Comprueba que la lección sigue funcionando exactamente igual fuera del
   campus (abierta directamente en el navegador) y que no hay errores en la
   consola.
