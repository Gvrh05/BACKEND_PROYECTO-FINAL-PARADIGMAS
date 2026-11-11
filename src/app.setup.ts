import type { INestApplication } from '@nestjs/common';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { APP_CONFIG } from './shared/utils/constants';
import { static as expressStatic } from 'express';
import { resolve } from 'node:path';
import { corsOrigins } from './shared/cors';

/** Apply the same HTTP configuration in production and integration tests. */
export function configureApp(app: INestApplication): void {
  app.enableCors({
    origin: corsOrigins(),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    credentials: true,
  });
  app.use(
    '/uploads',
    expressStatic(resolve(process.env.UPLOADS_DEST || './uploads'), {
      dotfiles: 'deny',
      index: false,
      maxAge: 0,
    }),
  );
  app.setGlobalPrefix(APP_CONFIG.GLOBAL_PREFIX);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
}
