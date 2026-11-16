# Grafana Cloud, Railway y Netlify

## URLs públicas

- Auth: https://authproyecto-final-paradigmas-production.up.railway.app
- Backend: https://backendproyecto-final-paradigmas-production.up.railway.app
- Web: https://project-deploy-985df3.netlify.app

La configuración del repositorio no actualiza automáticamente Railway ni Netlify.
Publicar los cambios y redesplegar los tres servicios. No confundir una prueba
OTLP local con evidencia de recepción en Grafana Cloud.

## 1. CORS y conexión entre servicios

En **ambos servicios Railway**, Variables:

```dotenv
CORS_ORIGIN=https://project-deploy-985df3.netlify.app
```

También se acepta una lista exacta separada por comas, sin barras finales:
`http://localhost:5173,https://project-deploy-985df3.netlify.app`.
La misma allowlist se utiliza en REST y Socket.IO. No usar `*` con credenciales.
En Backend configurar además:

```dotenv
AUTH_SERVICE_URL=https://authproyecto-final-paradigmas-production.up.railway.app/auth
FRONTEND_HEALTH_URL=https://project-deploy-985df3.netlify.app
```

Ambos deben conservar el mismo JWT_SECRET/audiencia y sus bases existentes.
No copiar los secretos al frontend. Auth sí lee CORS_ORIGIN en el código actual;
una versión desplegada antigua debe redesplegarse desde el cambio nuevo.

## 2. Netlify

`netlify.toml` define las URLs públicas de producción y el fallback SPA para
enlaces `/join/:invitationId`. Revisar variables existentes en la interfaz de
Netlify por si las sobrescriben. Las variables **exactas** del proyecto son:

```dotenv
VITE_API_URL=https://backendproyecto-final-paradigmas-production.up.railway.app/kahoot-api
VITE_AUTH_API_URL=https://authproyecto-final-paradigmas-production.up.railway.app/auth
VITE_WS_URL=https://backendproyecto-final-paradigmas-production.up.railway.app
VITE_PUBLIC_WEB_URL=https://project-deploy-985df3.netlify.app
```

No es `VITE_AUTH_URL`. Socket.IO usa namespace `/game` y transporte `/socket.io`.
Ejecutar un nuevo build/deploy: Vite incorpora estas variables al bundle.

## 3. Grafana Cloud

Entrar a la instancia desde el portal de Grafana Cloud y abrir OpenTelemetry →
Configure. Obtener el endpoint OTLP y un encabezado de acceso con `metrics:write`.
En Variables de **cada servicio Railway**, guardar sin publicarlos:

```dotenv
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=https://TU-ENDPOINT.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20TU_CREDENCIAL
OTEL_METRICS_EXPORTER=otlp
OTEL_TRACES_EXPORTER=none
OTEL_LOGS_EXPORTER=none
OTEL_METRIC_EXPORT_INTERVAL=10000
OTEL_DEPLOYMENT_ENVIRONMENT=demo
```

En Auth: `OTEL_SERVICE_NAME=profelink-auth`.
En Backend: `OTEL_SERVICE_NAME=kahoot-game-session`.
Copiar el endpoint/encabezado de la misma instancia en ambos. No poner la credencial
en Git, el frontend, capturas ni el chat. No duplicar `/v1/metrics` en el endpoint
general; el exportador añade esa ruta. Redesplegar ambos.

## 4. Cómo verlo online

1. En Grafana Cloud abrir la instancia → Explore → fuente Prometheus.
2. Seleccionar últimos 30 minutos, refresco 10 s.
3. Hacer login correcto e incorrecto en la web. Crear un quiz Verdadero/Falso,
   abrir sala, entrar mediante enlace/QR en ventana privada, iniciar, responder
   y recargar al jugador. No hay registro público: MASTER crea profesores.
4. Buscar `auth_http_requests_total`, `game_answers_total` y `frontend_http_up`.
   Auth etiqueta rutas con plantillas y código HTTP, nunca usuarios ni secretos.
   El probe del frontend publica 1 con HTTP 2xx, 0 con error/timeout y no mide
   por sí solo si toda la aplicación funciona. La métrica se desactiva sin URL.
5. Para identificar servicio/entorno revisar `target_info`, si está disponible.
   Según la promoción de atributos de la instancia, los filtros de recursos pueden
   aparecer directamente o requerir un join con target_info. Empezar sin filtros.
6. Dashboards → New → Import → cargar `live-gameplay-dashboard.json` y seleccionar
   Prometheus. Buscar **ProfeLink · Partida en vivo**.

Si no hay datos: revisar fuente y tiempo, generar tráfico, confirmar versión
desplegada, validar endpoint/credencial sin imprimirlos y revisar logs de Railway.
Un health 200 no demuestra exportación. Tras un redeploy pueden pasar varios ciclos
de envío/indexado. Un tablero local no demuestra telemetría remota.

Checks públicos de solo lectura, sin credenciales:
`node scripts/verify-public-deployment.cjs`.
Prueba real de exportación protobuf a un receptor local sin Cloud ni bases:
compilar Auth y Backend, luego `node scripts/verify-cloud-telemetry.cjs`.

## Evidencia pendiente

En la revisión se comprobó salud y CORS de ambos servicios públicos y WebSocket.
Inicialmente el bundle usaba rutas relativas sin proxy y Netlify devolvía HTML.
En la comprobación final se detectó un bundle nuevo que referencia ambos dominios
Railway y pasó el check de conexión. El redeploy remoto ocurrió fuera de esta
sesión; todavía no demuestra login/juego público ni recepción Cloud.

La CLI Railway requiere autenticarse de nuevo con `railway login`; no se puede
atribuir a esta sesión un despliegue o cambio de secretos que no se realizó.

No marcar la recepción Cloud ni la demostración física como completas hasta ver
ambos servicios en la instancia y capturar una partida/reconexión desde dos
dispositivos. Las partidas activas siguen en memoria; los resultados persistidos
son independientes de la recuperación del lobby tras reiniciar.
