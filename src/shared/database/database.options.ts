import { ConfigService } from '@nestjs/config';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

/** Shared by Nest and the manual seed. Keep DATABASE_URL unchanged. */
export function databaseOptions(
  config: ConfigService,
): PostgresConnectionOptions {
  return {
    type: 'postgres',
    url: config.getOrThrow<string>('DATABASE_URL'),
    schema: 'public',
    synchronize: config.get<string>('NODE_ENV') !== 'production',
  };
}
