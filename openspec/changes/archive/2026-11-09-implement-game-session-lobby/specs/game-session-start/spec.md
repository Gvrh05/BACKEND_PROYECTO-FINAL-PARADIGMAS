## Purpose

Iniciar una sala exclusivamente mediante su anfitrión, persistiendo la transición y notificando a todos los participantes de esa sala sin desarrollar el juego posterior.

## ADDED Requirements

### Requirement: Habilitación del botón por identidad de otro jugador
El botón Iniciar partida de HostLobbyPage SHALL habilitarse solo en LOBBY cuando `participants.some(p => p.userId !== hostId && p.connected)`, sin una solicitud de inicio pendiente. El host SHALL figurar en participantes, pero no SHALL habilitar el botón por sí mismo. El criterio SHALL comparar identidades y presencia y no usar `participants.length >= 2` como sustituto. El botón SHALL iniciar por REST para presentar errores HTTP mediante ErrorBanner.

#### Scenario: Solo host y posterior llegada de otro usuario
- **WHEN** el lobby contiene solo al host y después se conecta una identidad distinta
- **THEN** el botón pasa de deshabilitado a habilitado por la existencia del otro jugador, no por el tamaño del arreglo

### Requirement: Inicio exclusivo del anfitrión
`POST /game-sessions/:roomCode/start`, relativo a `/kahoot-api`, SHALL requerir JWT y comparar su `sub` con `hostId`. SHALL responder 403 para un usuario distinto del host, 401 sin JWT válido, 400 para código malformado y 404 para sala inexistente. `start-session { roomCode }` en `/game` SHALL aplicar la misma autorización y responder al socket con `error { code: 'FORBIDDEN', message }` para un no-host.

#### Scenario: REST de un no-host
- **WHEN** otro usuario solicita iniciar una sala LOBBY
- **THEN** recibe 403 y la sala sigue en LOBBY sin notificación de inicio

#### Scenario: WS de un no-host
- **WHEN** un socket autenticado ajeno al host emite `start-session`
- **THEN** solo ese socket recibe FORBIDDEN y no se inicia ninguna sala

### Requirement: Transición única persistida
El inicio SHALL permitir únicamente LOBBY → IN_PROGRESS, fijar `startedAt` una sola vez y persistir ambos campos antes de confirmar éxito. REST SHALL responder 200 `{ sessionId, roomCode, status, hostId, quizId, startedAt }`. Repetir el inicio o iniciarlo en FINISHED SHALL dar REST 400 o WS `error { code: 'INVALID_SESSION_STATUS', message }`. Solicitudes concurrentes no SHALL producir dos transiciones o dos eventos de inicio.

#### Scenario: Inicio correcto
- **WHEN** el host inicia una sala LOBBY
- **THEN** recibe éxito con status IN_PROGRESS y la misma fecha de inicio está guardada en BD

#### Scenario: Inicio repetido o concurrente
- **WHEN** se intenta iniciar más de una vez la misma sala
- **THEN** solo una solicitud efectúa la transición y las demás reciben error de fase sin cambiar la fecha

#### Scenario: Persistencia fallida
- **WHEN** falla la actualización persistida del inicio
- **THEN** la sala no se publica como iniciada y no se emite session-started

### Requirement: Evento de inicio aislado para REST y WS
Tanto el inicio vía REST como WS SHALL emitir exactamente una notificación `session-started { sessionId, startedAt }` a los sockets de la sala afectada; `sessionId` SHALL ser el código y `startedAt` una fecha ISO 8601. Nunca SHALL emitirse globalmente ni a otra sala. Los lobbies del host y jugador SHALL reflejar IN_PROGRESS con el estado visible Partida en curso, sin navegar a un juego del Punto 4 ni implementar preguntas, respuestas, puntajes o clasificación.

#### Scenario: Recepción compartida y aislamiento
- **WHEN** el host inicia A y hay sockets del host y jugador en A y observadores en B
- **THEN** host y jugador en A reciben session-started con el mismo código/fecha y B no recibe el evento

#### Scenario: Inicio desde un botón REST
- **WHEN** el botón del host usa el endpoint REST para iniciar
- **THEN** los jugadores ya suscritos por WS también reciben el evento sin necesitar otra solicitud de inicio
