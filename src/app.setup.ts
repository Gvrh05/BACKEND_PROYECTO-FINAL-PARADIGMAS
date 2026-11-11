import type { INestApplication } from '@nestjs/common';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { APP_CONFIG } from './shared/utils/constants';
import { static as expressStatic, type Request, type Response } from 'express';
import { resolve } from 'node:path';

/** Apply the same HTTP configuration in production and integration tests. */
export function configureApp(app: INestApplication): void {
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
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
  const docs = resolve(__dirname, '../docs');
  const reference = `/${APP_CONFIG.GLOBAL_PREFIX}/docs`;
  const http = app.getHttpAdapter();
  http.get(reference, (_request: Request, response: Response) =>
    response.sendFile('index.html', { root: docs }),
  );
  http.get(
    `${reference}/openapi.json`,
    (_request: Request, response: Response) =>
      response.sendFile('openapi.json', { root: docs }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
}
