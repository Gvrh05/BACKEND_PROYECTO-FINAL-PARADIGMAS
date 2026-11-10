import './tracing';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_CONFIG } from './shared/utils/constants';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const port = process.env.PORT ?? APP_CONFIG.DEFAULT_PORT;
  await app.listen(port);
  logger.log(
    `Application running on: http://localhost:${port}/${APP_CONFIG.GLOBAL_PREFIX}`,
  );
}
void bootstrap().catch((error: unknown) => {
  Logger.error(
    error instanceof Error ? error.message : 'No se pudo iniciar la API',
  );
  process.exit(1);
});
