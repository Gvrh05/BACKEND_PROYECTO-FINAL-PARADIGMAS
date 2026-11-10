## Why

El Punto 3 requiere que un anfitrión seleccione un cuestionario propio, cree una sala con PIN, observe participantes y comience la partida sin mezclar salas. El backend y frontend actuales son scaffolds: faltan autenticación JWT real, persistencia y transporte Socket.IO funcional; además, el listado público de quizzes todavía devuelve un mock vacío.

## What Changes

- Implementar creación, unión idempotente, participantes en vivo, inicio exclusivo del host y reconexión mediante REST y Socket.IO autenticados.
- Añadir `QuizzesService.findAllByOwner(ownerId)`, `findOneByOwner(quizId, ownerId)` y `existsAndOwnedBy(quizId, ownerId)` usando repositorios. Exponer el listado del host mediante `GET /game-sessions/available-quizzes`, nunca mediante cambios al controller de quizzes.
- Integrar TypeORM/Postgres con ConfigService; decorar las clases existentes `Quiz` y `Question` conservando nombres y propiedades, y persistir `GameSessionEntity`. Añadir seed manual con `ownerId='test-host-id'`, un quiz y dos preguntas.
- Mantener `findAll()` devolviendo `[]` y los otros métodos actuales de quizzes intactos. La implementación real de esos métodos sigue siendo responsabilidad del compañero de quizzes, fuera de este change.
- Crear las cuatro páginas React del Punto 3, contexto de auth preparado para el compañero, cliente HTTP y singleton Socket.IO.
- Incorporar hooks no-op de tracing/métricas, variables de entorno, pruebas unitarias/e2e y documentación reproducible en ambos README.
- Conservar el prefijo HTTP existente `/kahoot-api`; usar `/game` como namespace WS independiente. Los paths REST aquí descritos son relativos al prefijo.

## Capabilities

### New Capabilities

- `game-session-available-quizzes`: lectura interna de quizzes por propietario y endpoint autenticado propio para poblar el selector sin alterar quizzes REST.
- `game-session-create`: validar ownership, generar PIN único y persistir una sala aislada con host autenticado.
- `game-session-join`: incorporar por identidad JWT sin duplicados y rechazar nuevas incorporaciones después del inicio.
- `game-session-participants`: listar y notificar participantes por sala, con gestión de desconexiones.
- `game-session-start`: permitir únicamente al host la transición persistida LOBBY → IN_PROGRESS y notificarla por sala.
- `game-session-reconnect`: recuperar snapshot y suscripción de una identidad ya registrada tras recargar o reconectar.

### Modified Capabilities

Ninguna: `openspec/specs/` no contiene specs previos.

## Impact

- Backend: `src/shared/database`, guard JWT, configuración de AppModule, módulo game-session completo, integración mínima en entidades/módulo/service de quizzes, `src/tracing.ts`, primera importación en main, configuración, seed, tests, README y contratos en `docs/openapi.json`.
- Dependencias: `@nestjs/config`, `@nestjs/jwt`, `@nestjs/typeorm`, `typeorm`, `pg`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `class-validator`, `class-transformer`; `socket.io-client` para pruebas WS.
- Frontend hermano `../FRONT_PROYECTO-FINAL_PARAGIDMAS`: React Router, axios ya existente, Socket.IO client y zod; páginas, estilos responsive, README y `.env.example`. Los artefactos OpenSpec permanecen en el backend; durante apply se debe respetar la autorización explícita del usuario para trabajar también en el frontend hermano.
- No implementar respuestas, puntajes ni clasificación; no tocar results, `.gitignore`, controller/DTOs de quizzes ni contratos REST existentes de quizzes. No implementar login/register, Auth Service ni SDK/exportador OTel real. No modificar servicios/volúmenes de Compose salvo variables aditivas en `api`.
- Esta fase solo propone. Implementación, ejecución de pruebas, sincronización de specs y archivo quedan para apply/archive posteriores; no se declara un PR creado.
