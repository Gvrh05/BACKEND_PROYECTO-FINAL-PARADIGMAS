# Fase B — REST, Socket.IO y e2e

Change: `implement-game-session-lobby`. Implementadas las tareas 5.1–5.4,
6.1–6.6 y 10.4–10.7, en ese orden, después de aprobar Fase A.
Progreso: 36/61 tareas completas; 25 pendientes. Pausa antes de Fase C.

## Comprobaciones de alcance

- La comprobación solicitada de `tasks.md` devuelve vacío:

  ```powershell
  Get-Content openspec/changes/implement-game-session-lobby/tasks.md |
    Select-String "^- \[.\]" | Group-Object | Where-Object { $_.Count -gt 1 }
  ```

- Control adicional por número de tarea (independiente de `[ ]`/`[x]`): 61 IDs
  únicos. Los checkboxes se actualizaron individualmente y se consultó el progreso
  de apply después de cada actualización.
- SHA256: 10/10 archivos protegidos de results y controller/DTOs de quizzes
  intactos; comparación de cuerpos AST: 4/4 métodos existentes de quizzes intactos.
- Se conserva HS256 y el TODO RS256/JWKS de Fase A. No se modificó `.env`, el
  esquema, nombres camelCase de columnas ni la integración del Auth Service.
- No se ejecutó `pnpm seed` ni la función seed. El quiz previamente sembrado por
  el usuario fue consultado y usado sin alterarlo.
- No se inició Fase C: sin frontend, botón UI ni hooks OTel nuevos.
- Gateway ya no expone los handlers legacy de join anónimo ni submitAnswer.
  No se añadió ninguna lógica de respuestas, puntajes ni clasificación.

## REST manual, antes de implementar WS

Comando: `node scripts/verify-phase-b-rest.cjs`, después de `pnpm build`.

El script carga la configuración local sin imprimir secretos, comprueba el quiz
de demo mediante `pg`, arranca `dist/main.js` con AppModule real en un puerto
efímero libre (sin reemplazar el servidor del usuario), genera JWT HS256 de 5 min
en memoria y ejecuta los cinco requests con `curl.exe`. Usa el prefijo completo
`/kahoot-api`; los paths impresos son relativos a ese prefijo. Sin mocks.

Salida real de la última ejecución REST (exit 0):

```text
Postgres real: localhost:5432; quiz del seed presente; sin mocks ni ejecución de seed.
POST /game-sessions
{"sessionId":"157464","roomCode":"157464","status":"LOBBY","hostId":"test-host-id","quizId":"7ac9810a-b36c-4c85-8b58-b296434f0110"}
HTTP_STATUS:201
GET /game-sessions/available-quizzes
[{"id":"7ac9810a-b36c-4c85-8b58-b296434f0110","title":"Demo Punto 3: Verdadero / Falso"}]
HTTP_STATUS:200
POST /game-sessions/157464/join
{"added":true,"player":{"userId":"phase-b-rest-player","name":"Player curl","connected":false}}
HTTP_STATUS:201
POST /game-sessions/157464/start
{"sessionId":"157464","roomCode":"157464","status":"IN_PROGRESS","hostId":"test-host-id","quizId":"7ac9810a-b36c-4c85-8b58-b296434f0110","startedAt":"2026-11-09T20:36:36.799Z"}
HTTP_STATUS:200
POST /game-sessions/157464/start
{"statusCode":403,"timestamp":"2026-11-09T20:36:36.895Z","path":"/kahoot-api/game-sessions/157464/start","error":{"message":"Solo el anfitrión puede iniciar la partida","error":"Forbidden","statusCode":403}}
HTTP_STATUS:403
BD confirmada: {"roomCode":"157464","status":"IN_PROGRESS","startedAt":"2026-11-09T20:36:36.799Z"}
Errores REST confirmados: sin JWT 401; quiz ajeno 403; código inválido 400; sala inexistente 404; inicio repetido 400.
```

La última línea corresponde a requests adicionales por fetch con assertions
de código/sobre de error, sin repetir ni ocultar las cinco salidas curl.
`connected=false` en el join REST es correcto: presencia implica un socket WS.

## WS manual, después de completar REST

Comando: `node scripts/verify-phase-b-ws.cjs`, después de compilar el gateway.

Usa `socket.io-client` contra el namespace `/game` del mismo backend real y un
nuevo proceso temporal con puerto libre. Crea la sala mediante REST con el quiz
del seed; conecta host/jugador con JWT, hace join, verifica que el no-host recibe
FORBIDDEN, inicia con el host y comprueba el evento en ambos. Consulta después
la fila real de Postgres para comparar status/startedAt.

Salida real (exit 0):

```text
Postgres real: localhost:5432; quiz del seed presente; sin mocks ni ejecución de seed.
Sala WS creada por REST: 981597
host: connect /game con JWT HS256
host: session-state {"sessionId":"981597","roomCode":"981597","status":"LOBBY","hostId":"test-host-id","quizId":"7ac9810a-b36c-4c85-8b58-b296434f0110","participants":[{"userId":"test-host-id","name":"Anfitrión","connected":true}]}
player: connect /game con JWT HS256
player: session-state {"sessionId":"981597","roomCode":"981597","status":"LOBBY","hostId":"test-host-id","quizId":"7ac9810a-b36c-4c85-8b58-b296434f0110","participants":[{"userId":"test-host-id","name":"Anfitrión","connected":true},{"userId":"phase-b-ws-player","name":"Player demo","connected":true}]}
player: error {"code":"FORBIDDEN","message":"Solo el anfitrión puede iniciar la partida"}
host: session-started {"sessionId":"981597","startedAt":"2026-11-09T20:40:13.420Z"}
player: session-started {"sessionId":"981597","startedAt":"2026-11-09T20:40:13.420Z"}
BD confirmada: {"roomCode":"981597","status":"IN_PROGRESS","startedAt":"2026-11-09T20:40:13.420Z"}
```

Ambos scripts cierran solamente los sockets/proceso backend que crearon, nunca
el servidor dev del usuario ni Postgres. No borran registros de salas: las filas
de prueba quedan en BD. Al terminar el proceso temporal sus lobbies en memoria
desaparecen, conforme a la limitación documentada de reconexión entre procesos.
Tokens y JWT_SECRET nunca se imprimen ni se guardan en los artefactos.

## Pruebas automatizadas

### Unitarias — exit 0

```text
pnpm test -- --runInBand
$ jest "--runInBand"

Test Suites: 7 passed, 7 total
Tests:       50 passed, 50 total
Snapshots:   0 total
Time:        40.102 s, estimated 48 s
Ran all test suites.
```

### Solo el nuevo e2e — exit 0

```text
pnpm test:e2e -- --runInBand --runTestsByPath test/game-session.e2e-spec.ts
$ jest --config ./test/jest-e2e.json "--runInBand" "--runTestsByPath" "test/game-session.e2e-spec.ts"
Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
Snapshots:   0 total
Time:        20.316 s
Ran all test suites within paths "test/game-session.e2e-spec.ts".
```

Los 18 casos prueban transporte HTTP/WS y JWT reales con repositorios controlados,
no Postgres. Cubren autorización y ownership, validación, idempotencia, dos
participantes, proyección del selector, errores de código/fase, handshake inválido,
inicio REST→WS y WS→sala, inicio concurrente único, desconexión por fase,
reconexión, socket antiguo, cambio de sala y ausencia de eventos cruzados.
Las comprobaciones de aislamiento usan snapshots como barrera de orden del mismo
socket y assertions de eventos, no sleeps arbitrarios.

### Suite e2e completa — exit 0

```text
pnpm test:e2e
$ jest --config ./test/jest-e2e.json

Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
Snapshots:   0 total
Time:        25.399 s
Ran all test suites.
```

El spec viejo también pasó porque ahora existe configuración local y Postgres
está disponible. NO se modificó `test/app.e2e-spec.ts`; la tarea 10.8 sigue
pendiente para eliminar esa dependencia ambiental en Fase D, sin cambiar su
aserción Hello World.

### Compilación y tipos — exit 0

```text
pnpm build
$ nest build
```

`pnpm exec tsc --noEmit` no produjo salida (exit 0), incluyendo los tipos de tests.

## Archivos de Fase B

Nuevos:
- `src/modules/game-session/controllers/game-session.controller.ts`
- `src/modules/game-session/dto/create-game-session.dto.ts`
- `src/modules/game-session/dto/room-code.dto.ts`
- `src/modules/game-session/dto/join-session.dto.ts`
- `src/modules/game-session/dto/session-response.dto.ts`
- `src/modules/game-session/gateways/game-session.events.ts`
- `src/modules/game-session/gateways/game-session.events.spec.ts`
- `test/game-session.e2e-spec.ts`
- `scripts/phase-b-local.cjs`
- `scripts/verify-phase-b-rest.cjs`
- `scripts/verify-phase-b-ws.cjs`
- Este archivo de verificación.

Modificados:
- `src/modules/game-session/game-session.module.ts`
- `src/modules/game-session/services/game-session.service.ts`
- `src/modules/game-session/services/game-session.service.spec.ts` (inyección del publicador)
- `src/modules/game-session/gateways/game.gateway.ts` (sustitución del stub)
- `openspec/changes/implement-game-session-lobby/tasks.md`

## Cierre de fase

`openspec validate implement-game-session-lobby --strict` terminó con exit 0:

```text
Change 'implement-game-session-lobby' is valid
```

La comprobación final de líneas duplicadas devolvió vacío. No se archivó el
change ni se comenzó Fase C; se espera el OK del usuario.
