<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

## Cómo probar el Punto 3

### Preparación

1. Prepara `.env` a partir de `.env.example` sin compartir secretos reales.
   Mantén el formato `DATABASE_URL=postgresql://.../kahoot_db?schema=public`.
2. Levanta solo Postgres para desarrollo:

   ```powershell
   docker compose up -d postgres
   ```

3. Si falta el quiz de demo, ejecuta **manualmente** `pnpm seed`. Es idempotente:
   usa UUIDs estables, no duplica quizzes/preguntas y nunca corre desde main,
   Compose ni las pruebas. No crea usuarios del Auth Service.
4. Ejecuta `pnpm start:dev` aquí y `pnpm dev` en el frontend hermano
   `FRONT_PROYECTO-FINAL_PARAGIDMAS`. Abre el frontend en localhost:5173.

TypeORM usa synchronize solo fuera de production. Compose conserva api en
production, donde el esquema debe provisionarse aparte: para esta demo levanta
solo postgres y corre Nest localmente con NODE_ENV=development. No hay migración
de producción incluida y no se deben apuntar estas pruebas a datos valiosos.

### JWT y Auth Service

Para demo local, el frontend ofrece `/dev-login` y botones en `/login` solo con
`pnpm dev`. Usa la clave pública de ejemplo y el mismo JWT_ISSUER/JWT_AUDIENCE
de `.env.example`; consulta su README. Es **DEV ONLY**, no autenticación de
producción. No copies un secreto real al frontend. `pnpm build` excluye la ruta,
botones, firma, claves, IDs e instrucciones del seed; el vacío de producción dice
"No hay cuestionarios disponibles. Contacta al administrador.".

Alternativa Node (Node 22, desde este backend):

```powershell
pnpm exec node --env-file=.env -e "const {JwtService}=require('@nestjs/jwt'); console.log(new JwtService().sign({sub:'test-host-id',name:'Host demo'},{secret:process.env.JWT_SECRET,algorithm:'HS256',issuer:process.env.JWT_ISSUER||undefined,audience:process.env.JWT_AUDIENCE||undefined,expiresIn:'1h'}))"
```

Para el jugador cambia sub por `test-player-id`. Los JWT se firman con la
configuración local, expiran en una hora y no deben compartirse. En la consola
del frontend del perfil host:

```js
localStorage.setItem('token', 'PEGA_AQUI_EL_JWT');
localStorage.setItem('user', JSON.stringify({sub: 'test-host-id', name: 'Host demo'}));
location.href = '/host/create';
```

Para el jugador usa su JWT, sub test-player-id y ruta `/join`. Secreto compartido
HS256 es solo dev/demo; si Auth cambia a RS256/JWKS, se adaptará TokenVerifier.
El backend valida firma/expiración/sub y restricciones de issuer/audience
configuradas tanto en HTTP como en WS; no basta decodificar el JWT.

Cuando el compañero publique Auth, sustituye lo anterior por su contrato real.
Ejemplo **placeholder**, no una ruta/formato confirmados:

```powershell
curl.exe -X POST "http://localhost:4000/auth/login" -H "Content-Type: application/json" --data '{"email":"USUARIO_DEMO","password":"PASSWORD_DEMO"}'
```

La URL debe ajustarse a AUTH_SERVICE_URL y al contrato del compañero; este
proyecto no implementa ni invoca automáticamente ese login.

### Demo de dos navegadores

1. Usa **dos perfiles/navegadores** o uno normal y otro privado. Dos pestañas del
   mismo perfil comparten localStorage y no son dos usuarios independientes.
2. Host test-host-id: selecciona el quiz y pulsa **Crear sala**, luego copia PIN.
3. Player test-player-id: pega el código y pulsa **Unirse**.
4. El host ve ambos participantes. Solo se habilita **Iniciar partida** si hay
   otro participante conectado: `p.userId !== hostId && p.connected`, en LOBBY
   y sin una solicitud pendiente. El host no cuenta para ese mínimo de UI.
5. El host inicia por REST; `session-started` llega por WS a ambos. Ambos muestran
   **Partida en curso**, sin navegar a preguntas (Punto 4).
6. Recarga el player en LOBBY y después de iniciar: recupera GET + join-session
   idempotente en cada conexión. Se conserva identidad y fecha de inicio. El GET
   atrasado no revierte el evento WS (protección de al menos 2 s y estado monotónico).
7. Crea una segunda sala y verifica que sus listas y eventos no se cruzan.

El selector usa exclusivamente `GET /kahoot-api/game-sessions/available-quizzes`,
que llama `findAllByOwner(sub)`. El quiz del seed pertenece a test-host-id y tiene
id `7ac9810a-b36c-4c85-8b58-b296434f0110`. `findAll()` público de quizzes sigue
devolviendo `[]`; su implementación real corresponde al compañero y está fuera
de este cambio. No se cambió su controller ni hay fallback al listado mock.

### Contratos REST y WS

HTTP base: `http://localhost:3000/kahoot-api`. Todos los endpoints nuevos exigen
Bearer JWT. `sessionId` público es PIN, no el UUID interno de la fila.
Ver contratos completos y errores en [`docs/openapi.json`](docs/openapi.json).

| Método | Ruta relativa | Éxito |
| --- | --- | --- |
| GET | /game-sessions/available-quizzes | 200 `[{id,title}]` filtrado por sub |
| POST | /game-sessions | 201 sesión LOBBY; body `{quizId}` UUID propio |
| GET | /game-sessions/:roomCode | 200 snapshot con participants/startedAt? |
| GET | /game-sessions/:roomCode/participants | 200 `[{userId,name,connected}]` |
| POST | /game-sessions/:roomCode/join | 201 `{added,player}`; body `{name?}` |
| POST | /game-sessions/:roomCode/start | 200 IN_PROGRESS; solo host |

400: validación/fase; 401: JWT; 403: ownership/no-host; 404: sala inexistente.
Se mantiene el sobre HTTP `{statusCode,timestamp,path,error}` y no se retornan
respuestas correctas, puntajes, sockets ni tokens.

Usa **Socket.IO client**, no WebSocket nativo, en `http://localhost:3000/game`.
Handshake: `auth: {token}`. Un token inválido desconecta; mensajes posteriores
vuelven a verificar su vigencia. Las emisiones van solo a sala/socket concreto.

| Evento | Dirección | Payload | Auth |
| --- | --- | --- | --- |
| join-session | cliente → servidor | `{roomCode}` | JWT handshake |
| session-state | servidor → socket | `{sessionId,roomCode,status,hostId,quizId,participants,startedAt?}` | socket autenticado |
| participants-updated | servidor → sala | `{participants:[{userId,name,connected}]}` | miembros de la sala |
| start-session | cliente → servidor | `{roomCode}` | JWT + solo host |
| session-started | servidor → sala | `{sessionId,startedAt}` | miembros de la sala |
| error | servidor → socket | `{code,message}` | error dirigido al solicitante |

Códigos WS: UNAUTHENTICATED, INVALID_ROOM_CODE, SESSION_NOT_FOUND,
SESSION_ALREADY_STARTED, INVALID_SESSION_STATUS, FORBIDDEN, INTERNAL_ERROR.
Desconectar elimina en LOBBY o marca offline en IN_PROGRESS; un socket viejo
no elimina otra conexión vigente. No hay eventos de answer/puntajes/clasificación.

### Pruebas y límites

```powershell
pnpm build
pnpm test -- --runInBand
pnpm test:e2e

# Integración Postgres real, opcional y explícita
pnpm test:persistence
```

- Unitarias: repositorios controlados y motor en memoria; sin PostgreSQL/Auth/OTel.
- E2E HTTP/Socket.IO: Nest/JWT/transporte reales y repositorios controlados, sin
  necesitar `.env` ni BD. Hello World prueba solo AppController/AppService.
- `test:persistence`: carga configuración local, prepara (si falta) la BD local
  **kahoot_punto3_test** con el usuario de DATABASE_URL y ejecuta 5 pruebas reales.
  Requiere permiso de CREATE DATABASE la primera vez. Alternativa: prepara esa BD
  manualmente y proporciona TEST_DATABASE_URL; nunca uses kahoot_db aquí.
  Cada ejecución crea un esquema propio `punto3_<uuid>`, comprueba entidades,
  ownership, PIN unique, create/start/finishedAt y FK CASCADE, y elimina **solo
  ese esquema creado por la prueba** al finalizar. No borra public, la BD ni
  registros de desarrollo. Sus fixtures no invocan el seed de demo.
- Manual REST/WS: `node scripts/verify-phase-b-rest.cjs` y
  `node scripts/verify-phase-b-ws.cjs`, después de compilar. Usan AppModule y
  Postgres real con el quiz ya sembrado; dejan filas de prueba.
- Navegador real: desde el frontend, `node scripts/verify-phase-c.cjs` (Edge,
  Node 22, backend compilado y Postgres). Dos perfiles, StrictMode, 320 px,
  cleanup/cambio de sala, GET/401 atrasados, reconexión e inicio. No ejecuta seed.
- Producción frontend: `pnpm build` y `pnpm verify:production` en el frontend.

Persistencia cubre el ciclo de vida de la sala, no los mapas de participantes.
Recargar una pestaña funciona mientras vive el backend; reiniciar el proceso no
restaura el lobby. Una sola instancia; no hay coordinación distribuida ni scoring.
OTel es un stub no-op que el compañero reemplazará; no se afirma exportación real.

### Observabilidad del Punto 3

`src/tracing.ts` es un stub no-op: no instala SDK ni exporta datos, aun si se
configura un endpoint. El compañero de OTel reemplazará este archivo por el SDK
real. Se incluyen spans createSession/joinSession/startSession y métricas
sessions_active, participants_per_session y ws_events_total (join/start/disconnect).
`OTEL_SERVICE_NAME=kahoot-game-session`; deja `OTEL_EXPORTER_OTLP_ENDPOINT=` vacío.

### Salas de verificación de Fase B

Los PIN `157464` (REST) y `981597` (WS) son filas de verificación aceptadas en la
BD de desarrollo. Se dejaron deliberadamente, sin borrar datos. No son salas
reutilizables después de detener su proceso backend: los participantes/lobbies
viven en memoria y sus filas persistidas conservan IN_PROGRESS/startedAt.
Los scripts pueden dejar otras filas de pruebas; no ejecutes limpiezas automáticas.

### Autenticación del Punto 3 (dev/demo)

La verificación compartida REST/WS usa **HS256 con `JWT_SECRET` compartido solo
para dev/demo** mientras el Auth Service define su contrato. Configura también
`JWT_ISSUER` y `JWT_AUDIENCE` iguales en ambos servicios. No se confía en tokens
meramente decodificados: se verifican firma, expiración y `sub`.
Si Auth cambia a RS256/JWKS, se adaptará el proveedor `TokenVerifier`; no se debe
relajar la verificación. No uses el secreto de ejemplo en producción.

El seed es manual: `pnpm seed`. Nunca se ejecuta desde el arranque ni Compose.
En desarrollo usa `DATABASE_URL` del ejemplo y `NODE_ENV=development`; en
producción `synchronize` está deshabilitado y el esquema debe provisionarse aparte.

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
