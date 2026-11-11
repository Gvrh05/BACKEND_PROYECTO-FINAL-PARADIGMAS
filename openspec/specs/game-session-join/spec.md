# game-session-join Specification

## Purpose

Incorporar participantes autenticados en salas por código con semántica idempotente, sin duplicar identidades ni permitir nuevos jugadores después de comenzar.

## Requirements

### Requirement: Unión REST validada e idempotente
`POST /kahoot-api/game-sessions/:roomCode/join` SHALL requerir JWT y un PIN de seis dígitos. La identidad SHALL proceder de `sub`. El nombre opcional SHALL ser válido o se usará el nombre del perfil o un alias. La ruta SHALL devolver 201 con `{ added, player }` sin duplicar la identidad.

#### Scenario: Contrato de unión
- **WHEN** el jugador envía un PIN y credenciales válidas
- **THEN** `player` contiene `userId`, `name` y `connected`

#### Scenario: Repetición de una unión
- **WHEN** un mismo usuario se une dos veces a una sala LOBBY, incluso mediante REST y después WS
- **THEN** existe un solo participante con su `userId`, la segunda unión indica `added=false` y no se reinician datos existentes

#### Scenario: Identidad suplantada
- **WHEN** una solicitud intenta proporcionar un `userId` diferente al `sub` del JWT
- **THEN** el servidor no usa ese dato para registrar ni modificar otra identidad

### Requirement: Unión WS autenticada
El namespace `/game` SHALL aceptar un token de cuenta válido o una credencial temporal de invitado. `join-session { roomCode }` SHALL usar la identidad del handshake, unir el socket a la sala autorizada y emitir `participants-updated { participants }` en esa sala.

#### Scenario: Snapshot del invitado
- **WHEN** un invitado autenticado se suscribe a su sala
- **THEN** el snapshot omite `hostId`, `quizId` y la respuesta correcta antes del cierre

#### Scenario: Unión válida por socket
- **WHEN** un socket autenticado emite `join-session` con un código válido en LOBBY
- **THEN** recibe su snapshot y los sockets de esa sala reciben la lista actualizada, sin eventos para otra sala

#### Scenario: Handshake inválido
- **WHEN** un socket conecta sin credencial, con credencial inválida o con token y guestToken simultáneos
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
El flujo manual autenticado SHALL validar seis dígitos conservando el código como string. El flujo público `/join/:invitationId` SHALL permitir entrar sin JWT de cuenta pidiendo solo un nombre y guardando la credencial temporal por invitación en sessionStorage.

#### Scenario: Unión desde móvil
- **WHEN** un jugador autenticado introduce seis dígitos válidos y pulsa Unirse
- **THEN** se incorpora a esa sala y ve la pantalla de espera con controles legibles en móvil
