# Proposal

## Why

El módulo actual de cuestionarios devuelve datos de ejemplo, no persiste cambios ni comprueba quién es el propietario. El frontend existente aún es una plantilla; se necesita un flujo completo para que un usuario autenticado administre sus cuestionarios, preguntas e imágenes desde web y pantallas móviles.

## What Changes

- Completar el CRUD persistente de cuestionarios y preguntas, limitado al propietario identificado por el JWT del servicio de autenticación existente.
- Adoptar la aclaración del usuario: cada pregunta tiene enunciado de texto plano y cuatro opciones de texto, exactamente una con `isCorrect: true` y tres con `isCorrect: false`. No se introduce un campo de respuesta global Verdadero/Falso.
- **BREAKING**: validar estrictamente esa cardinalidad en `options`, sustituir las respuestas simuladas por recursos persistidos y restringir consultas/modificaciones al propietario. Se conservan los nombres de campos y las rutas existentes cuando corresponda.
- Permitir agregar, reemplazar y quitar imágenes de pregunta validadas (JPEG/PNG/WebP, 5 MiB) con URL relativa pública persistida.
- Hacer visible el quiz demo de diez preguntas para todas las cuentas y protegerlo como solo lectura en API e interfaz.
- Construir landing, login por username/contraseña y dashboard React con Quices, Crear partida y Resultados.
- Añadir migraciones PostgreSQL, seed idempotente, Auth/API con bases separadas, contenedores, Compose, pruebas automatizadas, OpenAPI e instrucciones de ejecución conjunta.

## Capabilities

### New Capabilities

- `quiz-authoring`: CRUD persistente de cuestionarios propios y preguntas de cuatro opciones con una única correcta; validación y aislamiento entre usuarios.
- `question-images`: asociación opcional, URL pública persistida, validación de carga, sustitución y eliminación.
- `quiz-authoring-ui`: experiencia React con landing, dashboard y flujos autenticados de quizzes, salas y resultados.

### Modified Capabilities

Ninguna. El inventario de OpenSpec no contiene especificaciones principales existentes.

## Impact

- Backend: `src/modules/quizzes/`, `src/shared/database/`, validación del identificador autenticado en `src/shared/guards/jwt-auth.guard.ts`, configuración de arranque, `docs/openapi.json`, pruebas, variables de entorno y despliegue.
- Persistencia: PostgreSQL 16 ya declarado en `docker-compose.yml`; añadir TypeORM, controlador PostgreSQL, validadores DTO, manejo de multipart y migraciones. No hay tablas de cuestionarios existentes observadas ni datos persistidos que migrar desde los servicios simulados.
- Frontend objetivo: `../kahoot-web/profe-link-kahoot_game/`, repositorio independiente con React, TypeScript, Vite y Axios. Toda la planificación se guarda aquí, en `kahoot-api`; una aplicación posterior debe abarcar explícitamente ambos repositorios y respetar sus cambios locales.
- Integración externa de solo consumo: servicio en `../auth`, cuyo login devuelve `{ accessToken, user }`. No modificar ese repositorio ni su modelo de usuarios; `authorId` es una referencia lógica al `sub` del JWT.
- Se conservan `timeLimitSeconds`, `points`, `description` y `coverImageUrl` como campos de compatibilidad; la carga nueva se limita a imágenes de preguntas.
- Fuera de alcance: aplicación móvil nativa, registro/recuperación de cuentas, rediseño de autenticación, colaboración, publicación pública, importaciones, nuevas modalidades de pregunta y cambios en sesiones de juego, puntuación o resultados.
