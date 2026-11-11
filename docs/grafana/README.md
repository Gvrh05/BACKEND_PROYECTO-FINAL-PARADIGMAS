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

Usa el endpoint y encabezado exactos de la instancia. Reinicia la API, importa `live-gameplay-dashboard.json` y selecciona la fuente Prometheus de Grafana Cloud. Juega una ronda, reenvía una respuesta y vuelve a entrar a la sala. Revisa los últimos 30 minutos. Para la defensa, usa estas variables en la API desplegada y cambia el nombre del entorno a `demo`. El servicio Auth debe instrumentarse con su configuración propia y un nombre distinto.

Si aún no hay una instancia, se puede verificar la emisión contra un receptor OTLP temporal. El tablero importado en Cloud requiere credenciales y tráfico reales.
