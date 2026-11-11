# Profelink Kahoot API

Guía de cuentas, bootstrap, QR y ejecución: [teacher-guests-deployment](docs/teacher-guests-deployment.md).

Backend NestJS con PostgreSQL 16 y migraciones explícitas de TypeORM. El servicio
de identidad es externo; su base y sus usuarios no se modifican aquí.

## Configuración y migraciones

Requisitos: Node.js 22, pnpm 10.19 y PostgreSQL 16. Copia `.env.example` a `.env`,
ajusta `DATABASE_URL` y configura `JWT_SECRET` con el mismo secreto del servicio de
autenticación. No incluyas `.env` ni credenciales reales en Git.

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm run db:check
pnpm run migration:show
pnpm run migration:run
pnpm run start:dev
```

`DATABASE_URL` admite `?schema=public`; el schema se valida y se configura por
separado de la conexión. `synchronize` y la ejecución automática de migraciones
están deshabilitados. La API **rechaza el arranque si quedan migraciones pendientes**.
`db:check` solo verifica conexión y no modifica el esquema.

Para generar una migración revisable: `pnpm run migration:generate -- src/shared/database/migrations/Nombre`.
Revisa siempre el SQL antes de aplicarlo. `migration:revert` es destructivo: úsalo
únicamente en bases descartables o con respaldo y autorización explícita.

## Contenedor y despliegue

Las rutas privadas requieren `Authorization: Bearer <accessToken>` del servicio de
identidad existente. Se validan firma HS256, audiencia, expiración obligatoria,
propósito `account`, `sub` UUID y rol MASTER/PROFESOR, además de la actividad y
versión de credenciales mediante Auth en cada operación. Auth no disponible
produce 503. `authorId` no es editable y MASTER no evita ownership.

```powershell
pnpm install --frozen-lockfile
./scripts/start.ps1
```

Antes de desplegar, respalda la base con las herramientas de PostgreSQL y el
volumen de uploads. Ejecuta la migración compilada una sola vez por despliegue,
antes de iniciar la aplicación. La imagen usa pnpm y el único lockfile existente;
no requiere `package-lock.json`, código TypeScript ni dependencias de desarrollo
para ejecutar las migraciones compiladas.

El volumen `uploads_data` persiste en `/app/uploads`; no lo borres al actualizar
o revertir la aplicación. Las imágenes de preguntas se publican intencionalmente
en `/uploads/questions/<filename>`. `UPLOADS_DEST` y `MAX_FILE_SIZE` configuran la
ubicación y el límite de carga (5 MiB por defecto).

Si otro proyecto ocupa 3000 o 5432, configura `PORT` y `POSTGRES_PORT` distintos.
El `DATABASE_URL` local debe usar el puerto publicado, mientras Compose conecta
al servicio `postgres:5432`. No reutilices la base de otro proyecto.

Rollback: vuelve a la imagen anterior **conservando tablas y volumen**; no ejecutes
automáticamente down de migraciones ni `docker compose down -v`. La versión previa
de cuestionarios era un stub y no podrá administrar los datos nuevos, pero estos
deben conservarse para reanudar el despliegue.

Pruebas, aislamiento de esquemas y JWT de prueba: [docs/testing.md](docs/testing.md).

## CRUD privado de cuestionarios

Contrato: [docs/openapi.json](docs/openapi.json). Todas las rutas siguientes llevan
el prefijo `/kahoot-api` y requieren Bearer:

| Recurso                                  | Operaciones                                                    |
| ---------------------------------------- | -------------------------------------------------------------- |
| `/quizzes`                               | POST crear (201), GET listar propios y demo compartido (200)   |
| `/quizzes/:quizId`                       | GET detalle (200), PATCH metadatos (200), DELETE cascada (204) |
| `/quizzes/:quizId/questions`             | POST crear pregunta (201), GET listar (200)                    |
| `/quizzes/:quizId/questions/:questionId` | GET (200), PATCH (200), DELETE (204)                           |

Ejemplo PowerShell, usando un token emitido por el servicio de identidad:

```powershell
$headers = @{ Authorization = "Bearer $token" }
$base = 'http://localhost:3000/kahoot-api'
$quiz = Invoke-RestMethod -Method Post -Uri "$base/quizzes" -Headers $headers -ContentType 'application/json' -Body '{"title":"Paradigmas","description":"Repaso"}'
$body = '{"questionText":"¿Cuál es un lenguaje funcional?","options":[{"text":"Haskell","isCorrect":true},{"text":"HTML","isCorrect":false},{"text":"CSS","isCorrect":false},{"text":"JSON","isCorrect":false}]}'
$question = Invoke-RestMethod -Method Post -Uri "$base/quizzes/$($quiz.id)/questions" -Headers $headers -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri "$base/quizzes/$($quiz.id)" -Headers $headers
Invoke-RestMethod -Method Patch -Uri "$base/quizzes/$($quiz.id)" -Headers $headers -ContentType 'application/json' -Body '{"title":"Nuevo título"}'
```

Los campos de texto se recortan; título 1–150 caracteres, descripción hasta 2000,
enunciado 1–2000 y cada opción 1–500. Cada pregunta exige **cuatro opciones, una
correcta y tres incorrectas**, con booleanos reales. Se mantienen tiempo entero
1–300 segundos (default 20) y puntos enteros 0–100000 (default 1000).

PATCH conserva los campos omitidos y rechaza cuerpos vacíos. Solo descripción y
portada permiten `null` para quitarlas. Sustituir opciones genera nuevos UUID de
opción; no está integrado con partidas activas. Borrar una pregunta no borra las
demás. Borrar un quiz elimina sus preguntas y opciones, revoca las imágenes y
deja sus archivos pendientes de limpieza persistente.

**Cambios incompatibles respecto del stub anterior:** las respuestas son recursos
directos (no `{ message, data }`), el listado incluye cuestionarios propios y el
quiz demo compartido, las
opciones deben cumplir la cardinalidad indicada y `imageUrl` es de solo lectura.
No se aceptan `authorId`, `id`, fechas ni campos desconocidos en los cuerpos.
`400` indica entrada inválida, `401` sesión inválida y `404` recurso inexistente,
ajeno o pregunta fuera del cuestionario. El sobre de errores conserva
`statusCode`, `timestamp`, `path` y `error` sin detalles SQL o rutas de archivos.

## Imágenes públicas de preguntas

`PUT/GET/DELETE /quizzes/:quizId/questions/:questionId/image` reciben/devuelven
una única imagen opcional por pregunta. La carga usa multipart con un archivo
`image`, sin campos extra: JPEG, PNG o WebP reales, de hasta 5 MiB por defecto
(`MAX_FILE_SIZE`) y 25 megapíxeles. Se comprueban firma, MIME y decodificación;
se rechazan SVG y contenido falsificado. El límite de bytes se aplica durante
la recepción; como máximo dos imágenes se decodifican a la vez.

Ejemplo PowerShell con el quiz y la pregunta del ejemplo anterior:

```powershell
$image = "$base/quizzes/$($quiz.id)/questions/$($question.id)/image"
curl.exe -X PUT "$image" -H "Authorization: Bearer $token" -F "image=@C:/imagenes/pregunta.png"
curl.exe "$image" -H "Authorization: Bearer $token" --output pregunta-guardada.png
curl.exe -X DELETE "$image" -H "Authorization: Bearer $token"
```

No fuerces `Content-Type: application/json` ni un boundary manual al enviar
`FormData`; el cliente genera el multipart. PUT devuelve `200` con la pregunta
actualizada, GET es una ruta de compatibilidad autenticada y DELETE devuelve `204`
incluso si ya no había imagen. `imageUrl` es `null` sin imagen o una ruta pública
como `/uploads/questions/<filename>`, relativa al **origen** de la API. Las seeds
usan `q1.png`–`q10.png`; las cargas de usuarios usan nombres UUID. `413` indica
exceso de bytes y `415` tipo/contenido/dimensiones
inválidos. Un archivo inexistente o no autorizado no revela su ruta física.

Guarda primero la pregunta JSON y luego su imagen. Si solo falla el archivo,
reintenta PUT sobre el mismo UUID: no repitas POST de pregunta. Una sustitución
fallida conserva la imagen previa. Los nombres originales nunca determinan
rutas de disco. El endpoint de descarga autenticado se conserva por compatibilidad;
la URL serializada es pública y no requiere Bearer.

## Probar la partida en vivo sin Docker

1. Inicia un PostgreSQL de desarrollo y crea dos bases, una para Auth y otra para Kahoot. Usa el repositorio de Auth en su rama `develop`.
2. Configura `DATABASE_URL`, `JWT_SECRET` y `JWT_AUDIENCE=kahoot-api` en Kahoot. En Auth configura su base, la misma clave y audiencia. En ambos servicios permite el origen de React mediante `CORS_ORIGIN`.
3. Instala las dependencias con `pnpm install`, ejecuta `pnpm migration:run` en Kahoot y el bootstrap interno `pnpm bootstrap:master` en Auth antes de iniciar ambas APIs con `pnpm start:dev`. Auth usa el puerto 3001 por defecto.
4. Entra como MASTER y crea docentes desde Usuarios. El registro público está retirado. Como docente crea un quiz Verdadero/Falso y una sala. Los participantes no necesitan cuenta.
5. En el frontend usa las URLs relativas de `.env.example` e inicia `pnpm dev`. Abre el enlace del lobby en una ventana privada e introduce un nombre. Consulta la guía de despliegue para QR desde teléfonos.
6. Configura el destino OTLP e importa el tablero siguiendo [Grafana Cloud](docs/grafana/README.md).

## Quiz demo y ejecución local con Compose

Auth usa **usuario y contraseña**, sin correo. Su bootstrap provisiona la cuenta
configurada por `DEMO_USER_USERNAME` (default `profesor_test`) y el seed inicia sesión
con `DEMO_USER_PASSWORD`, sin crear cuentas. Opcionalmente coloca los PNG `q1.png` a
`q10.png` en `public/seeds/`; las preguntas sin archivo se crean sin imagen.
`quiz-seed` crea el quiz **Evaluación de Cultura General** con diez preguntas de
opción múltiple. El seed es idempotente y no modifica quizzes ya existentes.

El quiz demo aparece junto con los quizzes propios de todas las cuentas y puede
abrirse para ver sus preguntas, pero es de solo lectura: la API rechaza editarlo,
borrarlo o agregarle contenido. No hace falta crear un correo ni registrar a mano
la cuenta demo.

1. Instala Node.js 22 y pnpm 10.19, inicia Docker Desktop y ejecuta
   `pnpm install --frozen-lockfile` en `kahoot-api`.
2. Ejecuta `scripts/start.ps1` o `scripts/start.bat` en Windows. La primera vez,
   el script crea `kahoot-api/.env` y `auth/.env` con secretos locales aleatorios;
   si ya existen, los conserva. Los archivos `.env` no deben compartirse.
3. Opcionalmente agrega `public/seeds/q1.png` … `q10.png` antes del primer seed.

Compose inicia API, Auth, frontend, dos bases PostgreSQL separadas y el seed.
Frontend: `http://localhost:5173`; API: `http://localhost:3000/kahoot-api`;
Auth: `http://localhost:3001/auth`.
La contraseña del usuario demo está en `DEMO_USER_PASSWORD` dentro del `.env`
local. El quiz demo de opción múltiple sirve para explorar autoría; la partida en
vivo actual requiere crear un cuestionario de solo preguntas Verdadero/Falso.
Comprueba el seed con `docker compose ps -a` y `docker compose logs quiz-seed`:
es un proceso de una sola ejecución y debe terminar con código 0.
Con dependencias de desarrollo instaladas, ejecuta `pnpm verify:services` para
comprobar frontend, salud de las APIs, login demo, autorización HTTP y Socket.IO.

### Operación de limpieza

Al quitar/reemplazar una imagen o borrar su pregunta/quiz, la misma transacción
desasocia la imagen y registra `file_cleanup_jobs`. El acceso queda revocado de
inmediato; el borrado físico es posterior. El trabajador procesa hasta 25 trabajos
al arrancar y cada 60 segundos, con exclusión por fila y backoff exponencial
(2 segundos inicialmente, hasta un día). Un archivo ya ausente cuenta como éxito;
un error temporal conserva el trabajo y sus intentos entre reinicios.

Un barrido recupera archivos propios no referenciados y temporales de más de 24
horas. No borra archivos recientes, imágenes asociadas, cargas activas, directorios
ni enlaces simbólicos. Los UUID promovidos renuevan su fecha antes de asociarse.
El diseño utiliza una sola instancia con volumen persistente; no escales a varias
réplicas sin un almacenamiento compartido y un diseño de cargas coordinado.

Para diagnosticar una cola persistente, revisar permisos/espacio del volumen y
consultar `SELECT attempts, next_attempt_at FROM file_cleanup_jobs ORDER BY next_attempt_at;`
en el schema configurado. No vaciar la cola ni borrar el volumen como reparación.
En pruebas (`NODE_ENV=test`) el trabajador se ejecuta explícitamente para controlar
tiempo y fallos; no usar ese modo en producción.

---

## Integración de `feature/punto3` con `develop`

> **Archivo histórico:** el contenido restante documenta etapas anteriores y no
> debe usarse como guía de ejecución actual. Los tokens manuales/DEV, el registro
> público y los verificadores phase-b han sido reemplazados por Auth real y
> `scripts/verify-teacher-guests.cjs`. Prevalecen la guía
> [teacher-guests-deployment](docs/teacher-guests-deployment.md), los contratos
> actuales y las specs de cuentas e invitados.

La guía histórica del Punto 3 más abajo describe el esquema previo. Tras integrar
quizzes real, **prevalece esta nota**:

- Se conserva íntegro el CRUD del compañero: `findAll(userId)` ya no es un mock.
  El selector del Punto 3 sigue usando exclusivamente `available-quizzes` y las
  tres consultas aditivas, ahora parametrizadas por `authorId` (`author_id` UUID).
- TypeORM usa **migraciones, nunca synchronize**, también en desarrollo. Ejecuta
  `pnpm migration:run` antes de iniciar. La migración `1794000000004-GameSessions`
  agrega únicamente la persistencia de salas; no altera los quizzes existentes.
- Una BD legacy creada por synchronize no equivale a una BD migrada. No apuntes
  las migraciones iniciales a ese esquema con datos sin preparar antes un plan de
  migración/backup. Las pruebas se ejecutan en esquemas nuevos aislados, no en public.
- `pnpm seed` sigue siendo manual, idempotente y exclusivo de desarrollo; requiere
  las migraciones previas. Guarda preguntas y cuatro opciones según el modelo del
  compañero. El alias JWT firmado `test-host-id` se traduce solo fuera de producción
  al autor UUID `7ac9810a-b36c-4c85-8b58-b296434f0100`. En producción se exige el
  propietario UUID real y no se habilita ese alias ni se comparte el catálogo demo.
- La autenticación global de authoring (UUID/audience) y su `@Public` se conservan.
  Game-sessions omite **solo ese guard global** y aplica siempre su guard dedicado,
  compartiendo verificador HS256/issuer/audience con WS. No hay endpoints de salas
  sin autenticación. Define JWT_AUDIENCE en `.env` según el emisor; JWT_ISSUER solo
  cuando el Auth Service lo emita (vacío en el ejemplo integrado).
- Los contratos del Punto 3 son REST `/kahoot-api/game-sessions` y Socket.IO
  namespace `/game`, con `join-session`/`start-session`. No se incorpora el gateway
  legacy `create_session` ni handlers de respuestas; la creación sigue por REST.
- `pnpm test:e2e -- --runInBand` ahora incluye las integraciones reales del compañero
  y requiere TEST_DATABASE_URL a una BD local descartable terminada en `_test`.
  La suite `test/game-session.e2e-spec.ts` y `test/app-smoke.e2e-spec.ts` siguen
  ejecutándose solas sin BD. `pnpm test:persistence` verifica las cinco migraciones
  y el ciclo de vida de salas en `kahoot_punto3_test`, esquema temporal propio.
- Compose conserva todos los servicios entrantes (incluido `quiz-seed`, distinto
  del seed manual del Punto 3). Configura sus variables de ejemplo; no uses secretos
  reales en archivos versionados. Validación sin revelar credenciales:
  `docker compose --env-file .env.example config --quiet`.

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
