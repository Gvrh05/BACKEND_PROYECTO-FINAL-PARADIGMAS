# Design

## Context

Ver `proposal.md` para motivación y alcance, y `specs/` para el contrato observable.

Hallazgos comprobados en los repositorios:

- `src/modules/quizzes/` ya separa controlador, servicio, DTO y entidades, pero el servicio devuelve arreglos vacíos y recursos ficticios. Solo existen crear/listar/consultar cuestionario y agregar pregunta; no hay comprobaciones de propiedad.
- `Question` ya tiene `questionText`, `options[].isCorrect`, tiempo, puntos e `imageUrl`. `Quiz` aún no tiene `authorId`. No se observó persistencia de estos modelos.
- `DatabaseModule` está vacío. Docker Compose declara PostgreSQL 16 y un volumen para `public/uploads`; `.env.example` ya declara `DATABASE_URL`, `UPLOADS_DEST` y `MAX_FILE_SIZE=5242880`.
- `JwtAuthGuard` está registrado globalmente y verifica tokens externos; actualmente no valida `sub` y permite que el spread del payload sobreescriba la identidad normalizada. El decorador `CurrentUser` está disponible.
- `main.ts` usa prefijo `kahoot-api`, CORS y el filtro de error `{ statusCode, timestamp, path, error }`; aún no registra validación DTO ni entrega de archivos.
- `../kahoot-web/profe-link-kahoot_game/` tiene React, TypeScript, Vite y Axios. `App.tsx` solo muestra “Hola”; el cliente Axios usa `VITE_API_URL` y fuerza Content-Type JSON. No hay router, sesión, pantallas ni pruebas de frontend.
- Se inspeccionó `../auth` únicamente como dependencia de integración: usa TypeORM y usuarios UUID; `POST /auth/login` recibe `{ username, password }` y responde `{ accessToken, user: { id, username, role } }`. Su puerto predeterminado es 3001, distinto del ejemplo 4000 configurado en la API.
- No hay especificaciones principales existentes. Las pruebas actuales de API son las iniciales del proyecto, sin cobertura de cuestionarios ni archivos.

## Goals / Non-Goals

**Goals:**

- Integrar el CRUD en la arquitectura modular actual, sin crear otro backend o frontend.
- Hacer cumplir propiedad y consistencia también cuando coinciden varias solicitudes.
- Separar datos JSON de transferencia de archivos y declarar explícitamente sus fallas parciales en la interfaz.
- Mantener una única fuente de verdad para identidad: JWT emitido por el servicio externo.
- Dejar una ruta verificable de despliegue y pruebas para los dos repositorios objetivo.

**Non-Goals:**

- No introducir administración de usuarios en `kahoot-api`, restricciones nuevas por rol, almacenamiento de contraseñas ni un segundo emisor JWT.
- No acoplar estas migraciones a la base del servicio de identidad ni crear claves foráneas hacia sus usuarios.
- No conectar este cambio al ciclo de partidas o a resultados; los servicios de juego inspeccionados aún no consumen preguntas persistidas.
- No exigir consistencia distribuida entre el guardado JSON de una pregunta y su carga de imagen posterior.

## Decisions

### 1. Alcance físico y organización por funcionalidad

La planificación vive exclusivamente en `kahoot-api/openspec/changes/add-quiz-management/`. Los futuros cambios de backend corresponden a este repositorio; los de frontend a `../kahoot-web/profe-link-kahoot_game/`. El servicio `../auth` no se modifica.

La aplicación debe ejecutar cada etapa con el repositorio objetivo como raíz de edición autorizada. El contexto repo-local de este cambio no amplía automáticamente sus `allowedEditRoots`: las tareas frontend se ejecutan desde un contexto autorizado de ese repositorio, usando estos documentos como referencia de solo lectura. No mover ni duplicar el frontend dentro de `kahoot-api`.

Estructura prevista:

| Repositorio | Área | Responsabilidad |
| --- | --- | --- |
| API | `src/shared/database/` y migraciones | DataSource TypeORM, conexión, ciclo de vida y esquema |
| API | `src/modules/quizzes/controllers/` | Rutas de cuestionarios, preguntas y archivo |
| API | `src/modules/quizzes/dto/` | DTO explícitos de creación/edición y validadores |
| API | `src/modules/quizzes/services/` | Autoría, almacenamiento de imágenes y limpieza |
| API | `src/modules/quizzes/entities/` | Quiz, Question, QuestionOption y FileCleanupJob |
| Web | `src/features/auth/` | Formulario mínimo de acceso, contexto de sesión en memoria |
| Web | `src/features/quizzes/` | Tipos, servicio de API, hooks y componentes de autoría |
| Web | `src/api/` | Clientes Axios para API de autoría y login externo |

**Alternativa descartada:** crear otra aplicación o concentrar toda la lógica en `App.tsx`; no aprovecha la estructura existente y dificulta pruebas.

### 2. PostgreSQL con TypeORM y migraciones explícitas

Añadir `@nestjs/typeorm`, `typeorm` y `pg`, usando la misma familia de persistencia observada en identidad, pero con una base independiente. `DatabaseModule` configura `DATABASE_URL` y un DataSource reutilizable por el CLI de migraciones; `synchronize: false` en todos los entornos. La configuración tratará `schema=public` del ejemplo de URL de forma compatible con TypeORM.

Modelo propuesto:

| Tabla | Campos principales | Integridad |
| --- | --- | --- |
| `quizzes` | `id uuid`, `author_id uuid`, `title varchar(150)`, `description text null`, `cover_image_url text null`, `created_at`, `updated_at` | Índice `(author_id, created_at, id)`; propietario inmutable por API |
| `questions` | `id uuid`, `quiz_id uuid`, `question_text text`, `time_limit_seconds int default 20`, `points int default 1000`, `image_storage_key text null`, `image_mime_type text null`, `image_size int null`, `created_at`, `updated_at` | FK a quiz con cascade; índice `(quiz_id, created_at, id)`; tiempo 1..300 y puntos 0..100000; metadatos de imagen todos nulos o todos presentes; clave de imagen única si existe |
| `question_options` | `id uuid`, `question_id uuid`, `text varchar(500)`, `is_correct boolean`, `position smallint` | FK con cascade; posición 0..3, única por pregunta |
| `file_cleanup_jobs` | `id uuid`, `storage_key text unique`, `attempts int`, `next_attempt_at`, `created_at` | Sin FK a pregunta para sobrevivir a su eliminación; índice por próximo intento |

UUID generados en el servidor, fechas UTC y propietario obtenido de `sub`. `author_id` es referencia lógica, no copia de un usuario ni FK entre bases. Listados por fecha de creación y UUID; opciones por posición. No se incluye reordenamiento de preguntas.

Las cuatro opciones y su única correcta se validan en DTO/servicio. Además, una restricción diferida mediante trigger de migración comprueba al commit que cada pregunta existente tenga cuatro opciones y una correcta. Debe comprobar inserciones de preguntas y mutaciones de opciones, incluidos cambios de padre; omite padres eliminados por cascade. Esto permite reemplazar el conjunto dentro de una transacción sin aceptar estados finales incompletos.

**Alternativas descartadas:** memoria/JSON local no asegura persistencia e integridad concurrente; Prisma introduciría otra convención respecto del servicio hermano; opciones JSONB reducen tablas pero dificultan la identidad y validación relacional ya presentes en el modelo.

### 3. Identidad normalizada y autorización en el límite de datos

Reutilizar el guard global. Validar firma y expiración con secreto configurado y algoritmo compatible con el emisor existente; exigir `sub` UUID. Asignar `userId` desde el `sub` validado después de cualquier dato adicional, sin permitir su sobreescritura por el payload. No confiar en `authorId` del body ni permitirlo en DTO. Configurar `JWT_SECRET` compartido explícitamente; no depender del fallback inseguro actual.

Cada búsqueda de autoría incorpora `author_id = userId`. Las preguntas se consultan mediante pertenencia a `quizId` y al propietario del quiz. Un UUID ajeno o inexistente da el mismo `404`; la sintaxis inválida del identificador da `400`. No añadir un bloqueo por rol: el requisito autoriza al usuario autenticado a gestionar lo suyo.

Cada mutación toma un bloqueo de fila del quiz dentro de una transacción y repite la comprobación de propiedad. Serializa altas/bajas/ediciones subordinadas, eliminación del quiz y sustituciones de imagen de ese cuestionario. Evita comprobar propiedad una vez y mutar después sin protección. Las modificaciones de preguntas/imágenes actualizan también `quiz.updatedAt`.

**Alternativa descartada:** verificar propiedad solo en React o por un GET previo al cambio; permite llamadas directas y condiciones de carrera.

### 4. Contrato REST, DTO y serialización explícita

Todas las rutas de la tabla llevan el prefijo `/kahoot-api` en el servidor:

| Método | Ruta | Respuesta exitosa |
| --- | --- | --- |
| POST | `/quizzes` | `201 QuizSummary` |
| GET | `/quizzes` | `200 QuizSummary[]` |
| GET | `/quizzes/:quizId` | `200 QuizDetail` |
| PATCH | `/quizzes/:quizId` | `200 QuizSummary` |
| DELETE | `/quizzes/:quizId` | `204` sin cuerpo |
| POST | `/quizzes/:quizId/questions` | `201 QuestionResource` |
| GET | `/quizzes/:quizId/questions` | `200 QuestionResource[]` |
| GET | `/quizzes/:quizId/questions/:questionId` | `200 QuestionResource` |
| PATCH | `/quizzes/:quizId/questions/:questionId` | `200 QuestionResource` |
| DELETE | `/quizzes/:quizId/questions/:questionId` | `204` sin cuerpo |
| PUT | `/quizzes/:quizId/questions/:questionId/image` | `200 QuestionResource` |
| GET | `/quizzes/:quizId/questions/:questionId/image` | `200` binario |
| DELETE | `/quizzes/:quizId/questions/:questionId/image` | `204` sin cuerpo |

`QuizSummary` contiene `id`, `authorId`, título, descripción/portada anulables y fechas ISO. `QuizDetail` añade `questions`. `QuestionResource` contiene `id`, `quizId`, enunciado, tiempo, puntos, opciones `{ id, text, isCorrect }` en orden e `imageUrl` anulable. `imageUrl` es una ruta relativa al origen de API que incluye el prefijo y apunta al endpoint privado; no contiene token, nombre de disco o ruta física. Los metadatos internos de almacenamiento no se serializan.

Creaciones y PATCH retornan recursos directos, sin el wrapper simulado `{ message, data }`. Edición de opciones sustituye el conjunto y genera nuevos UUID de opciones: no hay API de edición individual de una opción. Esto no integra partidas existentes ni preserva referencias de opciones de sesiones activas.

Usar `class-validator` y `class-transformer` con DTO de edición explícitos: propiedades opcionales no equivalen a permitir `null`. Solamente descripción/portada permiten `null`; título, enunciado, opciones, tiempo y puntos no. Recortar los textos, validar anidados, tamaño exacto de arreglo y un único booleano verdadero; desactivar conversión implícita de tipos. `imageUrl` es de solo lectura.

Aplicar validación estricta al módulo de autoría con `whitelist` y `forbidNonWhitelisted`, y validación UUID de parámetros. No introducir un pipe global estricto que cambie accidentalmente los DTO aún sin decoradores de resultados/juego. Campos desconocidos, solo lectura y PATCH vacíos producen `400` con el filtro existente. Mapear errores esperados de multipart a `400`, `413` o `415`; no devolver rutas de archivos ni mensajes SQL internos.

**Alternativas descartadas:** PUT para reemplazar todo el cuestionario obliga a reenviar preguntas y portada; operaciones CRUD anidadas independientes reducen pérdida de datos y permiten reintentos específicos.

### 5. Archivos locales privados con asociación transaccional y limpieza persistente

Usar `UPLOADS_DEST` con límite `MAX_FILE_SIZE` de 5 MiB por defecto, conservando el volumen existente. Aunque la carpeta actual se llame `public/uploads`, no se expone mediante `ServeStaticModule`, Express static ni proxy público. Cada archivo usa una clave UUID interna y extensión derivada de su formato validado, nunca el nombre original.

Usar multipart de Nest/Express con límite de un archivo y tamaño aplicado durante la recepción. Verificar autenticación y propiedad antes de aceptar el flujo de archivo, y volver a comprobar bajo bloqueo antes del commit. Validar firma y decodificación real JPEG/PNG/WebP con `sharp`, con límite de 25 megapíxeles para contener imágenes comprimidas abusivas. Rechazar SVG, dimensiones excesivas y cualquier tipo inconsistente con `415`; ni extensión ni MIME del cliente bastan. No forzar `Content-Type: application/json` en esa solicitud.

Secuencia de carga/reemplazo:

1. Recibir en un área temporal bajo la raíz configurada; validar límites y contenido, con limpieza del temporal si se rechaza.
2. Abrir transacción, bloquear quiz y pregunta propia y mover el archivo validado a una clave definitiva nueva en el mismo volumen.
3. Actualizar la referencia y metadatos de la pregunta; si existía imagen anterior, insertar su clave en `file_cleanup_jobs` dentro de la misma transacción.
4. Confirmar y devolver la pregunta; si falla el commit, conservar la referencia anterior y eliminar el archivo nuevo. No borrar previamente la imagen anterior.

Eliminación de imagen o pregunta/quiz: en la misma transacción, encolar todas las claves descartadas y quitar asociaciones o filas; devolver `204` al confirmar. La lectura deja de encontrarlas inmediatamente, aunque el borrado de disco sea posterior.

Un trabajador local de ciclo de vida Nest procesa trabajos con exclusión por fila, borrado idempotente y backoff; la ausencia del archivo cuenta como éxito. Antes de eliminar comprueba que la clave no esté referenciada por una pregunta. No usar Redis. Un barrido de temporales/archivos no referenciados con antigüedad superior a 24 horas recupera residuos de un cierre abrupto entre escritura y transacción; no toca archivos recientes ni activos. La limpieza conserva sus trabajos entre reinicios.

La lectura abre y transmite el archivo autorizado sin revelar claves internas, con MIME verificado, `Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff`. Coordinar apertura con el bloqueo de mutaciones para evitar que un reemplazo borre el archivo antes de abrirlo; una lectura ya abierta puede terminar normalmente. Si falta físicamente un archivo, responder `404` y registrar el incidente sin filtrar su ubicación.

**Alternativas descartadas:** URL pública o token en query no preservan privacidad; guardar binarios en PostgreSQL simplifica atomicidad pero desaprovecha el volumen existente y aumenta la base; object storage y URLs firmadas se reservan para un despliegue con varias instancias.

### 6. React por funcionalidades, sesión en memoria y operaciones por etapas

Crear clientes distintos para autoría y autenticación. `VITE_API_URL` apunta a `http://localhost:3000/kahoot-api`; `VITE_AUTH_API_URL` al servicio real, por defecto documentado como `http://localhost:3001/auth`. Ninguna variable `VITE_*` contiene secretos de firma.

El formulario de acceso reutiliza el login inspeccionado, sin registro ni recuperación. El contexto de sesión guarda el token solo en memoria, lo adjunta como Bearer, y descarta token, consultas, formularios privados y URLs de blobs al salir o recibir `401`. Un identificador de generación de sesión y cancelación de solicitudes impiden que una respuesta tardía de la sesión anterior repueble la pantalla. Recargar exige autenticarse de nuevo.

`App.tsx` compone el límite de sesión y las vistas de listado/detalle. Por ser un flujo reducido sin rutas previas, se usará estado de selección explícito, sin introducir router ni Redux. Hooks encapsulan carga, errores, mutaciones y refresco; tipos de recursos siguen OpenAPI.

Componentes previstos: `LoginForm`, `QuizList`, `QuizForm`, `QuizDetail`, `QuestionForm`, `QuestionList`, `QuestionImageInput` y diálogo de confirmación accesible. El editor mantiene cuatro filas y un radio group de correcta; traduce el índice elegido a cuatro booleanos. Al crear omite tiempo/puntos para usar defaults; al editar no envía estos campos si no se cambiaron. No modifica portada existente implícitamente.

Guardar metadatos de quiz, luego preguntas individuales. Si se elige una imagen, primero guardar el JSON y después cargar con `FormData`, permitiendo que el navegador establezca el boundary. Tras éxito del JSON y falla del archivo, mantener el UUID y mostrar “Pregunta guardada; imagen pendiente”, con reintento exclusivo del archivo. Nunca reenviar POST de pregunta para reintentar su imagen.

Las imágenes persistidas se descargan por Axios como blob con Bearer, se muestran mediante object URLs y se revocan al reemplazar, desmontar o cerrar sesión. Resolver `imageUrl` respecto del origen de API para no duplicar `/kahoot-api`. Errores `400` se asocian al formulario, `413/415` al archivo, `404` a recurso no disponible y `401` al límite de sesión. Mantener borradores ante fallas recuperables, no ante cierre de sesión.

CSS adaptable y etiquetas semánticas para funcionar a 320 px y escritorio, usando texto React escapado, nunca `dangerouslySetInnerHTML`. Deshabilitar mutaciones pendientes y confirmar eliminaciones; no hacer eliminación optimista.

**Alternativas descartadas:** localStorage facilita persistencia entre recargas pero prolonga exposición del token; base64 en JSON aumenta tamaño y mezcla etapas; una librería global de estado/router no es necesaria para estas pantallas iniciales.

### 7. Pruebas y entrega reproducible

- API: Jest para validadores/servicios; Supertest sobre PostgreSQL de prueba con migraciones reales, JWT de dos usuarios y una raíz temporal de archivos. Factorizar una configuración de aplicación reutilizable o aplicarla explícitamente en e2e para ejercitar prefijo, filtros y validación reales.
- Integridad: casos de commit/rollback de las cuatro opciones, cascadas, propiedad en todas las rutas, UUID inválidos, PATCH parcial, persistencia después de recrear la aplicación y sustituciones concurrentes.
- Archivos: fixtures reales de los tres formatos, tipo falsificado, archivo vacío/excesivo, múltiples archivos, nombres hostiles, acceso directo, fallas inducidas de disco/commit/borrado y reanudación de limpieza. Evitar que los tests toquen `public/uploads` real.
- Web: introducir Vitest, React Testing Library y entorno DOM, con mocks de Axios/login, pruebas de selección exclusiva, validación, sesión, confirmaciones, vista previa y reintento parcial. Verificar que respuestas antiguas no sobreviven al logout y que el multipart no fuerza JSON.
- Humo integrado con cuentas de prueba existentes: acceso, creación, cuatro opciones, carga, recarga de datos, edición, aislamiento con segunda cuenta y eliminación; revisión a 320 px y teclado.
- Actualizar OpenAPI con esquemas, Bearer, rutas, respuestas de error y multipart. Documentar comandos separados por repositorio, migraciones, variables y cuentas externas necesarias.

**Alternativa descartada:** pruebas con repositorios siempre simulados no detectan restricciones PostgreSQL, cascadas ni condiciones de carrera.

## Risks / Trade-offs

- [Estado inicial sin integración] → No confundir stubs observados con compatibilidad real; publicar el cambio de respuesta y validación junto con el cliente actualizado.
- [JWT o puertos distintos entre servicios] → Configurar secreto idéntico y URLs explícitas; consumir el puerto 3001 observado salvo configuración del entorno, no el ejemplo 4000 sin verificación.
- [Disco y base no comparten una transacción] → Asociar solo archivos preparados, conservar anterior ante rollback, limpieza durable y barrido conservador de residuos.
- [Volumen local no compartido entre réplicas] → Limitar este diseño a una instancia API con volumen persistente; migrar a almacenamiento de objetos antes de escalar horizontalmente.
- [Serialización por cuestionario reduce concurrencia] → Es aceptable para autoría individual y evita carreras de eliminación; revisar granularidad cuando exista colaboración.
- [Nuevas opciones generan nuevos UUID] → No integrar edición con partidas activas en este cambio; futura ejecución debe usar snapshots/versionado antes de conectar sesiones a estos datos.
- [Decodificación de imágenes consume recursos] → Limitar bytes, píxeles y concurrencia de procesamiento; comprobar instalación de `sharp` en Windows y la imagen Alpine durante build.
- [JWT solo en memoria requiere nuevo acceso al recargar] → Mostrarlo como comportamiento deliberado; refresh tokens/BFF son otro cambio.
- [Dockerfile ejecuta `npm ci` pero el repositorio usa `pnpm-lock.yaml`] → Ajustar la receta al gestor y lockfile existentes antes de afirmar que el despliegue es reproducible; no generar un segundo lockfile por accidente.
- [Prueba e2e inicial podría no corresponder al guard global actual] → Revisar su expectativa durante la aplicación, manteniendo o documentando el comportamiento raíz sin abrir endpoints privados para hacerla pasar.

## Migration Plan

1. En la fase de aplicación, verificar cambios locales de ambos repositorios y preparar cada uno en su contexto autorizado. No editar `../auth`; provisionar cuentas y confirmar configuración compartida externamente.
2. Instalar dependencias backend, añadir DataSource y migración inicial con tablas, índices, checks y trigger diferido. No importar los datos simulados ni usar `synchronize`.
3. Ejecutar migraciones sobre una base de desarrollo/prueba nueva y validar up/down en una base descartable. Para producción, respaldar primero y ejecutar la migración una vez como paso explícito de despliegue.
4. Corregir Docker para usar pnpm con lockfile congelado y disponer del comando de migración con la configuración compilada; conservar el volumen de archivos y configurar secreto, CORS y límites. No arrancar la API con un esquema pendiente.
5. Desplegar backend y ejecutar pruebas de contrato/seguridad, luego frontend con URLs correctas; la interfaz antigua solo es una plantilla, no hay flujos de autoría reales que conservar.
6. Verificar flujo integrado, persistencia tras reinicio y recuperación de limpieza. Las pruebas de este cambio no requieren modificar la base de identidad.
7. Rollback: volver a versiones anteriores de aplicación, manteniendo tablas y volumen para no perder datos. La versión backend anterior era un stub y no ofrece CRUD funcional; conservar datos permite desplegar de nuevo. Revertir migraciones únicamente sobre bases descartables o tras respaldo y autorización explícita; nunca borrar uploads como parte automática del rollback.
