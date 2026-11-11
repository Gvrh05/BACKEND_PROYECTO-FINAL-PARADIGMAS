// Explicit opt-in integration command. Never invoked by main, Compose or seed.
const { ConfigModule } = require('@nestjs/config');
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');

async function main() {
  await ConfigModule.forRoot();
  let testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    if (!process.env.DATABASE_URL)
      throw new Error('Configure local DATABASE_URL or TEST_DATABASE_URL');
    const source = new URL(process.env.DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(source.hostname))
      throw new Error('Automatic test DB preparation is local-only');
    const admin = new Client({ connectionString: source.toString() });
    await admin.connect();
    try {
      const exists = await admin.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        ['kahoot_punto3_test'],
      );
      if (!exists.rowCount) {
        try {
          await admin.query('CREATE DATABASE "kahoot_punto3_test"');
        } catch (error) {
          if (error.code !== '42P04') throw error;
        }
      }
    } finally {
      await admin.end();
    }
    source.pathname = '/kahoot_punto3_test';
    testUrl = source.toString();
  }
  const target = new URL(testUrl);
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname !== '/kahoot_punto3_test'
  ) {
    throw new Error('Use only the dedicated local database kahoot_punto3_test');
  }
  console.log(
    'Real Postgres integration: kahoot_punto3_test; random isolated schema, no demo seed or dev-data deletion.',
  );
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      '--config',
      './test/jest-persistence.json',
      '--runInBand',
    ],
    {
      env: { ...process.env, NODE_ENV: 'test', TEST_DATABASE_URL: testUrl },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main().catch(() => {
  console.error(
    'Persistence verification failed. Check local Postgres permissions/configuration; no credentials are printed.',
  );
  process.exitCode = 1;
});
