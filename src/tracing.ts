import 'dotenv/config';
import { metrics, trace } from '@opentelemetry/api';
import { startNodeSdk } from '@opentelemetry/sdk-node';

export const getTracer = (name: string) => trace.getTracer(name);
export const getMeter = (name: string) => metrics.getMeter(name);

/** Import before Nest so services receive the configured providers. */
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) {
  process.env.OTEL_EXPORTER_OTLP_PROTOCOL ??= 'http/protobuf';
  process.env.OTEL_LOGS_EXPORTER ??= 'none';
  startNodeSdk({
    resourceAttributes: {
      'service.name': process.env.OTEL_SERVICE_NAME || 'kahoot-game-session',
      'deployment.environment.name':
        process.env.OTEL_DEPLOYMENT_ENVIRONMENT || 'local',
    },
  });

  const frontendUrl = process.env.FRONTEND_HEALTH_URL?.trim();
  if (frontendUrl) {
    const frontendUp = getMeter(
      'profelink-frontend-probe',
    ).createObservableGauge('frontend_http_up', {
      description: 'Disponibilidad HTTP del frontend desde la API (1 o 0)',
    });
    frontendUp.addCallback(async (observation) => {
      let up = 0;
      try {
        const response = await fetch(frontendUrl, {
          signal: AbortSignal.timeout(2000),
        });
        await response.body?.cancel();
        up = Number(response.ok);
      } catch {
        // A connection error is recorded as an unavailable frontend.
      }
      observation.observe(up);
    });
  }
}
