# Backend Railway + frontend Netlify

Desplegar `feature/punto4` en **los tres** servicios. Seleccionar esa rama en Railway
y Netlify es un paso del panel: subir commits a ella no cambia la rama de despliegue.
No ejecutar seeds ni pruebas que creen cuentas contra producción sin autorización.

## Auth

Ver `docs/railway.md` en el repositorio Auth. Requiere PostgreSQL propio,
JWT_SECRET compartido y CORS_ORIGIN con el origen HTTPS de Netlify.

## Backend de juego (Railway)

```dotenv
NODE_ENV=production
DATABASE_URL=${{Postgres-tqP5.DATABASE_URL}}
JWT_SECRET=EL_MISMO_SECRETO_REAL_DE_AUTH
JWT_AUDIENCE=kahoot-api
AUTH_SERVICE_URL=https://authproyecto-final-paradigmas-production.up.railway.app/auth
CORS_ORIGIN=https://project-deploy-985df3.netlify.app
UPLOADS_DEST=/app/uploads
MAX_FILE_SIZE=5242880
FRONTEND_HEALTH_URL=https://project-deploy-985df3.netlify.app/
```

La referencia `Postgres-tqP5` corresponde al nombre mostrado en el proyecto del
usuario; verificarlo en el panel y no vincular la base de Auth por equivocación.
JWT_ISSUER solo cuando Auth lo emite, con el mismo valor. AUTH_SERVICE_URL es
obligatoria para un despliegue remoto: la API valida cuenta/versión con Auth en cada
operación protegida. Un healthcheck verde por sí solo no prueba esa comunicación.

Usar el Dockerfile (incluye migraciones compiladas), una sola réplica y un volumen
escribible en `/app/uploads`. No borrar volúmenes para actualizar. Railway asigna PORT;
configurar dominio público al puerto real y healthcheck `/kahoot-api/health`.
Docs públicas: `/kahoot-api/docs/` y `/kahoot-api/docs/openapi.json`.

La cuenta MASTER y el quiz demo son tareas separadas: bootstrap en Auth; seed
opcional `node dist/seeds/quiz-demo.seed.js` en el backend con DEMO_USER_USERNAME,
DEMO_USER_PASSWORD y AUTH_SERVICE_URL correctos. El arranque normal de la API no
ejecuta ese seed. No publicar la contraseña inicial.

## Netlify

En las variables de **compilación** del sitio, después de conocer el dominio real
del backend:

```dotenv
VITE_AUTH_API_URL=https://authproyecto-final-paradigmas-production.up.railway.app/auth
VITE_API_URL=https://TU-BACKEND-PUBLICO/kahoot-api
VITE_WS_URL=https://TU-BACKEND-PUBLICO
VITE_PUBLIC_WEB_URL=https://project-deploy-985df3.netlify.app
```

`TU-BACKEND-PUBLICO` es un marcador, no una URL funcional. Netlify es un host estático;
las rutas relativas /auth, /kahoot-api y /socket.io no tienen el proxy de Nginx/Vite.
El fallback SPA devuelve HTML y no sustituye a una API. La validación de netlify.toml
rechaza variables faltantes, localhost y URLs de Netlify usadas como APIs.

VITE_WS_URL es el origen HTTPS sin /game ni /kahoot-api. Si está vacío, el cliente
deriva el origen de VITE_API_URL. Socket.IO usa transporte /socket.io y namespace /game;
se conecta directamente al backend, no mediante el redirect SPA de Netlify.
Las imágenes públicas usan el origen de la API. Recompilar tras editar VITE_*:
son valores incluidos en los archivos JS, no configuración dinámica del servidor.

## OTLP y comprobación pública

Hay un smoke de despliegue sin escrituras ni credenciales. En PowerShell:

```powershell
$env:PUBLIC_FRONTEND_URL='https://project-deploy-985df3.netlify.app'
$env:PUBLIC_AUTH_URL='https://authproyecto-final-paradigmas-production.up.railway.app/auth'
$env:PUBLIC_API_URL='https://TU-BACKEND-PUBLICO/kahoot-api'
pnpm verify:public
```

Comprueba JSON de salud/OpenAPI, preflight CORS y transporte Socket.IO. No crea
cuentas ni sustituye la prueba funcional desde varios dispositivos. También puede
ejecutarse contra el stack local de revisión cambiando las tres URLs.

Configurar en ambas APIs las variables privadas OTEL_EXPORTER_OTLP_ENDPOINT,
OTEL_EXPORTER_OTLP_HEADERS, OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf,
OTEL_SERVICE_NAME distinto por servicio y OTEL_DEPLOYMENT_ENVIRONMENT=production.
No confirmar métricas de producción por el solo hecho de que funcionen en local:
comprobar en Grafana etiquetas de servicio/entorno y marcas de tiempo recientes.

Validar con el origen real del navegador:

```sh
curl -i https://TU-BACKEND-PUBLICO/kahoot-api/health -H 'Origin: https://project-deploy-985df3.netlify.app'
curl -i https://TU-BACKEND-PUBLICO/kahoot-api/docs/openapi.json
```

Luego registrar un PROFESOR, iniciar sesión y crear un quiz Verdadero/Falso y una
sala desde Netlify. Abrir su QR/enlace en otro dispositivo sin cuenta, responder,
reconectar y terminar. Consultar el resultado como anfitrión desde el cliente
independiente `scripts/read-result.mjs`. Confirmar CORS HTTP y Socket.IO sin errores,
URLs de imágenes HTTPS y aislamiento de salas. Esa prueba pública sigue pendiente
hasta tener URL de backend y acceso de despliegue; no se reemplaza por tests locales.
