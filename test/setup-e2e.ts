/**
 * Setup de Jest para e2e.
 * - Fuerza NODE_ENV=test para que AppModule use ConfigModule con ignoreEnvFile.
 * - Carga .env para que TEST_DATABASE_URL esté disponible sin exportarla a mano.
 */
process.env.NODE_ENV = 'test';
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv/config');
