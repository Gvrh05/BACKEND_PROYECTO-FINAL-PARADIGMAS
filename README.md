# Profelink Kahoot API

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
identidad existente. Se valida firma HS256, expiración cuando está presente y `sub`
UUID; `authorId` no es editable. Cualquier usuario autenticado administra solo lo
suyo, sin una nueva restricción por rol. Un secreto ausente impide el arranque.

```powershell
docker compose build api
docker compose up -d postgres
docker compose run --rm api pnpm run migration:run:prod
docker compose up -d api
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

## Quiz demo y ejecución local con Compose

Auth usa **usuario y contraseña**, sin correo. El seed crea (o valida) la cuenta
`profesor_test` con `DEMO_USER_PASSWORD`. Coloca manualmente los PNG `q1.png` a
`q10.png` en `public/seeds/`; no se generan automáticamente. `quiz-seed` los copia
al volumen público y crea el quiz **Evaluación de Cultura General** con diez
preguntas. El seed es idempotente.

El quiz demo aparece junto con los quizzes propios de todas las cuentas y puede
abrirse para ver sus preguntas, pero es de solo lectura: la API rechaza editarlo,
borrarlo o agregarle contenido. No hace falta crear un correo ni registrar a mano
la cuenta demo.

1. Copia `.env.example` a `.env` y reemplaza las contraseñas/secreto de ejemplo.
2. Añade manualmente `public/seeds/q1.png` … `q10.png`.
3. Ejecuta `scripts/start.ps1` o `scripts/start.bat` en Windows.

Compose inicia API, Auth, frontend, dos bases PostgreSQL separadas y el seed.
Frontend: `http://localhost:5173`; API: `http://localhost:3000/kahoot-api`;
Auth: `http://localhost:3001/auth`.

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
