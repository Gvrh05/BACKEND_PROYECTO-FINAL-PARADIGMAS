import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  OnApplicationShutdown,
} from '@nestjs/common';
import { getMeter, shutdownTelemetry } from '../tracing';

@Injectable()
export class FrontendHealthService
  implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private controller?: AbortController;
  private up = 0;
  private checked = false;
  private stopped = false;
  private target?: URL;
  private readonly gauge = getMeter('frontend-health').createObservableGauge(
    'frontend_http_up',
    {
      description:
        '1 when the configured frontend responds with HTTP 2xx, otherwise 0',
    },
  );
  private readonly observe = (result: { observe(value: number): void }) => {
    if (this.checked) result.observe(this.up);
  };

  onModuleInit() {
    const configured = process.env.FRONTEND_HEALTH_URL?.trim();
    if (!configured) return;
    const url = new URL(configured);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'FRONTEND_HEALTH_URL debe ser HTTP(S), sin credenciales, query ni fragmento',
      );
    }
    this.target = url;
    this.gauge.addCallback(this.observe);
    void this.check();
    this.timer = setInterval(() => {
      void this.check();
    }, 10000);
    this.timer.unref();
  }

  async check() {
    if (!this.target || this.controller || this.stopped) return;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    timeout.unref();
    try {
      const response = await fetch(this.target, {
        signal: controller.signal,
        redirect: 'error',
      });
      this.up = Number(response.ok);
      await response.body?.cancel();
    } catch {
      this.up = 0;
    } finally {
      clearTimeout(timeout);
      this.checked = true;
      this.controller = undefined;
    }
  }

  onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.timer);
    this.controller?.abort();
    this.gauge.removeCallback(this.observe);
  }
  onApplicationShutdown() {
    return shutdownTelemetry();
  }
}
