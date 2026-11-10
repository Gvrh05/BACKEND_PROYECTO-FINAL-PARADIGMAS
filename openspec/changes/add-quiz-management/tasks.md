# Tasks

Los grupos 1–4 corresponden a `kahoot-api/`. Los grupos 5–7 corresponden a `../kahoot-web/profe-link-kahoot_game/` y deben ejecutarse desde un contexto autorizado de ese repositorio; este cambio repo-local no amplía sus raíces de edición. El grupo 8 verifica la integración. No modificar `../auth`. Referencias de aceptación: las tres capacidades de `specs/` y las decisiones de `design.md`.

## 1. API: persistencia, migraciones y entorno

- [x] 1.1 Añadir TypeORM/PostgreSQL, configurar `DatabaseModule` y DataSource con `synchronize: false` y comandos de migración; verificar instalación con pnpm, `pnpm run build` y conexión a una base de prueba mediante `DATABASE_URL`.
- [x] 1.2 Convertir Quiz/Question en entidades persistentes y añadir QuestionOption/FileCleanupJob con índices, UUID, cascadas y migración inicial; verificar que la migración up crea el esquema esperado y down/up funciona exclusivamente en una base descartable.
- [x] 1.3 Añadir checks de rangos, posiciones y metadatos de imagen, y trigger diferido de cuatro opciones con una correcta; verificar con pruebas PostgreSQL commits válidos, rechazo de estados inválidos, cambios de padre y eliminación cascade sin falsos errores.
- [x] 1.4 Preparar fixtures de dos usuarios JWT, aplicación e2e con configuración real y aislamiento de base/archivos; verificar que un test puede crear y cerrar dos instancias de aplicación sin borrar datos ajenos ni tocar uploads reales.
- [x] 1.5 Ajustar Dockerfile al lockfile pnpm existente y documentar migraciones, respaldo, variables y volumen en README/`.env.example`; verificar build de imagen y ejecución del comando de migración compilado sin `synchronize` ni un segundo lockfile.

## 2. API: identidad, DTO y contrato de autoría

- [x] 2.1 Normalizar identidad JWT desde `sub` UUID sin sobreescritura por payload y exigir secreto configurado; verificar pruebas de token ausente, expirado, firma incorrecta, `sub` inválido y payload con `userId` distinto.
- [x] 2.2 Añadir DTO explícitos de crear/editar cuestionario y pregunta con límites, trim, opciones anidadas, única correcta y tipos booleanos/numéricos estrictos; verificar pruebas unitarias para cuatro opciones, 0/2 correctas, strings booleanos, nulos, rangos y defaults.
- [x] 2.3 Aplicar pipes estrictos solo al área de autoría, parámetros UUID y rechazo de PATCH vacío/campos de solo lectura; verificar respuestas `400` con el filtro existente y ausencia de cambios de validación en juego/resultados.
- [x] 2.4 Definir serializadores y esquemas OpenAPI de QuizSummary/QuizDetail/QuestionResource, Bearer y errores; verificar ejemplos JSON, fechas ISO y que nunca se serializan claves de disco ni campos internos de limpieza.

## 3. API: CRUD propietario de cuestionarios y preguntas

- [x] 3.1 Sustituir los stubs de crear/listar/consultar quiz por persistencia filtrada por propietario; verificar e2e de `201/200`, lista vacía, aislamiento entre usuarios, detalle con preguntas y persistencia al recrear la aplicación.
- [x] 3.2 Implementar PATCH y DELETE de cuestionario con autorización transaccional y bloqueo de fila; verificar actualización parcial, limpieza de metadatos opcionales, `updatedAt`, cascade y equivalencia de `404` ajeno/inexistente.
- [x] 3.3 Completar crear/listar/consultar/editar/eliminar preguntas anidadas con verificación de pertenencia y cuatro opciones atómicas; verificar e2e de todas las rutas, pregunta bajo quiz incorrecto, defaults, conservación de campos omitidos y rollback al fallar la sustitución.
- [x] 3.4 Añadir pruebas de mutaciones concurrentes y una matriz de propietario/otro usuario para cada operación JSON; verificar que ninguna solicitud ajena cambia datos y que eliminación simultánea no deja preguntas u opciones huérfanas.
- [x] 3.5 Completar `docs/openapi.json` y ejemplos README del CRUD y sus cambios incompatibles; verificar que rutas, códigos, cuerpos directos y restricciones coinciden con las respuestas e2e de este grupo.

## 4. API: imágenes públicas y recuperación de archivos

- [x] 4.1 Añadir recepción multipart con propiedad comprobada antes del flujo, staging privado, nombres UUID y validación de bytes/firma/decodificación mediante sharp; verificar JPEG/PNG/WebP, límite de 5 MiB, 25 megapíxeles, tipo falsificado, vacío, múltiples archivos y nombres hostiles con errores `400/413/415`.
- [x] 4.2 Implementar PUT de imagen con transacción, revalidación bajo bloqueo y conservación del archivo anterior ante falla; verificar creación, reemplazo, error inducido de escritura/commit y dos reemplazos concurrentes con una sola asociación final.
- [x] 4.3 Mantener GET binario autenticado solo por compatibilidad y servir `imageUrl` pública bajo `/uploads/questions/`; verificar ruta sin token, `404` para archivo ausente y no exposición de rutas físicas.
- [x] 4.4 Implementar DELETE de imagen y encolado transaccional de archivos al borrar imagen/pregunta/quiz; verificar `204` idempotente sobre imagen ausente y acceso revocado inmediatamente, conservando la pregunta al quitar solo su imagen.
- [x] 4.5 Implementar trabajador idempotente de FileCleanupJob con backoff y barrido conservador de residuos antiguos; verificar falla temporal de unlink, reinicio con trabajo pendiente, archivo ya ausente y protección de archivos activos o recientes.
- [x] 4.6 Documentar multipart, formatos, límite de 5 MiB, URL pública y operación de limpieza en OpenAPI/README; verificar los ejemplos contra la suite e2e con raíz temporal.

## 5. Web: acceso y cliente tipado de API

- [x] 5.1 Configurar Vitest, React Testing Library y entorno DOM con mocks de red; verificar un test de render y `pnpm run build` en el repositorio frontend, sin introducir dependencias en la API.
- [x] 5.2 Crear tipos y clientes separados para `VITE_API_URL` y `VITE_AUTH_API_URL`, conservando Axios y permitiendo FormData/blob; verificar pruebas de URL con prefijo, Bearer, respuesta de login `{ accessToken, user }` y multipart sin cabecera JSON forzada.
- [x] 5.3 Implementar LoginForm y proveedor de sesión solo en memoria usando el login externo; verificar credenciales rechazadas, acceso correcto, logout y reinicio sin persistir tokens ni contraseñas en almacenamiento del navegador.
- [x] 5.4 Manejar `401`, cancelar solicitudes y descartar respuestas de generaciones de sesión anteriores; verificar que una respuesta tardía no restaura cuestionarios ni imágenes después del logout o al entrar otra cuenta.
- [x] 5.5 Añadir `.env.example` y documentación de username/contraseña; verificar que no se requieren secretos en variables `VITE_*` y que el login funciona con el contrato Auth.

## 6. Web: listado y editor de cuestionarios/preguntas

- [x] 6.1 Componer App con listado, detalle y formularios por funcionalidad, y estados carga/vacío/error/reintento; verificar pruebas de render y que solo se muestra la respuesta de la sesión actual, no datos ficticios.
- [x] 6.2 Implementar crear/editar cuestionario con validación, conservación de borrador y portada no modificada, y bloqueo de doble envío; verificar pruebas de título inválido, PATCH mínimo, falla de API y navegación al detalle tras crear.
- [x] 6.3 Implementar formulario de pregunta con cuatro textos y selección exclusiva, respetando defaults y valores omitidos; verificar pruebas de cuatro opciones, cambio de correcta, campos vacíos y edición sin pérdida de tiempo/puntos/imagen.
- [x] 6.4 Implementar consulta, edición y borrado de preguntas y cuestionarios con confirmación y manejo de `404`; verificar que cancelar no emite DELETE, falla conserva el elemento y éxito lo retira tras `204`.
- [x] 6.5 Aplicar estilos adaptables y semántica accesible, y documentar los flujos de autoría en README frontend; verificar a 320 px/escritorio, navegación por teclado, foco/etiquetas y texto con HTML mostrado literalmente.

## 7. Web: imágenes y guardado por etapas

- [x] 7.1 Añadir selección, validación preliminar y previsualización de imagen opcional; verificar pruebas de formatos/tamaño, descarte de selección y revocación de object URLs al desmontar o salir.
- [x] 7.2 Implementar guardado JSON seguido de carga multipart, con estado de éxito parcial y reintento solo del archivo; verificar que una falla posterior al POST conserva el UUID y que el reintento no crea otra pregunta.
- [x] 7.3 Mostrar imágenes desde la ruta pública y permitir reemplazarlas o quitarlas con confirmación; verificar actualización visual tras éxito y conservación de imagen previa ante falla.
- [x] 7.4 Documentar límites, autenticación de imágenes y recuperación del éxito parcial en README frontend; verificar el flujo guiado con las pruebas de componentes, incluidos `413/415`, logout con imagen visible y sesión expirada durante carga.

## 8. Verificación integrada de la entrega

- [x] 8.1 Ejecutar en sus respectivos repositorios suites de API y web, compilaciones y lint sin reescritura automática no revisada; verificar los resultados registrados y que las pruebas de humo anteriores no requieren abrir endpoints privados ni modificar identidad.
- [x] 8.2 Validar con PostgreSQL y servicio de autenticación reales el ciclo acceso → quiz → pregunta con cuatro opciones → imagen → edición → eliminación, repitiendo consulta tras reiniciar API y con otra cuenta; verificar persistencia, aislamiento y códigos previstos en OpenAPI.
- [x] 8.3 Ejecutar el procedimiento documentado de despliegue/migración y recuperación en entorno descartable, incluyendo fallo de limpieza y reinicio; verificar volumen persistente, procesamiento de pendientes y que el rollback de aplicación conserva tablas y archivos sin operaciones destructivas automáticas.

## 9. Integración demo, Auth y dashboard

- [x] 9.1 Persistir `isDemo` y `imageUrl` mediante migraciones; incluir el demo en listados/lecturas para cualquier cuenta y rechazar cambios en API; verificar migraciones y e2e de lectura/solo lectura.
- [x] 9.2 Completar landing, login sin correo y dashboard con sidebar Quices/Crear partida/Resultados; implementar PIN de sala autenticado, consulta de resultados y control visual del demo; verificar suite, build y lint frontend.
- [x] 9.3 Preparar Compose con bases separadas de Auth y API, healthchecks, Dockerfiles y lanzadores; verificar configuración, builds y smoke test de health/frontend con datos temporales.
- [ ] 9.4 Colocar manualmente `public/seeds/q1.png`–`q10.png` y ejecutar `quiz-seed`; verificar idempotencia, archivos públicos y cuestionario demo completo sin generar assets.
