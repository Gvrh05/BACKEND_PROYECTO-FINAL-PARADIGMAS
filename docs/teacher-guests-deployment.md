# Cuentas docentes e invitados: ejecución

## Arranque coordinado

Para servicios separados Railway/Netlify, usar la guía detallada
[railway-netlify.md](railway-netlify.md).

Los directorios hermanos de esta copia son `AUTH_PROYECTO-FINAL-PARADIGMAS`,
`BACKEND_PROYECTO-FINAL-PARADIGMAS` y `FRONT_PROYECTO-FINAL_PARAGIDMAS`.
Compose permite cambiar `AUTH_BUILD_CONTEXT` y `FRONTEND_BUILD_CONTEXT`.

Desde el backend:

```powershell
pnpm install --frozen-lockfile
node scripts/setup-local.cjs
docker compose up --build -d --wait --wait-timeout 300
docker compose ps
pnpm verify:services
```

`setup-local` conserva cualquier `.env` existente. Si es una configuración antigua,
añadir las variables faltantes de `.env.example` conservando los secretos ya usados.
No reemplazar contraseñas de bases existentes. `DEMO_USER_USERNAME` identifica al
demo real (por defecto `profesor_test`), no se presume `user_demo`.

Antes de actualizar una instalación existente, respaldar ambas bases con `pg_dump`
y el volumen de uploads. El bootstrap interno de Auth migra y crea el MASTER solo
si falta; no cambia la contraseña de cuentas existentes. Un MASTER contradictorio
aborta el arranque. La API espera a Auth saludable y aplica sus propias migraciones.
El seed hace login de la cuenta provisionada; `DEMO_USER_PASSWORD` debe coincidir
con la contraseña vigente. No se borra ninguna base ni volumen.

## Uso

Los perfiles pueden registrarse desde **Crear perfil** e iniciar sesión para
crear cuestionarios o unirse desde **Unirse** con el PIN de seis dígitos.
La administración de cuentas en **Usuarios** requiere el rol MASTER.
El enlace de invitación también admite jugadores invitados.

1. Abrir `http://localhost:5173` e iniciar sesión con el demo configurado.
2. En **Usuarios**, crear un PROFESOR. La sesión MASTER permanece activa.
3. Cerrar sesión y entrar como profesor; crear un quiz de Verdadero/Falso.
4. Crear una sala: el lobby presenta PIN, enlace público y QR local.
5. En ventana privada, abrir el enlace e introducir solo un nombre único.

El quiz demo es de solo lectura incluso para MASTER. Sus preguntas existentes de
opción múltiple no se convierten: para jugar usar un quiz de Verdadero/Falso.

## Teléfonos en la misma red

Usar una dirección del equipo accesible desde la red, por ejemplo
`http://192.168.1.20:5173`, y configurar `VITE_PUBLIC_WEB_URL` con ese origen antes
de compilar. Alternativamente abrir la web del anfitrión con esa misma dirección:
el enlace se genera con el origen actual. `localhost` solo sirve en el equipo local.

Mantener `VITE_API_URL=/kahoot-api` y `VITE_AUTH_API_URL=/auth`. Nginx y Vite
reenvían `/auth`, `/kahoot-api`, `/uploads` y `/socket.io` al servicio correcto.
`/game` es el namespace Socket.IO, no el path del transporte. El navegador del
teléfono no debe conectarse a localhost:3000 ni localhost:3001. Para desarrollo
Vite escucha en `0.0.0.0`; sus proxies apuntan a los backends locales 3000/3001.
Configurar `CORS_ORIGIN` coherente con el origen usado. Verificar conectividad,
firewall y aislamiento Wi-Fi manualmente; el proyecto no cambia esas reglas.
En despliegue público usar HTTPS y el mismo origen para WS seguro.

## Despliegue desde Docker Hub

Usar un VPS Linux amd64 con Docker Engine, Compose 2.24.4 o superior y
un dominio HTTPS. Clonar el backend, copiar `.env.example` a `.env` y
configurar `POSTGRES_PASSWORD`, `AUTH_POSTGRES_PASSWORD`, `JWT_SECRET` y
`DEMO_USER_PASSWORD` con valores propios. Si la instalación ya existe,
conservar las contraseñas de base y respaldar los volúmenes antes de actualizar.

`compose.images.yml` usa las imágenes de Docker Hub y deja el frontend en
`127.0.0.1:5173`. Configurar el proxy HTTPS hacia ese puerto con soporte
para WebSocket. Poner el origen público en `CORS_ORIGIN`. El frontend debe
compilarse con `VITE_API_URL=/kahoot-api` y `VITE_AUTH_API_URL=/auth`; dejar
`VITE_PUBLIC_WEB_URL` vacío para derivar los enlaces del origen de la web.
Los argumentos Vite solo se aplican durante la compilación de la imagen.

Con Caddy instalado en el VPS, apuntar el DNS del dominio al servidor y
configurar este bloque en el Caddyfile (sustituir el dominio):

```caddyfile
quiz.ejemplo.com {
    reverse_proxy 127.0.0.1:5173
}
```

En el cortafuegos público habilitar HTTPS y HTTP para la renovación del
certificado. El archivo de Compose vincula la aplicación a loopback y
mantiene privados los puertos de las APIs y las bases.

Establecer `AUTH_IMAGE`, `BACKEND_IMAGE` y `FRONTEND_IMAGE` con las etiquetas
o los digests de la versión verificada. Por defecto el override usa `latest`
del equipo. Las imágenes deben incluir los cambios que se van a demostrar.

```sh
sh scripts/start-images.sh
docker compose -f docker-compose.yml -f compose.images.yml logs --tail 50 auth api frontend quiz-seed
```

Configurar el endpoint y el secreto OTLP antes del arranque. Ver
[la guía de Grafana](grafana/README.md). Tras iniciar, abrir
`/auth/docs/` y `/kahoot-api/docs/` en el dominio para consultar Scalar.
Para detener la instalación y conservar datos, ejecutar
`docker compose -f docker-compose.yml -f compose.images.yml down`.

### Frontend ya publicado en Netlify

Si se mantiene la publicación de Netlify, usar el dominio HTTPS del VPS para
las APIs y el transporte en vivo. Configurar las variables de compilación
de la web antes de volver a desplegar:

```dotenv
VITE_AUTH_API_URL=https://authproyecto-final-paradigmas-production.up.railway.app/auth
VITE_API_URL=https://api.ejemplo.com/kahoot-api
VITE_WS_URL=https://api.ejemplo.com
VITE_PUBLIC_WEB_URL=https://project-deploy-985df3.netlify.app
```

En el VPS, configurar `CORS_ORIGIN=https://project-deploy-985df3.netlify.app`
y `FRONTEND_HEALTH_URL=https://project-deploy-985df3.netlify.app/`.
Comprobar los dos endpoints de salud en el VPS y la conexión del jugador
desde el sitio de Netlify. Los secretos OTLP se configuran en el VPS.

Si Backend también se ejecuta en Railway, desplegar su Dockerfile en un
servicio con una sola réplica, conectar PostgreSQL con `DATABASE_URL` y
montar un volumen escribible en `/app/uploads`. Configurar
`UPLOADS_DEST=/app/uploads`, `AUTH_SERVICE_URL` con el origen de Auth más
`/auth`, y el mismo `JWT_SECRET`, `JWT_AUDIENCE` y `JWT_ISSUER` que usa Auth.
En **ambas APIs** establecer `CORS_ORIGIN=https://project-deploy-985df3.netlify.app`
y configurar OTLP como variables de servicio. Tras asignar el dominio
público de Backend, reemplazar `api.ejemplo.com` en Netlify y volver a
compilar la web. Auth debe desplegar la revisión con el registro y Scalar.

## Cliente de resultados

Desde otra máquina con Node.js, establecer `PROFELINK_API_URL` al origen
de la aplicación más `/kahoot-api` y `PROFELINK_ACCESS_TOKEN` al token
Bearer del anfitrión. Ejecutar `node scripts/read-result.mjs PIN` con el PIN
de una partida terminada. El cliente se comunica por HTTP y no usa las
bases de datos ni importa código de la aplicación.

## Verificación de aceptación

Con la pila y el seed ejecutándose, `node scripts/verify-teacher-guests.cjs`
comprueba Auth/API/WS a través del proxy web. Crea dos profesores de prueba y un
quiz de nombre aleatorio; al finalizar desactiva esas cuentas y borra su quiz.
Configurar `VERIFY_ORIGIN` si la web no usa `http://localhost:5173`.
Ejecutar sobre instalación de verificación aislada. Las pruebas cubren permisos,
demo, reconexión, puntuación, resultados y revocación HTTP/WS.

Para cada repositorio ejecutar build, lint y test; en Auth/API también test:e2e.
En API `test:persistence` requiere PostgreSQL local y crea un esquema aleatorio
en la base de pruebas exclusiva. En frontend ejecutar `verify:production` tras build.
La comprobación física con teléfono requiere un dispositivo en la red del aula.

## Sesiones y límites

Cerrar sesión limpia el cliente y desconecta sus sockets; no revoca JWT copiados
ni termina automáticamente la sala. El anfitrión puede volver a entrar mientras
la misma instancia siga activa. Restablecer contraseña o desactivar sí invalida
tokens de cuenta. Reactivar exige login nuevo.

Los invitados son aliases temporales, no cuentas Auth. Sus credenciales se guardan
en sessionStorage por sala y expiran; no se incluyen en QR ni URL. No se permiten
altas después de comenzar. Recargar conserva identidad en esa pestaña. El motor
es de una sola instancia, en memoria: reiniciar invalida partidas e invitaciones.
Los resultados persistidos siguen perteneciendo al profesor. La exportación real
de archivos no forma parte de esta entrega.
