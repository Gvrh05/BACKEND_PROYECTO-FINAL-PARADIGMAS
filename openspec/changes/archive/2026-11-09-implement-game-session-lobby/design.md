## Context

Ver motivación y alcance autorizado en `proposal.md`. La inspección requerida por el usuario confirma:

- `DatabaseModule` está vacío; AppModule ya lo importa. No hay ORM, ConfigService, JWT ni validadores entre las dependencias actuales.
- Las clases existentes se llaman `Quiz` y `Question`. Quiz incluye description/coverImageUrl; Question incluye questionText/timeLimitSeconds/points/options, sin decoradores ni relaciones. No se eliminarán esos campos ni renombrarán clases.
- QuizzesService tiene `create`, `findAll`, `findOne`, `addQuestion` con mocks. Su controller no tiene listado por dueño y queda intacto.
- SessionManager ya usa `Map<pin, ActiveSession>` y conserva mapas de jugadores/respuestas por sala. La identidad actual de join no está autenticada y el gateway es un stub.
- `main.ts` aplica el prefijo `kahoot-api` y un filtro HTTP con sobre `{ statusCode, timestamp, path, error }`. La configuración de validación nueva se limitará a game-sessions para no cambiar contratos de otros módulos.
- El frontend tiene scaffold React/Vite y axios ya instalado. El test e2e existente importa AppModule y comprueba Hello World sin inicializar el prefijo de main.
- No hay specs publicados previos. Este change reside en el backend y planifica también el frontend hermano expresamente solicitado por el usuario.

## Goals / Non-Goals

**Aclaraciones aprobadas de Fase C:** acceso DEV ONLY mediante Web Crypto y clave
pública de ejemplo (nunca un secreto real), excluido de producción; botón de
inicio REST requiere otro participante conectado; estado IN_PROGRESS se presenta
como Partida en curso sin navegar; GET atrasado no revierte un inicio WS durante
al menos 2 segundos; contador WS solo join/start/disconnect, sin answer. La
verificación de cleanup usa Edge instalado/CDP nativo y dos contextos aislados,
sin instalar dependencias de navegador ni ejecutar el seed.

**Corrección aprobada de Fase D:** el texto de seed/ownerId del selector vacío
también es DEV ONLY. Producción usa un aviso genérico sin IDs de demo; la prueba
`pnpm verify:production` inspecciona todos los JS compilados para impedir que
reaparezcan IDs, instrucciones seed o código de firma de desarrollo.

**Goals:**
- Una sola lógica de autorización, mutaciones y notificaciones compartida por REST y WS.
- Persistencia de ciclo de vida de salas, presencia en memoria y demo reproducible sin Auth Service ni SDK OTel activos.
- Integración aditiva de quizzes y contrato independiente para el selector.
- Reconexión de pestaña y aislamiento en una instancia backend.

**Non-Goals:**
- No transformar los mocks públicos de quizzes en CRUD real; no tocar su controller ni DTOs.
- No implementar respuestas, cálculo de puntajes, clasificación ni flujos de cierre de juego del Punto 5. Solo preparar un hook de persistencia al remover una sesión.
- No implementar login/register, usuarios locales, SDK/exportación OTel, sesiones distribuidas o recuperación de participantes después de reiniciar el proceso.
- No prometer provisionamiento automático de esquema en producción ni modificar results o `.gitignore`.

## Decisions

### 1. Configuración y conexión única TypeORM

Usar `ConfigModule.forRoot({ isGlobal: true })` y `DatabaseModule` como envoltorio de `TypeOrmModule.forRootAsync`, con `type: 'postgres'`, `url` desde `DATABASE_URL`, `autoLoadEntities: true` y `synchronize: NODE_ENV !== 'production'` leyendo ConfigService. AppModule conserva su importación de DatabaseModule; no duplicar `forRoot` en AppModule. Conservar literalmente el formato `postgresql://...?...schema=public` existente; TypeORM configura esquema `public` sin migrar a Prisma ni alterar la URL.

Alternativa descartada: Prisma contradice autorización; añadir dos conexiones sería redundante. Dependencias nuevas se fijarán a versiones compatibles con Nest 11 en apply.

### 2. Entidades aditivas y seed manual

- Decorar `Quiz` con `@Entity('quizzes')`, UUID PK, title, ownerId string, timestamps y relación one-to-many con Question. Conservar description y coverImageUrl, con columnas opcionales cuando corresponda.
- Decorar `Question` con `@Entity('questions')`, UUID PK, quizId UUID y many-to-one a Quiz con CASCADE, statement text, correctAnswer boolean, imageUrl nullable y order integer. Mantener las propiedades anteriores sin alterar DTOs ni métodos que las usan; mapear las propiedades legacy opcionales de manera compatible (columnas nullable o defaults; options puede ser jsonb), sin imponerles al seed valores incompatibles. No adaptar el CRUD mock en este change.
- Conservar nombres `Quiz`/`Question` y usar alias locales `QuizEntity`/`QuestionEntity` en imports si resulta útil para las firmas pedidas. No crear entidades duplicadas para la misma tabla.
- Registrar ambas clases en `QuizzesModule` con forFeature. Inyectar repositorio de Quiz y añadir solo `findOneByOwner(quizId, ownerId): Promise<Quiz | null>`, `existsAndOwnedBy(quizId, ownerId): Promise<boolean>` y `findAllByOwner(ownerId): Promise<Quiz[]>`. Consultar por parámetros del repositorio, no por SQL interpolado. Mantener cuerpos de los cuatro métodos existentes intactos.
- `GameSessionEntity`: tabla game_sessions, UUID PK, roomCode varchar(6) unique, quizId string (FK lógica validada contra quizzes), hostId string, enum status LOBBY/IN_PROGRESS/FINISHED, createdAt y fechas startedAt/finishedAt nullable. Registrar con forFeature en GameSessionModule y añadir import de QuizzesModule. FK lógica elegida por la autorización adicional para reducir acoplamiento entre módulos.
- `src/shared/database/seed.ts`, invocado con `pnpm seed`, usa la misma configuración dev, crea un quiz de UUID estable para `ownerId='test-host-id'` y dos preguntas V/F de UUID estable. Repetirlo no duplica el quiz/preguntas; imprime el quizId y cierra la conexión. No crea un usuario del Auth Service, no se ejecuta al iniciar Nest ni Compose y no se ejecutará automáticamente durante apply.

Alternativa descartada: renombrar clases o cambiar findAll/controller rompería integración del compañero.

### 3. Verificación JWT compartida

Un proveedor compartido de autenticación inyecta JwtService y ConfigService. `verifyAsync` recibe `secret: JWT_SECRET`, `issuer: JWT_ISSUER` y `audience: JWT_AUDIENCE` cuando estén configurados, además de algoritmo permitido HS256 para la integración de secreto compartido. No aceptar algoritmo none, no ignorar expiración y rechazar `sub` ausente/no string/vacío. Secret faltante no puede habilitar un fallback permisivo.

JwtAuthGuard extrae únicamente `Bearer <token>` y asigna `request.user = { sub, email?, role? }`; internamente el verificador también puede retornar `name` para WS. El gateway valida `client.handshake.auth.token`, guarda `client.data.user = { sub, name? }` y desconecta un handshake inválido. Cada handler exige identidad validada; puede revalidar vigencia para conexiones de larga duración. Sin secretos escritos en repositorio. README documenta que el Auth Service deberá usar secret/issuer/audience compatibles; AUTH_SERVICE_URL es documentación de integración, no un introspector obligatorio.

Alternativa descartada: decodificar sin verificar o confiar en localStorage para autorizar al host.

### 4. Estado en memoria, ownership y coherencia persistida

Extender ActiveSession con hostId, quizId, createdAt, startedAt opcional y status. Conservar hostSocketId y mapas legacy de respuestas/puntajes sin desarrollar sus funciones. status es fuente de verdad del Punto 3; phase legacy, si se mantiene, se deriva y actualiza de forma coherente. Cada player se indexa por userId, con nombre, connected y referencia(s) de conexión; los campos legacy id/score se conservan sin cálculo de puntaje.

`createSession(hostId, quizId)` verifica `findOneByOwner` y devuelve ForbiddenException para quiz ajeno o ausente. Reserva un PIN único de seis dígitos en memoria y BD; la restricción unique también evita reutilizar códigos de registros históricos. Si hay colisión persistida reintenta de forma acotada; si falla la escritura retira solo su reserva de memoria y falla sin dejar sala fantasma. Host se registra una vez como participante al crear, inicialmente sin presencia WS. Así la prueba host+player devuelve dos usuarios.

`addPlayer(pin, { userId, name, socketId? })` devuelve `{ added, player }`, sin duplicación, actualizando la conexión si corresponde y preservando datos. REST no marca presencia WS por sí solo. La comprobación de identidad existente antecede al rechazo por fase: reconectar un participante de IN_PROGRESS es válido, incorporar uno nuevo no. FINISHED rechaza uniones. `removePlayer(pin, userId)` elimina en LOBBY o marca disconnected en IN_PROGRESS; el gateway solo lo llama cuando ya no queda una conexión vigente. `listPlayers` proyecta DTOs sin Maps, score, answers ni sockets.

`SessionManager.startSession(pin, hostId)` aplica ForbiddenException si no es host y BadRequestException si no está en LOBBY. GameSessionService serializa la operación por sala, verifica permisos y ejecuta la actualización condicional persistida de LOBBY a IN_PROGRESS antes de publicar el estado definitivo en memoria. Un solo timestamp se comparte con BD y respuesta/evento. Una falla persistida no deja IN_PROGRESS en memoria. Las solicitudes paralelas REST/WS no duplican transición ni evento.

`GameSessionService.removeSession` prepara la transición a FINISHED con finishedAt persistido antes de retirar memoria y actualizar métrica; no exponer un endpoint de fin ni desarrollar Punto 5. El removeSession existente de SessionManager queda como operación interna de memoria; futuros consumidores deben usar la operación persistida del service, no saltarla. Mantener submitAnswer existente sin extenderlo o sustituirlo por NotImplementedException documentada; no publicar un handler answer nuevo.

Alternativa descartada: mover todo el lobby a BD/distribuirlo agrega un alcance innecesario. Persistir solamente el registro de sesión no equivale a restaurar mapas de jugadores al reiniciar.

### 5. Contratos HTTP y validación local

Endpoints bajo `/kahoot-api`, con `@UseGuards(JwtAuthGuard)`. Registrar `available-quizzes` antes de `:roomCode` para evitar que se interprete como PIN. Añadir DTOs class-validator para create (quizId UUID), roomCode (`^\d{6}$`) y join (name opcional string no vacío con límite de longitud razonable), usando ValidationPipe local con whitelist y rechazo de campos no autorizados en este controller y handlers WS; no cambiar validación de quizzes.

| Método y ruta relativa | Body | Respuesta |
| --- | --- | --- |
| GET /game-sessions/available-quizzes | — | 200 `[{ id, title }]` |
| POST /game-sessions | `{ quizId }` | 201 `{ sessionId, roomCode, status, hostId, quizId }` |
| GET /game-sessions/:roomCode | — | 200 snapshot con participants y startedAt opcional |
| GET /game-sessions/:roomCode/participants | — | 200 `[{ userId, name, connected }]` |
| POST /game-sessions/:roomCode/join | `{ name? }` | 201 `{ added, player: { userId, name, connected } }` |
| POST /game-sessions/:roomCode/start | — | 200 sesión con startedAt y status IN_PROGRESS |

sessionId público es PIN, no el UUID interno persistido. GET snapshot/listado requiere auth como se solicitó; no se añade restricción de membresía no solicitada. Nunca retornar preguntas/respuestas ni la entidad TypeORM completa en estos DTOs. Snapshot `participants` usa el mismo DTO que el listado. 401 para autenticación, 403 para ownership/no-host, 404 sala no encontrada, 400 validación/fase.

Conservar el sobre de errores HTTP existente; el frontend extrae mensajes de `error` sea string, objeto Nest o array de validación. `docs/openapi.json` se actualizará aditivamente durante apply con estas rutas, seguridad y schemas, sin modificar contratos de quizzes/results.

### 6. Socket.IO y notificaciones comunes a ambos transportes

Gateway con `@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }, namespace: '/game' })`, `@WebSocketServer`, OnGatewayConnection/Disconnect y `@SubscribeMessage`. Añadir un publicador interno desacoplado del gateway que reciba eventos del service y use el Server del namespace para emitir a `server.to(roomCode)`; el service no depende del gateway. Esto permite que una mutación REST notifique exactamente igual que una WS y evita dependencia circular. El handler WS envía solo el snapshot directo y no duplica las notificaciones ya publicadas por el service.

Tras join correcto, esperar `socket.join(roomCode)` y enviar snapshot al socket. Si la notificación común ocurrió antes de completar la suscripción, el socket nuevo obtiene el estado por su snapshot; los observadores ya suscritos reciben el evento. Registrar roomCode/conexiones en client.data. No añadir a sala alguna ante errores. Al cambiar de sala, abandonar la anterior y ajustar presencia para que no queden suscripciones cruzadas. Al desconectar, procesar solo las membresías registradas y no retirar conexiones nuevas de la misma identidad.

| Evento | Dirección | Payload | Auth |
| --- | --- | --- | --- |
| join-session | cliente → server | `{ roomCode: string }` | JWT handshake `auth.token` |
| session-state | server → socket | `{ sessionId, roomCode, status, hostId, quizId, participants: [{ userId, name, connected }], startedAt? }` | socket autenticado |
| participants-updated | server → sala | `{ participants: [{ userId, name, connected }] }` | miembros del room |
| start-session | cliente → server | `{ roomCode }` | JWT + sub === hostId |
| session-started | server → sala | `{ sessionId, startedAt }` | miembros del room |
| error | server → socket | `{ code: string, message: string }` | error de operación del socket |

Errores WS estables: UNAUTHENTICATED, INVALID_ROOM_CODE, SESSION_NOT_FOUND, SESSION_ALREADY_STARTED (nuevos joins), INVALID_SESSION_STATUS (start), FORBIDDEN e INTERNAL_ERROR sin detalles sensibles. No usar el filtro HTTP para contextos WS; manejar excepciones con un filtro WS o captura explícita. Toda emisión de aplicación usa `server.to(roomCode)` o `server.to(socketId)`, jamás `server.emit` global ni `client.emit` si se exige uniformidad de destino.

Alternativa descartada: emitir solo desde los handlers WS dejaría invisibles las mutaciones REST; broadcast global rompería aislamiento.

### 7. Frontend y contrato local de autenticación

Implementar la estructura pedida en el frontend hermano:

```text
src/main.tsx, App.tsx
src/api/http.ts, gameSessions.ts
src/realtime/socket.ts
src/auth/AuthContext.tsx, ProtectedRoute.tsx
src/pages/HostCreateSessionPage.tsx, HostLobbyPage.tsx
src/pages/JoinSessionPage.tsx, PlayerLobbyPage.tsx
src/components/RoomCodeBadge.tsx, ParticipantList.tsx, ErrorBanner.tsx
```

Rutas protegidas propuestas: `/host/create`, `/host/lobby/:roomCode`, `/join`, `/play/lobby/:roomCode`. `/login` es un punto de integración con aviso temporal, no un formulario nuevo. AuthProvider usa claves locales documentadas `token` y `user` y expone actualización/cierre de sesión al compañero; puede extraer claims para presentación, nunca como autorización. El guard backend sigue siendo la autoridad. Logout desconecta el socket y retira credenciales. Ante 401, limpiar auth/redirigir.

`http.ts` usa axios y Bearer desde localStorage, con base `${VITE_API_URL}/kahoot-api` normalizada. `.env.example` conserva `VITE_API_URL=http://localhost:3000` y `VITE_WS_URL=http://localhost:3000`. gameSessions.ts expone createGameSession, getSession, listParticipants, joinSession, startSession y listAvailableQuizzes. No usar GET /quizzes para el selector.

Socket singleton con conexión manual a `${VITE_WS_URL}/game`, `auth: { token }`, reconexión y renovación del auth antes de conectar. Al entrar en lobby cargar snapshot/lista inicial, instalar listeners y emitir join tras cada connect; usar snapshot autoritativo y no sobreescribir un IN_PROGRESS recién recibido con una respuesta GET antigua. Limpiar listeners con sus funciones específicas y desconectar/abandonar al salir; un único componente de lobby tiene propiedad de la suscripción. Host y player reaccionan a session-started y al estado IN_PROGRESS recuperado, sin navegar a un juego no implementado.

HostCreateSessionPage carga exclusivamente listAvailableQuizzes y valida selección con zod. HostLobbyPage muestra RoomCodeBadge, ParticipantList y botón grande de inicio REST (para mostrar errores HTTP), deshabilitado si no hay otro jugador conectado, ya inició o hay solicitud pendiente. Player se une por formulario y ve En lobby / Partida en curso en su ruta, sin navegar al Punto 4. Formularios con labels, zod para código/selección, botones táctiles de al menos 48px y diseño mobile-first. ErrorBanner traduce código inválido, 404, fase, 401 y ownership/host prohibido, sin mostrar JSON crudo ni stacks.

### 8. Hooks OTel no bloqueantes

Añadir `src/tracing.ts` con `getTracer(name)` y `getMeter(name)` y API mínima compatible: startActiveSpan/span.end/recordException/setStatus, createCounter/add, createGauge/record y createHistogram/record. Sin endpoint, todo es no-op; con endpoint definido el stub sigue siendo seguro/no bloqueante y no afirma exportar telemetría: el compañero sustituirá el archivo por el SDK real. `import './tracing'` es la primera línea de main, antes de imports Nest.

En service, spans createSession/joinSession/startSession con cierre garantizado incluso ante error. Métricas: gauge sessions_active (actualizar al crear/remover), histogram participants_per_session (registrar tras cambios de lista/presencia) y counter ws_events_total con label event=join|start|disconnect, sin answer. Contar operaciones WS, no REST, para que el nombre sea veraz. No registrar JWT/secret ni bloquear funcionalidades por errores del stub.

### 9. Configuración, pruebas y documentación

Backend `.env.example` y environment de `api` en Compose agregan JWT_ISSUER, JWT_AUDIENCE, AUTH_SERVICE_URL si falta, OTEL_SERVICE_NAME=kahoot-game-session y OTEL_EXPORTER_OTLP_ENDPOINT vacío. Reenviar CORS_ORIGIN si falta para frontend; no cambiar servicios api/postgres, puertos ni volúmenes, ni formato DATABASE_URL. Issuer/audience de ejemplo se documentan y los tokens de demo los deben usar. No incorporar secretos reales.

Unit tests usan repositorios/verificador/publicador mockeados y manager real cuando se comprueba idempotencia/aislamiento. E2E de HTTP y WS levantan un Nest TestingModule con controller, gateway, service, verificador JWT real y manager real, más repositorios en memoria controlados; firman tokens de test y escuchan en puerto efímero, sin depender del Auth Service o seed manual. Un test de integración de persistencia opcional y documentado con Postgres dedicado verifica que las entidades se guardan/actualizan realmente; no llamar e2e de base de datos a tests que mockean repositorios. Adaptar el e2e de AppController para probar su módulo ligero y evitar una dependencia implícita a Postgres al importar AppModule. No modificar results para esto. Cerrar aplicaciones/sockets en afterAll/afterEach y usar promesas de evento con timeouts, no sleeps arbitrarios.

Cobertura obligatoria: ownership rechazado; join repetido; no-host y fase al iniciar; mapas independientes; sin JWT 401; creación propia 201/código; join de otro usuario 201 y dos participantes; inicio no-host 403 y host 200/IN_PROGRESS; WS join/start/session-started. Añadir listado propio sin filtración y sin afectar findAll; JWT inválido/expirado/issuer/audience; códigos inválidos; desconexión/reconexión y ausencia de eventos cruzados; mutaciones REST notifican WS; concurrencia de start y rollback de fallos persistidos.

Ambos README tendrán **Cómo probar el Punto 3**: `docker compose up postgres`, configuración local, `pnpm seed` manual, backend `pnpm start:dev`, frontend `pnpm dev`, placeholder curl contra AUTH_SERVICE_URL y comando Node de generación local JWT con secret compartido y claims sub/issuer/audience/exp. Host `test-host-id`, player con otra identidad; configurar token/user en localStorage en dos perfiles o ventanas con storage separado. Crear/copiar/unirse/ver lista/iniciar/ver evento en ambos; recargar player en LOBBY y tras inicio; crear segunda sala y verificar aislamiento. Explicar `findAllByOwner`/seed y que findAll público sigue mock y queda fuera de alcance. Documentar comandos `pnpm test -- --runInBand` según script efectivo, `pnpm test:e2e`, builds, limitaciones del stub OTel, persistencia y ausencia de login propio. No afirmar que estos comandos se ejecutaron durante propose.

## Risks / Trade-offs

- [Estado duplicado memoria/BD] → Reservar y revertir en creación; serializar inicio por sala y confirmar persistencia antes de publicar; probar fallos. Operación en una sola instancia.
- [Persistir ciclo de vida no persiste presencia] → Documentar que una recarga funciona mientras el proceso vive, pero reiniciar pierde mapas; no rehidratar una sala iniciada vacía ni prometer recuperación distribuida.
- [Host incluido en participantes] → Decisión explícita para el e2e de dos usuarios; excluir al host del mínimo de un jugador del botón.
- [Campos legacy de Question no son el modelo V/F] → Preservarlos opcionales/defaults sin cambiar DTOs; nuevas preguntas del seed usan statement/correctAnswer/order. El CRUD real y su migración contractual pertenecen a quizzes.
- [Compose fuerza NODE_ENV=production y esquema aún no existe] → Para demo levantar solo postgres y ejecutar backend/seed local en development. Producción requiere provisionamiento posterior de esquema; synchronize permanece deshabilitado allí.
- [Auth externo aún desconocido] → Secreto HS256 compartido solo para dev y parámetros consistentes; coordinación futura si el proveedor usa claves públicas, sin relajar verificaciones.
- [Varias pestañas/montajes React duplican sockets] → Singleton, cleanup de listeners, join idempotente y seguimiento de conexiones vigentes; probar desconexión de socket antiguo.
- [JWT en localStorage] → Es el contrato solicitado, expuesto a XSS; no loguear tokens y no usar claims locales como autorización.
- [OTel stub no exporta] → README explícito y contrato reducido para reemplazo; no instalar SDK ni presentar métricas como exportadas.

## Migration Plan

1. Tras aprobación/apply, instalar dependencias y modificar integración mínima de BD/quizzes conservando contratos actuales.
2. Añadir backend, frontend y pruebas por fases de tasks.md; actualizar documentación sin ejecutar seed automáticamente.
3. Verificar tests/builds; comprobar manualmente demo con Postgres y dejar constancia de cualquier validación no ejecutada.
4. Solo con implementación terminada y verificaciones registradas, ejecutar el flujo local opsx-archive para sincronizar las seis specs a `openspec/specs/` y archivar el change bajo `openspec/changes/archive/`; revisar que todos los artefactos quedan listos para incluirse en el PR.
5. Rollback: retirar solo cambios de este change revisados por el usuario, sin borrar trabajo ajeno ni ejecutar eliminaciones amplias. No borrar datos/tablas/volúmenes como parte de rollback automático; respaldar BD antes de aplicar a datos valiosos. En producción no ejecutar synchronize ni seed de demo.
