# Reconexión a una partida

## MODIFIED Requirements

### Requirement: Snapshot autenticado de sesión
`GET /game-sessions/:roomCode`, relativo a `/kahoot-api`, SHALL requerir JWT y responder 200 con `{ sessionId, roomCode, status, hostId, quizId, participants, startedAt? }`. SHALL dar 400 para código malformado, 404 para sala inexistente y 401 sin JWT válido. La consulta SHALL ser de solo lectura. El estado de juego SHALL incluirse únicamente para el anfitrión o un participante registrado. El snapshot SHALL omitir IDs de socket y datos privados de otros usuarios.

#### Scenario: Recuperación por GET
- **WHEN** un jugador autenticado y registrado recarga una sala iniciada
- **THEN** recibe su estado de ronda y el estado de su propia respuesta junto con el snapshot de sesión

#### Scenario: Consulta de un usuario ajeno a la sala
- **WHEN** una identidad autenticada que no participa consulta el código de una partida activa
- **THEN** obtiene el resumen de sesión sin el estado de ronda ni resultados privados

### Requirement: Resuscripción idempotente por identidad
Tras cada conexión WS autenticada el cliente SHALL reemitir `join-session { roomCode }` y reconstruir su vista desde `session-state`. Una identidad de LOBBY SHALL reincorporarse sin duplicados. En IN_PROGRESS solo el anfitrión o una identidad ya registrada SHALL reconectar, conservando `startedAt`, ronda y respuesta. FINISHED SHALL rechazar nuevas uniones.

#### Scenario: Recarga en lobby
- **WHEN** el jugador recarga mientras la sala sigue en LOBBY
- **THEN** vuelve al mismo lobby y la lista contiene una sola entrada para su identidad

#### Scenario: Recarga tras perder el evento de inicio
- **WHEN** un participante registrado reconecta después de pasar a IN_PROGRESS
- **THEN** ve la ronda vigente aunque no haya recibido session-started

#### Scenario: Reconexión después de responder
- **WHEN** un participante envía una respuesta y reconecta después de perder la confirmación
- **THEN** recupera el estado confirmado o el resultado propio si la ronda cerró y no puede responder otra vez

### Requirement: Snapshot monotónico frente a HTTP atrasado
El cliente SHALL conservar el estado más reciente de cada sala e ignorar snapshots o eventos de juego anteriores, incluidos los que cambiarían una ronda cerrada a activa. Un snapshot LOBBY atrasado no SHALL revertir un IN_PROGRESS observado para la misma sala.

#### Scenario: GET de lobby pendiente al iniciar
- **WHEN** un GET tomó un snapshot LOBBY, luego llega session-started y después se entrega el GET atrasado
- **THEN** la vista sigue en la partida en curso sin reiniciar el estado

#### Scenario: GET de ronda activa pendiente al cerrar
- **WHEN** llega el cierre y luego un snapshot de la misma ronda activa
- **THEN** la vista conserva el cierre, la revelación y los botones deshabilitados
