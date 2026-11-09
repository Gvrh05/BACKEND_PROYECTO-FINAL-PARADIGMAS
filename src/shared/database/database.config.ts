import { join } from 'node:path';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

/** Shared by Nest, the migration CLI and database verification scripts. */
export function getDatabaseOptions(
  env: NodeJS.ProcessEnv = process.env,
): PostgresConnectionOptions {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatoria');
  }

  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL debe ser una URL PostgreSQL válida');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL debe usar postgres:// o postgresql://');
  }

  const schema = url.searchParams.get('schema') ?? 'public';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error('El schema de DATABASE_URL no es válido');
  }
  // `schema` is a TypeORM option, not a node-postgres connection parameter.
  url.searchParams.delete('schema');

  return {
    type: 'postgres',
    url: url.toString(),
    schema,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    entities: [
      join(
        __dirname,
        '../../modules/quizzes/entities/*.entity{.ts,.js}',
      ).replace(/\\/g, '/'),
    ],
    migrations: [join(__dirname, 'migrations/*{.ts,.js}').replace(/\\/g, '/')],
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}
