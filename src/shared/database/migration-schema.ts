import type { QueryRunner } from 'typeorm';

/** Identifiers cannot be parameterized; restrict and quote the configured schema. */
export function migrationSchema(runner: QueryRunner): string {
  const options = runner.connection.options;
  const schema = ('schema' in options && options.schema) || 'public';
  if (typeof schema !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error('Schema inválido para migraciones');
  }
  return `"${schema}"`;
}
