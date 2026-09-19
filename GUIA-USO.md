# Cómo funciona el campus · guía por roles

Campus Rey Jesús Oviedo · clase en vivo interactiva
Dirección: https://campus-rey-jesus.pages.dev

---

## Los tres roles

| Rol | Quién es | Qué puede hacer |
|---|---|---|
| **Coordinación** | Quien administra el campus | Todo: crear grupos, asignar maestros, invitar, ver todas las clases |
| **Maestro/a** | Quien da la clase | Gestionar sus grupos: invitar alumnos, crear y dirigir clases, subir material, ver respuestas |
| **Alumno/a** | Quien asiste | Entrar con código, ver material, responder actividades, pedir ayuda, hacer preguntas |

El rol se asigna en Supabase (Table Editor → profiles → columna `role`): `coordinator`, `teacher` o `student`. Todo usuario nuevo empieza como alumno.

---

## Paso 0 · Dar de alta a las personas (Coordinación, en Supabase)

Cada persona necesita un usuario para entrar al campus.

1. Supabase → Authentication → Users → **Add user** → **Create new user**.
2. Correo + contraseña provisional + marcar **Auto confirm user**.
3. Si es maestro: Table Editor → profiles → poner `role` = `teacher`.
4. Dar a la persona su correo y contraseña. Podrá entrar también con "enlace al correo" sin contraseña.

> Los alumnos NO se añaden a los grupos desde Supabase: entran ellos mismos con el código del grupo.

---

## Paso 1 · Crear el grupo (Coordinación)

1. Entrar al campus → botón **Nuevo grupo**.
2. Rellenar: nombre (p. ej. "Jóvenes · martes"), maestro responsable, horario, enlace de Zoom del grupo.
3. **Crear grupo**. El maestro queda automáticamente dentro.

Resultado: aparece la tarjeta del grupo con los botones **Alumnos · Invitar · Nueva clase**.

---

## Paso 2 · Invitar a los alumnos (Maestro o Coordinación)

1. En la tarjeta del grupo → **Invitar**.
2. Elegir cuánto tiempo será válido el código (7 días, 30 días, 6 meses).
3. **Generar código** → aparece un código de 6 letras.
4. **Enviar por WhatsApp**: se abre un mensaje ya escrito con la dirección del campus y el código. También se puede copiar y mandar por otro medio.

Un mismo código sirve para todo el grupo; se puede generar otro cuando caduque.

---

## Paso 3 · Entrar al grupo (Alumno)

1. Abrir la dirección del campus e iniciar sesión con su correo (contraseña o enlace al correo).
2. Pulsar **Tengo un código de grupo** → escribir el código → **Entrar al grupo**.
3. Ya ve el grupo, su horario, el botón de Zoom y las clases programadas.

El maestro puede ver quién ha entrado en **Alumnos** y quitar a alguien si hace falta.

---

## Paso 3b · Invitados a una sola clase (Maestro)

Para visitantes que aún no quieren registrarse:
1. Dentro de la clase → **Invitar a esta clase** → aparece un código de 6
   letras, un QR para proyectar y el botón de WhatsApp.
2. El invitado abre el enlace, pulsa **Invitado**, escribe su nombre y el
   código → entra solo a esa clase, sin correo ni contraseña.
3. Sus respuestas llegan al maestro con la etiqueta "invitado". El acceso
   caduca unas horas después de la clase.
4. Si quiere quedarse, en la barra lateral pulsa **Guardar mi acceso** y añade
   su correo; después entra al grupo con el código de grupo.

**Modo "solo ver"**: en el mismo diálogo, marca la casilla y copia el enlace
público (ver.html?c=…). Muestra lo proyectado y sigue al maestro sin poder
responder. Ideal para proyectar en una sala.

## Paso 4 · Crear la clase (Maestro)

1. Tarjeta del grupo → **Nueva clase**.
2. Título, fecha y hora, enlace de Zoom (viene el del grupo por defecto).
3. **Crear clase** → se abre la pantalla de la clase.

---

## Paso 5 · Preparar la clase (Maestro, antes de empezar)

En la pantalla de la clase:

**Material** (columna derecha → pestaña Material → "Añadir material")
- Enlace, texto o archivo (PDF, imagen).
- Casilla "Mostrar a los alumnos ya": si se deja sin marcar, queda oculto hasta que se pulse **Mostrar** durante la clase.

**Actividades** (panel central → "Nueva actividad")
- Lectura guiada · Pregunta (una o varias opciones) · Respuesta numérica · Respuesta abierta · Pizarra de ideas · Reto en equipo · Entrega (texto o foto) · Ticket de salida.
- Opcional: tiempo límite en minutos y marcar la opción correcta con `*`.
- Cada actividad queda en la pestaña **Secuencia**, sin abrir todavía.

---

## Paso 6 · Dar la clase

**Maestro**
1. Abrir Zoom (botón **Abrir Zoom**) y compartir pantalla allí.
2. Pulsar **Iniciar la clase**.
3. Ir abriendo actividades: **Abrir** en la Secuencia → aparece al instante en los alumnos.
4. Ver las respuestas llegar en el panel central. **Mostrar resultados** las comparte con el grupo.
5. Pestaña **Conectados**: quién está en línea, quién ha respondido, quién pide ayuda (botón **Atendido**).
6. Pestaña **Dudas**: preguntas del grupo ordenadas por votos; marcar **Respondida**.
7. **Cerrar** la actividad cuando termine; abrir la siguiente.

**Alumno**
1. Abrir Zoom para ver y oír al maestro.
2. En el campus, entrar a la clase (**Ir a la clase**).
3. Cuando el maestro abre una actividad, aparece en pantalla: responder y **Enviar respuesta**. Se puede corregir mientras siga abierta.
4. Botón **Pido ayuda** (abajo a la derecha) si se pierde.
5. Pestaña **Material** para ver lo que el maestro muestra; pestaña **Dudas** para preguntar o votar.

---

## Paso 7 · Terminar (Maestro)

1. **Finalizar la clase** → pegar el enlace de la grabación de Zoom (se puede añadir después) y un resumen.
2. La clase pasa a "Terminada" / "Grabada".

**Alumno que faltó**: entra en la clase, pulsa **Ver la grabación** y hace las actividades; sus respuestas quedan marcadas "en diferido" y el maestro las ve igual.

---

## Resumen en una línea por rol

- **Coordinación**: da de alta usuarios → crea grupos → asigna maestros.
- **Maestro**: invita con código → crea clase → prepara material y actividades → inicia → abre actividades → finaliza y añade grabación.
- **Alumno**: entra con código → abre Zoom → responde en el campus → pide ayuda o pregunta → si faltó, grabación + actividades en diferido.

---

## Dudas frecuentes

- **"No veo Nuevo grupo"**: tu rol no es `coordinator`. Cambiarlo en Supabase y volver a entrar.
- **"Código no válido"**: caducado o mal escrito. Generar otro.
- **"Un alumno no puede entrar"**: aún no tiene usuario. Crearlo en Supabase → Authentication → Users.
- **Borrar un grupo o clase**: por ahora desde Supabase → Table Editor (se borra todo lo que cuelga de él).
- **"El acceso de invitados no está activado"**: en Supabase → Authentication → Sign In / Providers → activar «Allow anonymous sign-ins».
- **Cambios en el código del campus**: subir los archivos a GitHub; Cloudflare publica solo.

---

## Novedades de la nueva pantalla de clase (Fases 1 y 2)

**Maestro**
- Centro con pestañas **Lección** (lo proyectado) y **Actividad** (preguntas, secuencia, editor).
- Derecha: **vídeo** de la clase, y pestañas **Chat** (dudas, preguntas en voz alta y respuestas de la lección en un hilo; botón «Responder» para contestar por escrito a una duda), **Participantes** (conectados, semáforo por alumno, avisos de ayuda) y **Notas** privadas.
- Abajo: **Lección de hoy** (objetivos marcables), **Material** (Proyectar, ⋯ para mostrar/ocultar/borrar) y **Agenda** del grupo.
- Barra inferior: **Pregunta** (turno en voz alta) · **Proyectar** · **Actividad** · **Objetivo** · semáforo del grupo · **Iniciar / Terminar**.

**Alumno** (pantalla única, sin menús)
- Vídeo de la maestra arriba (móvil) o a la derecha (tablet/PC). Con «Dentro del campus» el alumno pulsa **Unirme al vídeo** y ya ve y oye; con Meet/Zoom aparte, usa la ventana flotante.
- Recuadro «Ana te pregunta» cuando hay pregunta abierta; lección con «Vas con Ana» / «Volver con Ana».
- Caja fija abajo para responder o preguntar, y **semáforo**: Voy bien · Más o menos · No lo entiendo.
- Si la maestra responde por escrito a su duda, le aparece «Ana te responde».

**Vídeo dentro del campus (Jitsi)**
- Al crear el grupo se elige «Dentro del campus» o «Aparte con Meet/Zoom».
- Primera vez en cada clase: si el vídeo dice «esperando al moderador», la maestra pulsa «Abrir el vídeo aparte», inicia sesión una vez (Google) y vuelve; el resto entra sin cuenta.
- Si preferís un servidor sin inicio de sesión, cambiad `jitsiDomain` en `assets/config.js` (por ejemplo `fairmeeting.net`) o poned vuestro propio servidor Jitsi.

**Pizarra (Fase 3)**
- Barra inferior → **Pizarra**: se abre en el centro solo para el maestro; «Mostrar a los alumnos» la pone en la pantalla de todos (sustituye a la lección mientras esté activa). Colores, grosor, borrador, deshacer, limpiar.
- **Ceder lápiz**: elige a qué alumno dejar dibujar (y recógelo cuando quieras).
- **Guardar imagen**: la pizarra queda como material de la clase (imagen) para verla después.

**Resumen al terminar (Fase 3)**
- Al pulsar **Terminar** se abre el resumen: asistentes, ausentes del grupo, actividades con nº de respuestas, quién asistió sin responder, dudas (respondidas o pendientes), semáforo final y objetivos. Botones para imprimir/guardar PDF o copiar como texto. También desde el botón **Resumen** de una clase terminada.

**Biblioteca (Fase A)**
- Menú «Biblioteca» (maestros y coordinación): sube cada material una vez (lección HTML, PDF, imagen, texto, enlace), organízalo en carpetas y etiquetas, y decide si se comparte con los demás maestros.
- **Añadir a clase**: elige la clase y el material queda en ella sin volver a subirlo. Desde la clase, «+ Añadir» abre primero la biblioteca; «Subir uno nuevo» lo sube a la clase y, si lo marcas, también a la biblioteca.

**Preparar la clase (Fase B)**
- Desde «Mis grupos» → **Preparar** (o al crear la clase): biblioteca a la izquierda, la clase en el centro (título y fecha, objetivos, material, secuencia de actividades) y a la derecha cómo lo verá el alumno, con una lista de comprobación.
- Arrastra material de la biblioteca a «Material de la clase» (o pulsa +). El primero de la lista se proyecta solo al pulsar **Iniciar**. Flechas para ordenar, 👁 para ocultar hasta que lo muestres, ✕ para quitarlo de la clase.
- «Plantilla: lectura + 2 preguntas + ticket» crea una secuencia básica para editar.

**Plantillas y clases recurrentes (Fase C)**
- En **Preparar** → «Guardar como plantilla»: guarda objetivos, material y actividades de esa clase. «Usar plantilla» los añade a otra clase. En **Biblioteca** aparece la lista de plantillas con «Nueva clase» (elige grupo y fecha) y borrar.
- En la tarjeta del grupo → **Recurrencia**: día y hora, y qué se crea cada semana: clase vacía, siempre la misma plantilla, o una **serie cíclica** (Lección 1 → n → vuelve a la 1). El campus crea las clases con dos semanas de antelación cada vez que un maestro abre «Mis grupos»; los alumnos entran con el código del grupo y ven la clase de esa semana. Las creadas a mano no se duplican.

**Escritorio (maestros y coordinación)**
- Al entrar, maestros y coordinación llegan al **Escritorio**: avisos arriba (grupo sin maestro, clase sin material), **Grupos** a la izquierda (color, maestro, horario, alumnos; pulsar abre un resumen con Preparar / Entrar / + Clase / Asignar maestro / Color), **calendario** semana/mes en el centro (arrastrar una clase cambia el día; pulsar abre acciones) y, para coordinación, la columna **Maestros** (arrastrar sobre un grupo asigna).
- **Alumnos** abajo, plegable, con buscador, grupos, tipo y última asistencia.
- «Grupos (detalle)» en el menú abre la pantalla anterior con Invitar, Alumnos, Recurrencia y códigos.

**Equipo (solo coordinación)**
- Menú **Equipo**: cifras (maestros activos, coordinación, invitaciones pendientes, alumnos) y tres pestañas: Equipo, Invitaciones, Alumnos.
- **+ Invitar a alguien**: nombre, correo, rol (maestro o coordinación), grupo opcional y mensaje. El campus genera un enlace para enviar por WhatsApp o correo. La persona lo abre, pulsa el botón, recibe el enlace mágico en su correo y al entrar ya tiene su rol y su grupo. Sin tocar Supabase. El enlace caduca a los 14 días («Reenviar» lo renueva).
- En la lista: **Grupos** (asignar o quitar), **Rol**, **Desactivar** (deja de poder entrar como maestro; su historial se conserva) y **Reactivar**.
- Pestaña **Alumnos**: lista global con buscador y «Hacer maestro» para ascender a un alumno con cuenta.
- El Paso 0 de esta guía (crear usuarios en Supabase) ya no es necesario para el equipo.

**Ajustes, página de inicio y cursos libres**
- **Ajustes** (coordinación): nombre del ministerio, marca, logo, ciudad, **WhatsApp y correo de ayuda** (se aplican en todo el campus), días de repaso, mensaje de bienvenida y textos de la página de inicio. Abajo, los **Cursos**: título, enlace corto, tipo (a tu ritmo o con clases en directo → grupo), lecciones en orden desde la biblioteca, duración, quién responde preguntas, texto del certificado y visibilidad.
- **index.html (portada)** es la página pública: portada, cursos abiertos con «Apuntarme», cómo funciona, preguntas frecuentes y ayuda. Compartid ese enlace (o el enlace corto de cada curso, «Copiar enlace» en Ajustes).
- **Alta**: nombre, correo y teléfono; sin aprobación. Al abrir el enlace del correo, el alumno entra en **Mi curso**: progreso, tiempo restante, Continuar, lecciones en orden, próxima clase en directo si el curso la tiene, ayuda (WhatsApp, correo, Preguntar) y, al terminar, **certificado** imprimible y periodo de repaso con fecha de borrado.
- **Equipo → Cursos libres**: alumnos apuntados con correo y teléfono, progreso y plazo, exportación a CSV, y preguntas pendientes con «Responder» (el alumno la ve en su curso). El escritorio avisa de las preguntas sin responder.
- Las inscripciones caducadas se borran solas al abrir el escritorio (o con el botón en Ajustes).

**Portada definitiva (index.html)**
- Cabecera con logo, «Campus El Rey Jesús Oviedo» y lema; menú **Inicio · Cursos · Recursos · Comunidad** (los dos últimos en «próximamente» hasta que existan: se cambia en Ajustes → Portada → Menú) y «Entrar al campus».
- Hero con titular en dos líneas, subtítulo, botón verde «Explorar cursos gratuitos», «Entrar al campus», tres ventajas y la **foto** (provisional hasta que subáis la vuestra en Ajustes → Portada).
- Tarjetas de cursos con icono, GRATIS, lecciones, nivel y «Ver curso» (icono, nivel y descripción corta se editan en cada curso).
- Franja de valores, pie con cita, redes (YouTube, Instagram, Facebook desde Ajustes; WhatsApp = el de ayuda) y botón flotante de WhatsApp.
- El acceso al campus está ahora en **entrar.html**.

**Panel del coordinador (Resumen, Seguimiento, barra común)**
- Al entrar, maestros y coordinación llegan a **Resumen**: saludo, botón «Nuevo registro» (alumno, maestro, curso, grupo, clase, material), cuatro cifras, actividad reciente, accesos rápidos, seguimiento prioritario y próximas clases.
- **Barra lateral común** en todas las pantallas (Resumen · Alumnos · Maestros · Cursos · Grupos · Seguimiento · Calendario · Biblioteca · Reportes «Próx.» · Configuración · Cerrar sesión), plegable en móvil; cabecera con **buscador global** y **campana** de avisos.
- **Seguimiento**: lista de alumnos de grupos y cursos libres con estado Al día / Revisar / En riesgo, motivo (semanas sin asistir, curso parado, «no lo entiendo» repetido, pregunta sin responder), progreso y botón de WhatsApp. Filtros por estado.
- «Calendario» es el escritorio anterior; «Alumnos» y «Maestros» abren Equipo; «Cursos» abre Configuración → Cursos.

**Paneles del maestro y del alumno, Equipo renovado**
- **Maestro**: al entrar ve su panel: grupos a cargo, alumnos, clases de la semana y materiales; clases de hoy con «Abrir clase»; accesos rápidos; sus grupos con «Gestionar»; alumnos que requieren atención con botón de contacto; materiales recientes y «Mi semana». Menú: Resumen · Mis grupos · Mis alumnos · Preparar clase · Materiales · Calendario · Mensajes (próx.) · Configuración.
- **Alumno («Mi campus»)**: cursos y grupos, clases de la semana, tareas pendientes (actividades en diferido sin hacer) y certificados; «Continuar aprendiendo», próximas clases con «Entrar», tareas, materiales recientes, progreso y certificados. Menú plegable en móvil. «Tengo un código» sigue arriba.
- **Mi perfil**: pulsando el nombre (barra lateral o cabecera) se cambia nombre, teléfono y **foto**.
- **Equipo** con el aspecto nuevo: cifras con icono, pestañas, estados con punto de color, grupos con su color e «Invitar a alguien» como panel lateral.

---

## Cambios de simplificación (tras la primera presentación)

- **Códigos de clase y de grupo**: cualquiera que entre con un código (invitado o alumno con cuenta, con sesión iniciada o no) llega **directamente a la clase**; si el grupo no tiene clase en directo ni próxima, al panel.
- **Empezar clase** (botón verde en el panel del maestro y del coordinador, y en Calendario → + Clase): grupo → cuándo → material opcional → **Empezar ahora** (crea la clase, la pone en directo y proyecta el material) o **Programar**. Preparar queda como opción avanzada.
- **Equipo sin invitaciones**: «+ Nuevo miembro» crea el usuario al momento con nombre, correo, teléfono, rol, grupo y una contraseña inicial (generada o escrita). «Copiar datos» / «Enviar por WhatsApp» para pasársela. Botón **Contraseña** en cada fila para ponerle una nueva. Cada uno puede cambiarla en **Mi perfil**, y en la entrada hay «¿Olvidaste la contraseña?».
- **Nuevo grupo**: nombre, maestro, horario y **lista de alumnos registrados** con casillas; el resto entra con el código del grupo.
- **Durante la clase**: Invitar → «Añadir alumno ya registrado» sin salir de la clase.
- **Móvil**: paneles de alumno, maestro y coordinador revisados a 360–430 px.

### Lista de comprobación antes de una presentación (10 minutos)
1. Entra como coordinación en el móvil y en el ordenador: portada, «Entrar», panel.
2. Equipo → Nuevo miembro con un correo de prueba → entra con esa contraseña en otra pestaña de incógnito.
3. Panel → **Empezar clase** con un material → se abre la clase en directo con la lección proyectada.
4. En la clase → Invitar → copia el enlace y ábrelo en un móvil en incógnito como invitado: debe caer directamente en la clase.
5. Desde el móvil: responde a una pregunta, marca el semáforo, escribe una duda; comprueba que llegan al maestro.
6. Terminar la clase → resumen.
Si un paso falla, anota el mensaje exacto de la pantalla.

**Enlace y QR de clase = puerta directa (clase.html)**
- «Invitar a esta clase» y el código de invitados del grupo generan ahora un enlace tipo `clase.html?c=CÓDIGO`, que es también lo que codifica el QR.
- Al abrirlo (o escanearlo) se ve el nombre de la clase, el grupo y el maestro, y una sola caja: **¿Cómo te llamas?** → **Entrar a la clase**. Nada de correo, contraseña ni menús.
- Si ese móvil ya entró antes, o si la persona tiene cuenta con sesión iniciada, entra **directamente** sin escribir nada.
- Si el código es de grupo, lleva a la clase en directo o a la próxima programada de ese grupo.
- Los enlaces antiguos (`index.html?clase=` o `entrar.html?clase=`) redirigen solos a esta pantalla.
- Debajo hay un enlace pequeño «¿Ya tienes cuenta? Entra con tu correo» por si alguien prefiere entrar con su usuario.

**Material con destino y autor**
- Al subir material (desde Biblioteca o desde la clase) se pregunta: título, **de qué trata**, **tipo** (lección, lectura, presentación, vídeo, audio, guía, imagen), **para qué es** (general, grupo, curso o serie), serie o tema, etiquetas y **quién puede verlo** (solo yo / el equipo / todo el campus). El autor se guarda solo.
- Desde la clase, el grupo viene ya puesto y se puede marcar «Guardar también en la biblioteca».
- En Biblioteca, cada ficha muestra el destino (👥 grupo, 📘 curso o 📁 serie), el autor, el tipo y las veces que se ha usado, con filtros Todo · Mío · De grupos · De cursos y buscador por autor, grupo o etiqueta.
- Al subir se puede **añadir directamente a una clase** próxima desde el mismo formulario.

**Eliminar y limpiar (solo coordinación)**
- En **Equipo**, cada persona tiene ⏸ **Desactivar** (deja de entrar, se conserva todo) y 🗑 **Eliminar** (borra cuenta, respuestas, asistencia y grupos; si llevaba un grupo, este queda sin maestro). Pide escribir BORRAR. No se puede eliminar uno mismo ni al último coordinador.
- En la pestaña **Alumnos**, el mismo botón 🗑 para borrar a un alumno.
- En **Configuración → Datos de prueba**: recuento de lo que hay en el campus y casillas para borrar de golpe clases, grupos, alumnos, invitados, maestros, material, cursos o plantillas. No toca ajustes, logo ni la cuenta de coordinación. Además, «Limpiar invitados antiguos».
- Antes de vaciar el campus conviene hacer una copia en Supabase (Database → Backups).

**Invitar a una clase (enlace por WhatsApp, sin QR)**
- En la clase, **Invitar** muestra el enlace, el botón **Enviar por WhatsApp**, **Copiar enlace** y **Probar el enlace** (abre lo que verá el alumno). Ya no hay QR.
- El alumno toca el enlace: ve el nombre de la clase y una caja «¿Cómo te llamas?» → **Entrar a la clase**. Si ya entró desde ese móvil, entra directo.
- El invitado queda **atado a esa clase**: si intenta abrir el panel del alumno, la portada o la pantalla de entrada, vuelve a su clase. No tiene menús ni campus.
- **Al terminar la clase** (pasado el margen) se le cierra todo: sin vídeo, sin material, sin actividades. Solo «La clase ha terminado, gracias por venir», y si el maestro lo marcó al finalizar, el enlace de la grabación. Si vuelve a tocar el enlace, ve el mismo aviso.
- El alumno registrado que use ese enlace entra igual a la clase, con su nombre, y conserva su campus.

**Actualizaciones y comprobación (fin de las «versiones antiguas»)**
- Todos los archivos del campus llevan número de versión; al subir una entrega, los móviles y ordenadores descargan la nueva automáticamente en la siguiente recarga. Ya no hace falta incógnito ni Ctrl+F5.
- En la pantalla de entrada y en la de clase se ve abajo la **versión** (por ejemplo v1.0.2026…). Si alguien dice que algo no le funciona, pregúntale qué versión ve.
- **Configuración → Estado del campus**: comprueba contra Supabase que están todas las piezas (funciones, tablas y permisos) y marca en rojo lo que falte; incluye «Actualizar este dispositivo» para forzar la descarga limpia.
- Si una pantalla tarda más de la cuenta, ya no se queda en «Cargando»: aparece un aviso con el motivo y un botón **Reintentar**.
- El vídeo va por su cuenta: si no conecta, la clase (lección, chat, actividades) sigue funcionando y aparece «Reintentar» junto al vídeo.

**Para publicar cambios (uso interno)**
- Antes de subir, ejecutar `./release.sh`: renumera la versión de todos los archivos.
- El archivo `_headers` (raíz) le dice a Cloudflare que no guarde los HTML en caché.

**Arranque a prueba de fallos (sin depender de servidores externos)**
- La librería de conexión (Supabase) ahora viaja dentro del campus (`assets/vendor/supabase.js`). Antes se descargaba de un servidor externo y en algunos móviles o redes esa descarga se quedaba colgada: la pantalla mostraba «Cargando la clase…» para siempre. Ya no ocurre.
- Todas las páginas llevan un vigilante que, si algo no arranca en 9 segundos o falla una descarga, muestra **«No se pudo abrir el campus»** con el paso exacto, la versión y un botón **Reintentar**.

**Saneamiento del acceso (entrega A)**
- Todas las formas de entrar a una clase (enlace, código de clase, código de grupo) usan el mismo mecanismo. Se retira la vía antigua que dejaba al invitado sin clase asignada y le mostraba «La clase ha terminado».
- Mensajes distintos según lo que pase: código no válido · no hay clase abierta ahora · la clase ha terminado · la clase aún no admite invitados · tu acceso no está vinculado a ninguna clase · no hay conexión.
- Si falla la lectura del perfil, el campus avisa en vez de tratar a un maestro como alumno.
- Recuperar contraseña, apuntarse a un curso y las invitaciones terminan su proceso antes de ir al panel.
- Los códigos pendientes guardados en el móvil solo se borran si la operación salió bien.
