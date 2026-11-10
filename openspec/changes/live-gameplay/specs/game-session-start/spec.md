# Inicio de partida

## MODIFIED Requirements

### Requirement: Transición única persistida
El inicio SHALL permitir únicamente LOBBY → IN_PROGRESS, fijar `startedAt` una sola vez y persistir ambos campos antes de confirmar éxito. REST SHALL responder 200 `{ sessionId, roomCode, status, hostId, quizId, startedAt }`. Repetir el inicio o iniciarlo en FINISHED SHALL dar REST 400 o WS `error { code: 'INVALID_SESSION_STATUS', message }`. Solicitudes concurrentes no SHALL producir dos transiciones o dos eventos de inicio. El inicio exitoso SHALL fijar un cuestionario elegible y abrir su primera ronda como parte de la transición.

#### Scenario: Inicio correcto
- **WHEN** el host inicia una sala LOBBY con un cuestionario elegible
- **THEN** recibe éxito con status IN_PROGRESS y la misma fecha de inicio está guardada en BD
- **AND** el estado de juego contiene la primera pregunta activa

#### Scenario: Inicio repetido o concurrente
- **WHEN** se intenta iniciar más de una vez la misma sala
- **THEN** solo una solicitud efectúa la transición y las demás reciben error de fase sin cambiar la fecha ni abrir otra ronda

#### Scenario: Persistencia fallida
- **WHEN** falla la actualización persistida del inicio
- **THEN** la sala no se publica como iniciada y no se emite session-started ni se abre la primera ronda

### Requirement: Evento de inicio aislado para REST y WS
Tanto el inicio vía REST como WS SHALL emitir exactamente una notificación `session-started { sessionId, startedAt }` a los sockets de la sala afectada. `sessionId` SHALL ser el código y `startedAt` una fecha ISO 8601. Nunca SHALL emitirse globalmente ni a otra sala. Los lobbies del host y jugador SHALL reflejar IN_PROGRESS y mostrar la primera ronda del Punto 4 para su rol.

#### Scenario: Recepción compartida y aislamiento
- **WHEN** el host inicia A y hay sockets del host y jugador en A y observadores en B
- **THEN** host y jugador en A reciben session-started con el mismo código y fecha y pueden ver la pregunta activa
- **AND** B no recibe los eventos

#### Scenario: Inicio desde un botón REST
- **WHEN** el botón del host usa el endpoint REST para iniciar
- **THEN** los jugadores ya suscritos por WS reciben el evento y el estado de ronda sin necesitar otra solicitud de inicio
