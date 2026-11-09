import { getDatabaseOptions } from './database.config';

describe('getDatabaseOptions', () => {
  const url = 'postgresql://test:test@localhost:55432/quiz_test';

  it('requires an explicit PostgreSQL URL without leaking credentials', () => {
    expect(() => getDatabaseOptions({})).toThrow('DATABASE_URL es obligatoria');
    expect(() => getDatabaseOptions({ DATABASE_URL: 'invalid' })).toThrow(
      'DATABASE_URL debe ser una URL PostgreSQL válida',
    );
    expect(() =>
      getDatabaseOptions({ DATABASE_URL: 'mysql://host/db' }),
    ).toThrow('DATABASE_URL debe usar postgres:// o postgresql://');
  });

  it('uses explicit migrations and never synchronizes the schema', () => {
    const options = getDatabaseOptions({ DATABASE_URL: url });
    expect(options).toMatchObject({
      type: 'postgres',
      schema: 'public',
      synchronize: false,
      migrationsRun: false,
      logging: false,
    });
    expect(options.entities).toHaveLength(1);
    expect(options.migrations).toHaveLength(1);
  });

  it('extracts the schema parameter without losing connection parameters', () => {
    const options = getDatabaseOptions({
      DATABASE_URL: `${url}?schema=authoring&application_name=kahoot`,
    });
    expect(options.schema).toBe('authoring');
    expect(new URL(options.url!).searchParams.has('schema')).toBe(false);
    expect(new URL(options.url!).searchParams.get('application_name')).toBe(
      'kahoot',
    );
  });

  it('rejects an unsafe schema identifier', () => {
    expect(() =>
      getDatabaseOptions({ DATABASE_URL: `${url}?schema=bad%3Bschema` }),
    ).toThrow('El schema de DATABASE_URL no es válido');
  });
});
