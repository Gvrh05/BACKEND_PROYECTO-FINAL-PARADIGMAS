## Purpose

Crear sesiones persistidas con cuestionarios del anfitrión y códigos de seis dígitos, manteniendo identidad, participantes y resultados aislados por sala.

## ADDED Requirements

### Requirement: Autenticación e identidad verificadas
Todos los endpoints de game-sessions SHALL requerir un Bearer JWT válido con `sub` no vacío. La identidad SHALL proceder exclusivamente de claims verificados mediante firma, expiración y restricciones de issuer/audience configuradas, nunca de un `hostId` o `userId` enviado por el cliente.

#### Scenario: Creación sin autenticación
- **WHEN** se solicita `POST /game-sessions` sin JWT válido
- **THEN** el servidor responde 401 y no crea ninguna sala en memoria ni en BD

### Requirement: Creación exclusiva para un quiz propio
`POST /game-sessions` SHALL aceptar `{ quizId }`, validar un identificador UUID no vacío y comprobar existencia y ownership. SHALL responder 201 `{ sessionId, roomCode, status, hostId, quizId }`, con `sessionId = roomCode`, `status = 'LOBBY'` y host derivado del JWT. Un quiz inexistente o ajeno SHALL producir 403 sin crear sala; una entrada inválida SHALL producir 400. Todos los paths son relativos a `/kahoot-api`.

#### Scenario: Quiz de otro dueño o inexistente
- **WHEN** un host intenta crear una sala para un quiz que no existe o no le pertenece
- **THEN** recibe 403 y no se alteran salas ni registros persistidos

#### Scenario: Creación válida
- **WHEN** el host crea una sala con su quiz válido
- **THEN** recibe 201 con código de seis dígitos, identidad del host y estado LOBBY, y existe un registro persistido con esos datos y fecha de creación

#### Scenario: Identificador inválido
- **WHEN** `quizId` está vacío o no tiene formato UUID
- **THEN** recibe 400 sin crear una sesión

### Requirement: PIN único y estado aislado
Cada sala SHALL tener PIN de seis dígitos único en memoria y persistencia. Cada sala SHALL mantener sus propias colecciones de participantes y datos de juego, sin mezclar resultados ni implementar cálculo de resultados en este change. La creación SHALL registrar al host una sola vez como participante, para que host más un jugador produzcan dos participantes; no SHALL producir un inicio ni un broadcast global.

#### Scenario: Salas independientes
- **WHEN** el host crea dos salas y un jugador entra en la primera
- **THEN** los códigos son distintos y el jugador no aparece en la segunda ni altera sus datos

#### Scenario: Colisión de código
- **WHEN** un código candidato ya existe en una sala o registro persistido
- **THEN** se genera otro sin sobreescribir la sesión anterior

#### Scenario: Error de persistencia
- **WHEN** falla la escritura al crear una sala
- **THEN** la solicitud falla sin publicar una sala utilizable que no esté persistida

### Requirement: Interfaz de creación autenticada
La pantalla del host SHALL mostrar sus quizzes disponibles, un botón grande para crear y un mensaje rojo ante error de ownership, autenticación o servidor. SHALL redirigir a `/login` si falta el token, sin implementar login/register. Tras crear SHALL navegar al lobby del host y mostrar un código legible en móvil.

#### Scenario: Navegación al lobby
- **WHEN** se crea una sala desde un quiz seleccionado
- **THEN** el host ve el código retornado y el lobby correspondiente a esa sala

### Requirement: Identificación de demo exclusiva de desarrollo
Solo en modo DEV el frontend SHALL ofrecer `/dev-login` y dos botones en el placeholder `/login` para generar JWT HS256 client-side de test-host-id/test-player-id con una clave pública de ejemplo claramente marcada DEV ONLY. SHALL guardar token/user en localStorage, sin formulario de contraseña, sin integrar el Auth Service ni usar secretos reales en el frontend. Producción SHALL excluir ruta, botones, módulo de firma y clave de demo; `/login` SHALL conservar únicamente el aviso de integración pendiente.

#### Scenario: Dos identidades de demo
- **WHEN** dos perfiles de navegador en modo DEV eligen respectivamente host y player
- **THEN** cada perfil guarda su JWT/user y accede a crear o unirse sin ejecutar un script Node

#### Scenario: Build de producción
- **WHEN** se ejecuta pnpm build
- **THEN** el bundle no contiene la ruta dev-login, la clave pública de ejemplo, los IDs de demo ni las instrucciones del seed, y no permite generar JWT de demo
