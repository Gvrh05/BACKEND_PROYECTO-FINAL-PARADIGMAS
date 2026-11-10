# game-session-join Specification

## Purpose

Incorporar participantes autenticados en salas por código con semántica idempotente, sin duplicar identidades ni permitir nuevos jugadores después de comenzar.

## Requirements

### Requirement: Unión REST validada e idempotente
`POST /game-sessions/:roomCode/join` SHALL requerir JWT, código que coincida con `^\d{6}$` y cuerpo `{ name? }` con nombre opcional no vacío al proporcionarlo. SHALL devolver 201 `{ added, player }`, con `player = { userId, name, connected }`. La identidad SHALL proceder de `sub`. La primera unión SHALL añadir; las siguientes SHALL devolver `added=false` sin duplicar ni reiniciar datos del participante. El nombre faltante SHALL usar el claim `name` si existe o un alias seguro. Los paths REST son relativos a `/kahoot-api`.

#### Scenario: Repetición de una unión
- **WHEN** un mismo usuario se une dos veces a una sala LOBBY, incluso mediante REST y después WS
- **THEN** existe un solo participante con su `userId`, la segunda unión indica `added=false` y no se reinician datos existentes

#### Scenario: Identidad suplantada
- **WHEN** una solicitud intenta proporcionar un `userId` diferente al `sub` del JWT
- **THEN** el servidor no usa ese dato para registrar ni modificar otra identidad

### Requirement: Unión WS autenticada
El namespace `/game` SHALL verificar `handshake.auth.token` con las mismas reglas JWT de REST y desconectar el socket inválido. Tras autenticar, `join-session { roomCode }` SHALL unir el socket únicamente a esa sala, devolver `session-state { sessionId, roomCode, status, hostId, quizId, participants }` al socket y notificar `participants-updated { participants }` a esa sala. La identidad SHALL proceder del handshake, no del payload.

#### Scenario: Unión válida por socket
- **WHEN** un socket autenticado emite `join-session` con un código válido en LOBBY
- **THEN** recibe su snapshot y los sockets de esa sala reciben la lista actualizada, sin eventos para otra sala

#### Scenario: Handshake inválido
- **WHEN** un socket conecta sin token o con JWT inválido
- **THEN** se desconecta y no puede unirse ni iniciar salas

### Requirement: Errores y restricciones de fase
Un código con formato inválido SHALL dar REST 400 o WS `error { code: 'INVALID_ROOM_CODE', message }`. Una sala inexistente SHALL dar REST 404 o WS `error { code: 'SESSION_NOT_FOUND', message }`. Un usuario nuevo en IN_PROGRESS o FINISHED SHALL recibir REST 400 o WS `error { code: 'SESSION_ALREADY_STARTED', message }`, sin incorporación ni cambios de fase. Las identidades existentes en IN_PROGRESS SHALL poder reconectar según la capability de reconexión.

#### Scenario: No incorporar jugadores nuevos tras iniciar
- **WHEN** un usuario no registrado intenta entrar a una sala IN_PROGRESS
- **THEN** recibe el error de sala iniciada y la lista y el estado no cambian

#### Scenario: Error visible en UI
- **WHEN** el jugador escribe un código inválido, inexistente o de una sala ya iniciada para él
- **THEN** la página muestra un ErrorBanner rojo específico sin navegar a una sala incorrecta

### Requirement: Interfaz de unión
El formulario SHALL validar seis dígitos conservando el código como string y navegar al lobby del jugador tras una unión correcta. SHALL usar el JWT local y redirigir a `/login` si falta, sin crear un flujo de autenticación nuevo.

#### Scenario: Unión desde móvil
- **WHEN** un jugador autenticado introduce seis dígitos válidos y pulsa Unirse
- **THEN** se incorpora a esa sala y ve la pantalla de espera con controles legibles en móvil
