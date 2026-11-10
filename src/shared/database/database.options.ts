import { ConfigService } from '@nestjs/config';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { getDatabaseOptions } from './database.config';

/** Shared by Nest and the manual seed. Keep DATABASE_URL unchanged. */
export function databaseOptions(
  config: ConfigService,
): PostgresConnectionOptions {
  return getDatabaseOptions({
    DATABASE_URL: config.getOrThrow<string>('DATABASE_URL'),
  });
}
