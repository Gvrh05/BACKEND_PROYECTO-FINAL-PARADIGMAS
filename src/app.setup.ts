import type { INestApplication } from '@nestjs/common';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { APP_CONFIG } from './shared/utils/constants';

/** Apply the same HTTP configuration in production and integration tests. */
export function configureApp(app: INestApplication): void {
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    credentials: true,
  });
  app.setGlobalPrefix(APP_CONFIG.GLOBAL_PREFIX);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
}
