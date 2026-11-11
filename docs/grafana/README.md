# Grafana Cloud para partida en vivo

En Grafana Cloud, abre la instancia del equipo y selecciona **OpenTelemetry → Configure**. Copia el endpoint base OTLP que termina en `/otlp` y el valor del encabezado de autenticación. Configura estas variables en el proceso de la API o en su `.env` ignorado por Git.

```dotenv
OTEL_SERVICE_NAME=kahoot-game-session
OTEL_DEPLOYMENT_ENVIRONMENT=local
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-REGION.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20CREDENCIAL
OTEL_METRICS_EXPORTER=otlp
OTEL_TRACES_EXPORTER=otlp
OTEL_METRIC_EXPORT_INTERVAL=10000
```

Configura el endpoint y el encabezado exactos en los secretos del entorno de despliegue. Compose transmite los ajustes OTLP a la API y Auth, con nombres de servicio `kahoot-game-session` y `profelink-auth`. Si la plataforma los ejecuta por separado, configura las variables OTLP en cada servicio y usa `OTEL_SERVICE_NAME=profelink-auth` en Auth. Para la defensa, configura `OTEL_DEPLOYMENT_ENVIRONMENT=demo` en ambos.

Reinicia ambos servicios, importa `live-gameplay-dashboard.json` y selecciona la fuente Prometheus de Grafana Cloud. En **Explore**, busca `auth_http_requests_total` y `game_answers_total` para confirmar que llegaron las dos fuentes. Haz un inicio de sesión válido, otro con contraseña incorrecta y una partida con una reconexión y una respuesta rechazada. Comprueba que suban los contadores y que aparezca la latencia. Guarda el enlace y una captura del tablero como evidencia de la demo.

Auth registra el método, la plantilla de la ruta y el código HTTP de las solicitudes completadas. Los paneles muestran tráfico, errores HTTP y latencia p95. La emisión se puede comprobar antes de configurar Grafana Cloud enviando OTLP a un receptor temporal.
