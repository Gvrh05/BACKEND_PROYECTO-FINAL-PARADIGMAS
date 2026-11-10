# game-session-reconnect Specification

## Purpose

Recuperar el lobby y la suscripción en vivo después de una recarga o desconexión temporal, conservando identidad y separación entre salas durante la vida del proceso.

## Requirements

### Requirement: Snapshot autenticado de sesión
`GET /game-sessions/:roomCode`, relativo a `/kahoot-api`, SHALL requerir JWT y responder 200 `{ sessionId, roomCode, status, hostId, quizId, participants, startedAt? }`. El código SHALL tener seis dígitos; entradas inválidas SHALL dar 400, salas inexistentes 404 y falta de JWT válido 401. La consulta no SHALL incorporar un participante ni cambiar la fase y no SHALL exponer respuestas, puntajes o identificadores de socket.

#### Scenario: Recuperación por GET
- **WHEN** un jugador autenticado recarga su ruta de lobby con un código existente
- **THEN** recibe el snapshot de esa sala y puede recuperar el estado actual sin usar datos de otras salas

### Requirement: Resuscripción idempotente por identidad
Tras cada conexión WS autenticada el cliente SHALL reemitir `join-session { roomCode }` para su ruta actual, recibir `session-state` y reconstruir su vista. En LOBBY una identidad retirada por desconexión SHALL reincorporarse sin duplicados. En IN_PROGRESS solo una identidad previamente registrada SHALL poder reconectar y recuperar presencia; no SHALL reiniciarse la partida, el `startedAt` ni sus datos existentes. FINISHED SHALL rechazar nuevas uniones sin reiniciar la sala.

#### Scenario: Recarga en lobby
- **WHEN** el jugador recarga mientras la sala sigue en LOBBY
- **THEN** vuelve al mismo lobby y la lista contiene una sola entrada para su identidad

#### Scenario: Recarga tras perder el evento de inicio
- **WHEN** un participante registrado reconecta después de que la sala haya pasado a IN_PROGRESS
- **THEN** su snapshot indica IN_PROGRESS, queda conectado y ve Partida en curso sin navegar, aunque no haya recibido session-started en vivo

### Requirement: Snapshot monotónico frente a HTTP atrasado
El cliente SHALL impedir que un GET sobrescriba el inicio recibido por WS durante al menos los últimos 2 segundos. Un snapshot LOBBY atrasado no SHALL revertir un IN_PROGRESS ya observado para esa misma sala.

#### Scenario: GET de lobby pendiente al iniciar
- **WHEN** un GET tomó un snapshot LOBBY, luego llega session-started y después se entrega el GET atrasado
- **THEN** el lobby sigue mostrando Partida en curso sin navegar ni reiniciar el estado

### Requirement: Ciclo de vida del cliente y errores
El cliente SHALL limpiar listeners y la suscripción a la sala anterior al abandonar una ruta o cambiar de identidad, sin acumular callbacks ni enviar el token anterior después de logout. Sin token SHALL redirigir a `/login`; sala inexistente o finalizada SHALL producir un mensaje claro. La reconexión cubierta es a un proceso backend aún activo; no SHALL prometer restauración de participantes tras reiniciar el servidor.

#### Scenario: Cambio de sala
- **WHEN** un usuario navega del lobby A al lobby B
- **THEN** deja de procesar eventos de A y solo muestra estado y participantes de B

#### Scenario: Token ausente después de recargar
- **WHEN** se abre una ruta protegida sin token local
- **THEN** se redirige a `/login` sin implementar un formulario de autenticación como parte del Punto 3
