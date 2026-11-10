import { getMeter, getTracer } from './tracing';

describe('tracing no-op integration seam', () => {
  it('runs all operations safely without an OTLP endpoint or network/exporter', async () => {
    const previous = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = '';
    try {
      const meter = getMeter('test');
      expect(() => {
        meter.createCounter('ws_events_total').add(1, { event: 'join' });
        meter.createGauge('sessions_active').record(1);
        meter.createHistogram('participants_per_session').record(2);
      }).not.toThrow();
      const tracer = getTracer('test');
      const result = tracer.startActiveSpan('operation', (span) => {
        span.recordException(new Error('sample'));
        span.setStatus({ code: 2 });
        span.end();
        return 42;
      });
      expect(result).toBe(42);
      await expect(
        tracer.startActiveSpan('async', (span) => {
          span.end();
          return Promise.resolve(7);
        }),
      ).resolves.toBe(7);
      expect(() =>
        tracer.startActiveSpan('error', () => {
          throw new Error('application error');
        }),
      ).toThrow('application error');
    } finally {
      if (previous === undefined)
        delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previous;
    }
  });
});
