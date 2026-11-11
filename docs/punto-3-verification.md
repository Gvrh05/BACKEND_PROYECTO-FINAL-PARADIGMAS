# Punto 3 — trazabilidad y verificación

## Capabilities y pruebas

| Capability | Contrato principal | Evidencia automatizada |
| --- | --- | --- |
| game-session-available-quizzes | GET available-quizzes por sub; findAll público intacto | quizzes.service.spec.ts, contracts.spec.ts, game-session.e2e-spec.ts, Edge selector vacío |
| game-session-create | POST propio → 201/LOBBY/PIN único persistido | game-session.service.spec.ts, game-session.e2e-spec.ts, game-session.persistence-spec.ts |
| game-session-join | REST/WS idempotentes por userId; fase válida | session-manager.spec.ts, game-session.e2e-spec.ts, Edge dos perfiles |
| game-session-participants | Lista por sala y presencia WS, sin broadcast global | game-session.events.spec.ts, game-session.e2e-spec.ts, Edge cleanup/StrictMode |
| game-session-start | Solo host; LOBBY → IN_PROGRESS una vez; evento por sala | service unit, HTTP/WS e2e, persistencia real, Edge REST→WS |
| game-session-reconnect | GET + rejoin; estado monotónico y conexiones vigentes | manager unit, HTTP/WS e2e, Edge reload/GET atrasado/cambio de sala/401 |

Los nombres de specs corresponden a las seis carpetas de OpenSpec. Los tests
unitarios están bajo src/; los e2e/integración bajo
test/. `docs/openapi.json` contiene los seis contratos REST y la extensión
x-websocket para los seis eventos, manteniendo intactos quizzes/results previos.

## Capas de prueba, sin confundir mocks con persistencia

- `pnpm test -- --runInBand`: 54 pruebas unitarias/configuración/contratos;
  repositorios controlados y metadatos sin conexión.
- `pnpm test:e2e`: 19 pruebas HTTP/Socket.IO con JWT y servicios reales, pero
  repositorios controlados. Hello World no importa AppModule. Se verificó la
  suite con DATABASE_URL apuntando deliberadamente al puerto 1, inaccesible.
- `pnpm test:persistence`: 5 pruebas de repositorios/TypeORM y ciclo de vida en
  Postgres real, BD local kahoot_punto3_test, esquema aleatorio propio. No se usa
  el seed; solo se elimina el esquema creado por esa ejecución, no public ni datos
  de kahoot_db. Se conserva la BD de pruebas para ejecuciones posteriores.
- `node scripts/verify-phase-b-rest.cjs` y `node scripts/verify-phase-b-ws.cjs`:
  verificación manual con aplicación y BD reales, sin mocks. No se ejecutan
  automáticamente ni limpian registros de desarrollo.
- Desde el frontend, `node scripts/verify-phase-c.cjs`: Edge instalado/CDP nativo,
  dos perfiles, 320px y Postgres real. Comprueba identidad/presencia, StrictMode,
  cambio de sala, logout/401 y GET atrasados. Nunca ejecuta pnpm seed.
- Desde el frontend, `pnpm build`, `pnpm lint`, `pnpm verify:production`:
  compilación/tipos, lint y regresión de artefactos DEV ONLY.

## Corrección de producción

La instrucción del seed y ownerId del estado vacío es exclusiva de DEV. En
producción se muestra "No hay cuestionarios disponibles. Contacta al administrador.".
verify:production recorre todos los assets JS y rechaza test-host-id,
test-player-id, pnpm seed, dev-login, DEV ONLY y la clave pública de demo.
El aviso genérico debe estar presente. El mismo control se ejecuta antes de Edge.

## Revisión de límites

- No se modifican results, controller/DTOs de quizzes ni sus cuatro métodos
  originales. Consultas por propietario son aditivas y el endpoint es de game-sessions.
- HS256 y firma frontend solo para demo; producción no contiene firma de demo.
  Auth Service y SDK OTel reales quedan al compañero correspondiente.
- No se desarrollan respuestas/puntajes/clasificación. removeSession solo prepara
  persistencia FINISHED/finishedAt para el Punto 5; no agrega un flujo de resultados.
- La BD conserva ciclo de vida, no mapas de presencia tras reiniciar procesos.
- Las salas de verificación dev se conservan deliberadamente (ver README).
- No se publica ni se afirma haber creado un PR: se entregan código, contratos,
  pruebas y artefactos OpenSpec para que se incluyan en él.
