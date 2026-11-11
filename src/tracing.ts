import 'dotenv/config';
import { metrics, trace } from '@opentelemetry/api';
import { startNodeSdk } from '@opentelemetry/sdk-node';

export const getTracer = (name: string) => trace.getTracer(name);
export const getMeter = (name: string) => metrics.getMeter(name);
let sdk: ReturnType<typeof startNodeSdk> | undefined;
export const shutdownTelemetry = () => sdk?.shutdown() ?? Promise.resolve();

/** Import before Nest so services receive the configured providers. */
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) {
  process.env.OTEL_EXPORTER_OTLP_PROTOCOL ??= 'http/protobuf';
  process.env.OTEL_METRICS_EXPORTER ??= 'otlp';
  process.env.OTEL_TRACES_EXPORTER ??= 'none';
  process.env.OTEL_LOGS_EXPORTER ??= 'none';
  sdk = startNodeSdk({
    resourceDetectors: [],
    resourceAttributes: {
      'service.name': process.env.OTEL_SERVICE_NAME || 'kahoot-game-session',
      'deployment.environment.name':
        process.env.OTEL_DEPLOYMENT_ENVIRONMENT || 'local',
    },
  });
}
