/** Integration seam for the OTel teammate. No SDK, exporter or network I/O.
 * This stub remains no-op even when an endpoint is configured, until replaced.
 */
export interface Span {
  end(): void;
  recordException(error: unknown): void;
  setStatus(status: { code: number; message?: string }): void;
}

const noop = () => undefined;
const span: Span = { end: noop, recordException: noop, setStatus: noop };
const instrument = { add: noop, record: noop };

export function getTracer(_name: string) {
  void _name;
  return {
    startActiveSpan<T>(
      _spanName: string,
      callback: (activeSpan: Span) => T,
    ): T {
      return callback(span);
    },
  };
}

export function getMeter(_name: string) {
  void _name;
  return {
    createCounter: (_instrumentName: string) => {
      void _instrumentName;
      return {
        add: (value: number, attributes?: Record<string, string>) => {
          void value;
          void attributes;
          instrument.add();
        },
      };
    },
    createGauge: (_instrumentName: string) => {
      void _instrumentName;
      return {
        record: (value: number, attributes?: Record<string, string>) => {
          void value;
          void attributes;
          instrument.record();
        },
      };
    },
    createHistogram: (_instrumentName: string) => {
      void _instrumentName;
      return {
        record: (value: number, attributes?: Record<string, string>) => {
          void value;
          void attributes;
          instrument.record();
        },
      };
    },
  };
}
