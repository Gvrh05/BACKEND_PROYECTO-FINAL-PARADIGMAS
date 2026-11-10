## Purpose

Permitir observar la presencia de los participantes de cada sala en tiempo real y gestionar desconexiones sin perder participantes de partidas iniciadas.

## ADDED Requirements

### Requirement: Listado de participantes por sala
`GET /game-sessions/:roomCode/participants`, relativo a `/kahoot-api`, SHALL requerir JWT y responder 200 `ParticipantDto[]` con elementos `{ userId, name, connected }`, sin tokens, socket IDs, respuestas ni puntajes. SHALL validar código de seis dígitos, devolver 400 para formato inválido y 404 si no existe la sala. No SHALL listar participantes de otras salas ni cambiar la fase.

#### Scenario: Host más jugador
- **WHEN** se crea una sala y otro usuario se une
- **THEN** el listado devuelve exactamente dos identidades, host y jugador, sin duplicados

#### Scenario: Consulta sin token
- **WHEN** se consulta el listado sin JWT válido
- **THEN** el servidor responde 401 sin divulgar participantes

### Requirement: Notificaciones aisladas de presencia
Toda unión o desconexión que cambie presencia SHALL producir `participants-updated { participants: [{ userId, name, connected }] }` exclusivamente a los sockets de la sala afectada. Los lobbies SHALL actualizar su lista desde ese evento; las mutaciones REST también SHALL reflejarse en sockets ya suscritos. Las emisiones SHALL dirigirse a una sala o socket concreto, nunca a un broadcast global.

#### Scenario: Dos salas conectadas
- **WHEN** hay observadores en A y B y un usuario se une o desconecta de A
- **THEN** solo A recibe su actualización y B conserva su lista y no recibe ese evento

### Requirement: Desconexión según fase y conexiones vigentes
Al desconectar la última conexión vigente de un participante, el sistema SHALL retirarlo si la sala está en LOBBY y SHALL conservarlo con `connected=false` si está IN_PROGRESS. Desconectar un socket antiguo no SHALL retirar ni marcar offline una identidad que ya tiene otra conexión vigente. `connected` SHALL indicar presencia WS, no simplemente una llamada REST. La eliminación de presencia no SHALL iniciar ni finalizar partidas.

#### Scenario: Salida durante lobby
- **WHEN** se desconecta la última conexión de un jugador en LOBBY
- **THEN** deja de aparecer y la sala recibe la lista restante

#### Scenario: Salida después de iniciar
- **WHEN** se desconecta la última conexión de un jugador en IN_PROGRESS
- **THEN** permanece en la lista con `connected=false` y conserva sus datos

#### Scenario: Socket reemplazado
- **WHEN** un socket antiguo se desconecta después de que la misma identidad haya reconectado
- **THEN** la identidad permanece presente mediante su conexión vigente sin duplicados

### Requirement: Lobby del host actualizado
El lobby del host SHALL mostrar código grande y lista de participantes en vivo. El botón Iniciar partida SHALL estar habilitado únicamente en LOBBY con al menos un jugador conectado adicional al host (`userId !== hostId && connected`); el host registrado no SHALL satisfacer por sí solo ese requisito de UI.

#### Scenario: Host solo y llegada de jugador
- **WHEN** el host está solo y después se incorpora otro participante
- **THEN** el botón pasa de deshabilitado a habilitado y la lista refleja ambas identidades
