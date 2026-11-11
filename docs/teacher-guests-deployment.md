# Cuentas docentes e invitados: ejecución

## Arranque coordinado

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
