## 1. Dependencias y configuración base

- [x] 1.1 Instalar dependencias backend compatibles con Nest 11: Config, JWT, TypeORM/pg, WebSockets/Socket.IO y class-validator/class-transformer; añadir socket.io-client para pruebas y actualizar lockfile sin secretos.
- [x] 1.2 Integrar ConfigModule global y DatabaseModule con forRootAsync, DATABASE_URL sin cambiar formato, autoLoadEntities y synchronize solo fuera de production; comprobar que AppModule no crea una segunda conexión.
- [x] 1.3 Añadir JWT_ISSUER, JWT_AUDIENCE, AUTH_SERVICE_URL y variables OTel a `.env.example` y environment de api en Compose; reenviar CORS_ORIGIN si falta sin alterar servicios/volúmenes/puertos existentes.

## 2. Integración mínima autorizada de quizzes

- [x] 2.1 Decorar la clase Quiz existente con tabla quizzes, UUID, title, ownerId, timestamps y relación a Question; conservar nombre y campos actuales.
- [x] 2.2 Decorar Question con tabla questions, UUID, quizId y relación CASCADE, statement, correctAnswer, imageUrl y order; conservar las propiedades legacy con mapeo compatible sin cambiar DTOs.
- [x] 2.3 Registrar Quiz/Question mediante forFeature en QuizzesModule e inyectar el repositorio necesario sin modificar controller ni cuerpos de métodos existentes.
- [x] 2.4 Añadir `findOneByOwner`, `existsAndOwnedBy` y `findAllByOwner` con tipos de retorno equivalentes a QuizEntity y consultas parametrizadas por propietario; comprobar que findAll sigue devolviendo `[]`.
- [x] 2.5 Crear seed.ts y script `pnpm seed` manual/idempotente con ownerId test-host-id, quiz y dos preguntas de UUID estable; asegurar cierre de conexión y no ejecutarlo automáticamente.

## 3. Autenticación compartida

- [x] 3.1 Crear configuración/proveedor compartido de JwtService con verificación de firma HS256, secret/issuer/audience desde ConfigService, expiración y sub válido; fallo cerrado si no hay configuración válida.
- [x] 3.2 Reemplazar guard stub por extracción Bearer y verifyAsync compartido, asignando request.user con sub/email?/role? y devolviendo 401 ante tokens inválidos.
- [x] 3.3 Probar JWT válido, ausente, mal firmado, expirado, sin sub y con issuer/audience incorrectos sin depender del Auth Service.

## 4. Estado y persistencia de sesiones

- [x] 4.1 Crear GameSessionEntity con UUID, PIN unique de seis caracteres, quizId FK lógica, hostId, enum status y timestamps; registrar forFeature y QuizzesModule en GameSessionModule.
- [x] 4.2 Extender ActiveSession y participantes preservando aislamiento de Maps y campos legacy; añadir listPlayers y proyección ParticipantDto sin datos internos.
- [x] 4.3 Implementar addPlayer idempotente por userId, actualización de conexión, removePlayer según fase y control de conexiones vigentes para no retirar un socket reconectado.
- [x] 4.4 Implementar startSession de SessionManager con ForbiddenException para no-host y BadRequestException fuera de LOBBY; conservar coherencia con phase legacy.
- [x] 4.5 Implementar createSession del service con ownership, PIN único en memoria/BD, host participante, persistencia y rollback de reserva ante error o colisión.
- [x] 4.6 Añadir getSessionByCode, joinSession, listParticipants y removePlayer al service; negar nuevos jugadores después del inicio y permitir reconexión de identidades existentes en IN_PROGRESS.
- [x] 4.7 Implementar inicio persistido serializado por sala con actualización condicional, un único startedAt y confirmación en memoria solo al guardar; comprobar solicitudes concurrentes y errores de BD.
- [x] 4.8 Añadir hook removeSession del service que persista FINISHED/finishedAt antes de retirar memoria, sin nuevo flujo de fin; conservar submitAnswer sin ampliarlo o dejar NotImplementedException documentada.

## 5. REST del Punto 3

- [x] 5.1 Crear DTOs con class-validator para quizId UUID, roomCode de seis dígitos, name opcional y respuestas públicas; aplicar validación local sin cambiar contratos de otros módulos.
- [x] 5.2 Crear GameSessionController protegido y registrarlo; añadir POST create, GET snapshot, GET participants, POST join idempotente y POST start con HTTP 200 explícito.
- [x] 5.3 Añadir GET available-quizzes antes de la ruta dinámica, delegando en findAllByOwner con sub verificado y devolviendo solo id/title; no añadir endpoints a quizzes.
- [x] 5.4 Verificar prefijo `/kahoot-api`, códigos de estado y mensajes para autenticación, propiedad, código, sala inexistente y fase; conservar sobre de errores HTTP existente.

## 6. Socket.IO y eventos aislados

- [x] 6.1 Implementar publicador interno sin dependencias circulares para notificaciones de mutaciones REST/WS a la sala exacta, sin emisiones duplicadas.
- [x] 6.2 Decorar gateway con namespace `/game`, CORS solicitado, WebSocketServer y lifecycle; verificar JWT de handshake y desconectar clientes inválidos.
- [x] 6.3 Implementar join-session validado, vinculación room/socket/user, unión Socket.IO, session-state directo y participants-updated compartido; ninguna identidad del payload puede suplantar sub.
- [x] 6.4 Implementar start-session con identidad del handshake, permisos/fase y evento session-started mediante el mismo flujo del service; mapear errores a `{ code, message }` dirigidos al socket.
- [x] 6.5 Implementar disconnect y cambio de sala con ajuste de conexiones/presencia, preservando datos en IN_PROGRESS y eliminando jugadores de LOBBY solo sin conexión vigente.
- [x] 6.6 Auditar que todas las emisiones de aplicación usan server.to(roomCode/socketId), nunca broadcast global; no publicar handler de respuestas/puntajes.

## 7. Hooks de observabilidad

- [x] 7.1 Crear tracing.ts con getTracer/getMeter y APIs no-op compatibles; importar './tracing' como primera línea de main sin instalar SDK/exportador real.
- [x] 7.2 Añadir spans manuales createSession/joinSession/startSession con cierre garantizado y métricas sessions_active, participants_per_session y ws_events_total con eventos join/start/disconnect, sin answer.
- [x] 7.3 Probar que el stub no bloquea operaciones sin endpoint OTel y que no se exportan/loguean JWT ni secretos.

## 8. Base del frontend

- [x] 8.1 En el frontend hermano autorizado, instalar react-router-dom, socket.io-client y zod, reutilizando axios; actualizar lockfile y `.env.example` con VITE_API_URL/VITE_WS_URL localhost:3000.
- [x] 8.2 Implementar AuthContext/AuthProvider con token/user locales, funciones de integración y logout; ProtectedRoute redirige a /login, con aviso de integración y sin formularios login/register. Añadir botones y /dev-login exclusivamente DEV, con JWT HS256 de ejemplo público excluido de producción.
- [x] 8.3 Implementar axios HTTP con Bearer e interpretación del sobre de errores existente; normalizar base URL con prefijo /kahoot-api.
- [x] 8.4 Implementar gameSessions.ts con createGameSession/getSession/listParticipants/joinSession/startSession/listAvailableQuizzes y contratos tipados.
- [x] 8.5 Implementar singleton Socket.IO manual en `${VITE_WS_URL}/game`, auth token, reconexión, cleanup de listeners y desconexión al salir/cambiar identidad.

## 9. Páginas y experiencia de usuario

- [x] 9.1 Configurar Router + AuthProvider en main.tsx y rutas protegidas en App.tsx para las cuatro páginas.
- [x] 9.2 Crear RoomCodeBadge, ParticipantList y ErrorBanner accesibles y responsive; mostrar mensajes claros en rojo y botones táctiles.
- [x] 9.3 Crear HostCreateSessionPage usando exclusivamente available-quizzes para el selector, validación zod y navegación al lobby tras crear; manejar estado vacío y ownership denegado.
- [x] 9.4 Crear HostLobbyPage con código grande, lista viva, snapshot inicial/reconexión y botón iniciar deshabilitado sin otro jugador conectado o fuera de LOBBY; mostrar Partida en curso para IN_PROGRESS sin desarrollar el juego.
- [x] 9.5 Crear JoinSessionPage con código de seis dígitos validado, errores claros y unión REST seguida de navegación al lobby del jugador.
- [x] 9.6 Crear PlayerLobbyPage con En lobby/Partida en curso, recuperación por GET y join-session tras cada connect, sin duplicar participantes ni sobrescribir eventos con un GET antiguo.
- [x] 9.7 Verificar cleanup al cambiar de sala, token actualizado, logout, 401, React StrictMode y diseño mobile-first sin callbacks acumulados.

## 10. Pruebas automatizadas

- [x] 10.1 Crear game-session.service.spec.ts con rechazo de quiz ajeno, unión idempotente, inicio no-host y fuera de LOBBY, fallo persistido y transición única concurrente.
- [x] 10.2 Crear pruebas de SessionManager con dos salas sin compartir players/answers, PINs distintos, presencia al desconectar según fase y reconexión sin duplicados.
- [x] 10.3 Añadir pruebas de consultas por dueño/listado propio y confirmar que findAll público mantiene `[]` sin cambiar controller/DTOs de quizzes.
- [x] 10.4 Crear test/game-session.e2e-spec.ts con Nest TestingModule, supertest, JWT real de prueba, repositorios controlados y prefijo HTTP efectivo; probar sin JWT 401, create 201/código, join 201/dos participantes, no-host 403 y host start 200/IN_PROGRESS.
- [x] 10.5 Ampliar e2e HTTP con available-quizzes por sub, códigos inválidos, inexistentes, ownership ajeno, snapshots y nuevas uniones tras iniciar rechazadas.
- [x] 10.6 Añadir e2e Socket.IO client para handshake válido/inválido, join/session-state, start/session-started en host y jugador, permisos y errores de fase; escuchar puerto efímero y cerrar recursos.
- [x] 10.7 Añadir pruebas WS de desconexión/reconexión, socket antiguo, dos salas sin eventos cruzados y notificaciones REST hacia WS; probar no duplicación del evento de inicio.
- [x] 10.8 Desacoplar el e2e existente de Hello World de una conexión a BD implícita manteniendo su aserción, sin tocar results; documentar separación de e2e con repositorios controlados e integración real.
- [x] 10.9 Preparar comprobación opcional/documentada de persistencia con Postgres dedicado para creación/inicio/finishedAt y esquema, sin ejecutar el seed manual automáticamente ni borrar datos ajenos.

## 11. Documentación y verificación de entrega

- [x] 11.1 Actualizar aditivamente docs/openapi.json con endpoints/schemas/JWT del Punto 3; mantener contratos de quizzes/results y documentar tabla completa de eventos WS.
- [x] 11.2 Añadir Cómo probar el Punto 3 a ambos README con postgres, pnpm seed manual, backend/frontend, JWT local firmado/placeholder curl de Auth, almacenamiento local y dos identidades en perfiles separados.
- [x] 11.3 Documentar explícitamente findAllByOwner y available-quizzes como origen del selector, seed test-host-id como origen de la demo y findAll público todavía mock fuera de alcance.
- [x] 11.4 Documentar pruebas de crear/copiar/unirse/listar/iniciar/session-started, recarga en LOBBY y en IN_PROGRESS, aislamiento de una segunda sala y límites de persistencia/OTel/producción.
- [x] 11.5 Ejecutar pnpm test (modo no-watch) y pnpm test:e2e en backend y registrar resultados; ejecutar pnpm build backend y frontend, resolver fallos dentro del alcance y declarar cualquier prueba manual no realizada.
- [x] 11.6 Revisar archivos cambiados: results/controller/DTOs de quizzes/métodos previos/contratos previos/.gitignore intactos, sin secretos y sin implementación de Puntos 4/5, salvo el hook de ciclo de vida autorizado.

## 12. Cierre OpenSpec después de implementar

- [x] 12.1 Revisar trazabilidad de las seis capabilities, completar solo tareas verificadas y validar el change con openspec validate --strict antes del archivo.
- [x] 12.2 Seguir opsx-archive local al terminar, sincronizar specs finales en openspec/specs/ y archivar bajo openspec/changes/archive/; verificar que artefactos y specs quedan listos para el PR sin afirmar que se publicó uno.
