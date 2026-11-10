# Fase C — OTel stub y frontend completo

Change: `implement-game-session-lobby`. Completadas 7.1–7.3, 8.1–8.5 y 9.1–9.7.
Progreso: **51/61**, 10 pendientes de Fase D. No se inicia ni archiva Fase D.

## Orden y alcance

1. Primero se implementó el stub OTel, con build backend y 51 unit tests verdes.
2. Se añadieron únicamente react-router-dom 7.18.5, socket.io-client 4.8.4 y
   zod 4.6.7 al frontend hermano, reutilizando axios e instalaciones existentes.
3. Se implementó infraestructura y se comprobó build antes de las páginas.
4. Se completó cada página seguida de su propio build.
5. Finalmente se verificó cleanup en navegador real, regresión, tipos/lint y
   exclusión de demo en producción.

Backend: sin SDK/exportador OTel, sin nuevas dependencias. `src/tracing.ts` es
no-op incluso con endpoint configurado hasta que el compañero lo reemplace;
su import es la primera línea de main. Spans createSession/joinSession/startSession
cierran con try/finally y registran errores antes de propagarlos. Gauge
sessions_active en create/remove, histogram participants_per_session tras cambios
de lista/presencia y counter ws_events_total solo join/start/disconnect, sin answer.
La prueba nueva ejecuta toda la API no-op con endpoint vacío y sin red.

Frontend: cuatro páginas, tres componentes, AuthProvider/ProtectedRoute,
interceptor Bearer, contratos zod y singleton Socket.IO con leases. Las rutas
de lobby están keyed por sala/identidad; cada listener se retira con su callback
y GET se cancela al desmontar. StrictMode permanece activado. Se evita que un
GET atrasado revierta IN_PROGRESS y que un 401 viejo elimine una sesión nueva.

DEV ONLY: `/dev-login` y los botones de `/login` firman HS256 mediante Web Crypto
con la clave pública del ejemplo, no con secretos reales. Producción elimina
ruta, módulo de firma, botones y clave; conserva solo el placeholder de Auth.
README frontend documenta la configuración compatible y la alternativa Node para
un JWT firmado con la configuración real del backend sin copiar secretos al front.

## Builds frontend por hito (todos exit 0)

| Hito | Módulos Vite | Tiempo |
| --- | ---: | ---: |
| Infraestructura, aún sin conectar al scaffold visual | 18 | 8.11 s |
| Infraestructura conectada + Auth/Router/login placeholder | 61 | 8.71 s |
| HostCreateSessionPage | 218 | 10.21 s |
| HostLobbyPage | 222 | 10.61 s |
| JoinSessionPage | 223 | 11.98 s |
| PlayerLobbyPage | 224 | 11.23 s |
| Build final tras protección contra 401 de un token anterior | 224 | 10.47 s |

Última salida `pnpm build` del frontend, sin códigos ANSI ni aviso informativo de
tiempos del plugin Babel (no es un warning de compilación/tipos):

```text
$ tsc -b && vite build
vite v8.3.6 building client environment for production...
transforming...
✓ 224 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.55 kB │ gzip:   0.32 kB
dist/assets/index-CbQa_Fmf.css    3.75 kB │ gzip:   1.45 kB
dist/assets/index-Ck36-s-A.js   457.41 kB │ gzip: 144.96 kB
✓ built in 10.47s
```

`pnpm lint` frontend (exit 0):

```text
$ eslint .
```

## Navegador real: Edge + Postgres, sin mocks

Comando desde el frontend: `node scripts/verify-phase-c.cjs` (exit 0).
Usa Edge instalado y CDP nativo de Node 22, sin instalar Playwright ni otro
runner. Crea dos contextos aislados de navegador, ambos a 320×800, servidores
temporales en puertos libres y AppModule/TypeORM contra Postgres localhost:5432.
Se conserva el quiz sembrado por el usuario; nunca se ejecuta seed.

La clave/issuer/audience de demo se aplican solo al entorno del proceso temporal,
sin modificar `.env` ni exponer secretos reales. Las comprobaciones consultan
además el API real para confirmar presencia/identidad. El script pausa respuestas
HTTP con CDP para reproducir GET y 401 atrasados de manera controlada.

Última salida completa:

```text
PASS producción: sin ruta dev-login, botones ni clave pública de demo en dist.
Postgres real: localhost:5432; quiz del seed presente; sin mocks ni ejecución de seed.
PASS host: selector available-quizzes, sala 260415, host solo no habilita inicio; StrictMode = 1 conexión.
PASS player: dos perfiles con JWT client-side, errores legibles, 2 participantes; StrictMode = 1 conexión.
PASS cleanup SPA: salida retira presencia y deshabilita inicio; rejoin restaura una sola identidad.
PASS inicio REST → WS en ambos; GET LOBBY atrasado no sobrescribe Partida en curso.
PASS recarga: conserva sala/startedAt, reemite join y no duplica participantes ni navega al Punto 4.
PASS móvil 320px: sin overflow, código legible y botones >=48px.
PASS logout/renovación de identidad y selector vacío explícito; nunca se solicitó GET /quizzes.
PASS token actualizado: un 401 atrasado de credenciales viejas no borra la sesión vigente.
PASS cambio SPA de sala 260415 → 494095: se libera presencia anterior y no se mezcla estado.
PASS HTTP 401: limpia token/user, desconecta socket y vuelve a /login.
Verificación de navegador completa; Postgres real, sin seed ni borrado de filas.
```

Las filas 260415 (IN_PROGRESS) y 494095 (LOBBY), además de las de intentos previos,
permanecen en la BD dev. Los lobbies en memoria desaparecen al cerrar esos
procesos temporales. No se borraron datos ni se mataron servidores del usuario.
Los perfiles temporales de Edge se dejan bajo el directorio aprobado de OpenCode.

Incidencias de la preparación de pruebas, resueltas y repetidas:
- Un arranque frío de dependencias del backend superó el timeout de 30 s del
  helper. Se amplió a 90 s; no se alteró configuración/persistencia ni se relajó
  autenticación. Importar tracing tomó milisegundos; las dependencias fueron el
  coste dominante del arranque.
- Una aserción de logout buscaba un nombre literal en vez de identidad/presencia.
  Se corrigió el script a comprobar test-player-id y connected=false. El recorrido
  completo posterior pasó, incluido el cambio de sala y el 401 atrasado.

## Regresión backend (salidas finales)

`pnpm build` (exit 0):

```text
$ nest build
```

`pnpm test -- --runInBand` (exit 0):

```text
$ jest "--runInBand"

Test Suites: 8 passed, 8 total
Tests:       51 passed, 51 total
Snapshots:   0 total
Time:        69.751 s
Ran all test suites.
```

`pnpm test:e2e` (exit 0):

```text
$ jest --config ./test/jest-e2e.json

Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
Snapshots:   0 total
Time:        44.614 s
Ran all test suites.
```

El e2e de transporte nuevo usa repositorios controlados como en Fase B. El viejo
todavía depende de `.env`/Postgres: no se adelantó 10.8. Las verificaciones Edge
descritas arriba sí usan Postgres real, no esos repositorios controlados.

## Archivos de Fase C

Backend:
- Nuevos `src/tracing.ts`, `src/tracing.spec.ts`.
- Modificados `src/main.ts`, `src/modules/game-session/services/game-session.service.ts`
  y `src/modules/game-session/gateways/game.gateway.ts` para hooks no-op.
- `README.md`: explicación del stub y salas 157464/981597 de Fase B.
- `scripts/phase-b-local.cjs`: solo timeout de arranque aumentado a 90 s.
- `.env.example` ya contenía las variables OTel correctas; no se reescribió.

Frontend hermano `FRONT_PROYECTO-FINAL_PARAGIDMAS`:
- `package.json`, `pnpm-lock.yaml`, nueva `.env.example`.
- `src/main.tsx`, `src/App.tsx`, `src/index.css`.
- Nuevos `src/api/{http.ts,gameSessions.ts}`.
- Nuevos `src/realtime/{socket.ts,useSessionLobby.ts}`.
- Nuevos `src/auth/{AuthContext.tsx,ProtectedRoute.tsx,auth-context.ts,useAuth.ts,storage.ts,dev-token.ts,DevLoginButtons.tsx}`.
- Nuevas cuatro páginas pedidas bajo `src/pages/` y tres componentes bajo `src/components/`.
- `README.md`: Cómo probar el Punto 3, JWT demo/Node, aislamiento y limitaciones.
- Nuevo `scripts/verify-phase-c.cjs` para reproducir la comprobación de navegador.

OpenSpec:
- Checkboxes 7–9 completados individualmente, sin duplicar líneas.
- Specs/design actualizados con DEV ONLY, presencia del otro jugador, estado
  Partida en curso, texto vacío exacto, GET monotónico y contador sin answer.
- Este registro de verificación. Todavía no se sincroniza/archiva el change.

## Controles y límites

Validación final (exit 0):

```text
openspec validate implement-game-session-lobby --strict
Change 'implement-game-session-lobby' is valid
```

- SHA256: 10/10 archivos protegidos de results y controller/DTOs de quizzes sin
  cambios. AST: 4/4 métodos originales de quizzes sin cambios.
- 61 IDs únicos en tasks.md; la comprobación de líneas duplicadas devuelve vacío.
- Sin modificaciones de `.gitignore`, `.env`, entidades/esquema ni seed.
- No se implementó login/register real, Auth Service, preguntas, puntaje,
  clasificación o SDK/exportación OTel.
- Solo se usó una clave pública de demo marcada DEV ONLY, excluida de producción;
  no se incluyeron secretos reales en el frontend ni en las evidencias.
- Fase D (10.8–10.9, 11 y 12) pendiente de autorización.
