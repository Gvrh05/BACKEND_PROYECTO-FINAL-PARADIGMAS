# game-session-available-quizzes Specification

## Purpose

Permitir al anfitrión seleccionar sus cuestionarios reales para crear una sala, sin alterar el listado público de quizzes mantenido por otro compañero.

## Requirements

### Requirement: Listado de cuestionarios propios
El sistema SHALL ofrecer `GET /game-sessions/available-quizzes` autenticado, relativo al prefijo HTTP `/kahoot-api`, con respuesta 200 `[{ id, title }]`. SHALL filtrar por la identidad `sub` verificada del JWT, sin aceptar un propietario del cliente y sin exponer preguntas ni respuestas correctas. Esta consulta SHALL ser independiente del estado de las salas y no generar eventos WS ni transiciones de fase.

#### Scenario: Filtrado entre propietarios
- **WHEN** el host A consulta el listado y existen quizzes de A y B
- **THEN** recibe únicamente los identificadores y títulos de A y ningún dato de B

#### Scenario: Sin cuestionarios propios
- **WHEN** una identidad sin quizzes consulta el listado
- **THEN** recibe 200 con `[]` y el selector muestra un estado vacío sin permitir crear; solo en DEV incluye "No hay quizzes. Ejecuta `pnpm seed` en el backend con ownerId=test-host-id.", sin fallback a GET /quizzes

#### Scenario: Estado vacío de producción sin datos de demo
- **WHEN** el catálogo está vacío en producción
- **THEN** muestra "No hay cuestionarios disponibles. Contacta al administrador." y el bundle no incluye IDs de demo ni instrucciones del seed

#### Scenario: Autenticación obligatoria
- **WHEN** se consulta el listado sin JWT válido, con firma inválida, expiración vencida o issuer/audience no coincidentes con la configuración
- **THEN** recibe 401 sin datos del catálogo

### Requirement: Consulta interna aditiva y compatibilidad
El servicio de quizzes SHALL proveer `findAllByOwner(ownerId)` como contrato interno que devuelve todos y solo los quizzes del propietario solicitado. El endpoint de game-sessions SHALL delegar en ese contrato. El listado público existente de quizzes SHALL conservar su comportamiento actual `[]`; no se SHALL cambiar el controller, los DTOs ni los métodos públicos existentes de quizzes como parte de este change.

#### Scenario: Independencia del listado público
- **WHEN** se ejecuta el seed manual y el host `test-host-id` consulta sus quizzes disponibles
- **THEN** el nuevo endpoint devuelve el quiz sembrado mediante la consulta interna mientras `GET /quizzes` sigue devolviendo `[]`

### Requirement: Selector de cuestionario propio
La página de creación SHALL cargar este endpoint con el token local y usar un `id` retornado para crear una sala. Los README de ambos proyectos SHALL explicar que la demo se alimenta mediante el seed con `ownerId='test-host-id'` y la consulta interna `findAllByOwner`, no mediante el listado mock público.

#### Scenario: Demo desde el seed
- **WHEN** un host autenticado como `test-host-id` abre la creación después de ejecutar `pnpm seed`
- **THEN** puede seleccionar el quiz de ejemplo y solicitar la creación de su sala
