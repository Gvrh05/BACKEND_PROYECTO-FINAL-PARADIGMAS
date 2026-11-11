import { FrontendHealthService } from './frontend-health.service';

let observe:
  ((result: { observe: (value: number) => void }) => void) | undefined;
const remove = jest.fn();
jest.mock('../tracing', () => ({
  shutdownTelemetry: () => Promise.resolve(),
  getMeter: () => ({
    createObservableGauge: () => ({
      addCallback: (callback: typeof observe) => {
        observe = callback;
      },
      removeCallback: remove,
    }),
  }),
}));

describe('Frontend health telemetry', () => {
  const original = process.env.FRONTEND_HEALTH_URL;
  afterEach(() => {
    jest.restoreAllMocks();
    observe = undefined;
    if (original === undefined) delete process.env.FRONTEND_HEALTH_URL;
    else process.env.FRONTEND_HEALTH_URL = original;
  });
  it('records availability, failure and recovery without labeling target URLs', async () => {
    process.env.FRONTEND_HEALTH_URL = 'https://frontend.example';
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('ok'));
    const service = new FrontendHealthService();
    service.onModuleInit();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const result = { observe: jest.fn() };
    observe?.(result);
    expect(result.observe).toHaveBeenLastCalledWith(1);
    fetcher.mockRejectedValueOnce(new Error('offline'));
    await service.check();
    observe?.(result);
    expect(result.observe).toHaveBeenLastCalledWith(0);
    fetcher.mockResolvedValueOnce(new Response('ok'));
    await service.check();
    observe?.(result);
    expect(result.observe).toHaveBeenLastCalledWith(1);
    service.onModuleDestroy();
    expect(remove).toHaveBeenCalled();
  });
  it('is disabled without a URL and rejects credentials and non-HTTP targets', () => {
    delete process.env.FRONTEND_HEALTH_URL;
    const disabled = new FrontendHealthService();
    disabled.onModuleInit();
    expect(observe).toBeUndefined();
    disabled.onModuleDestroy();
    for (const url of [
      'file:///etc/passwd',
      'https://user:pass@example.com',
      'https://example.com?token=private',
    ]) {
      process.env.FRONTEND_HEALTH_URL = url;
      expect(() => new FrontendHealthService().onModuleInit()).toThrow();
    }
  });
});
