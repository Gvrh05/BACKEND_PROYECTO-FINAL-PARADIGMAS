const { randomBytes } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const dotenv = require('dotenv');

const root = resolve(__dirname, '..');
const envPath = resolve(root, '.env');
if (!existsSync(envPath)) {
  const values = {
    POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    AUTH_POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    JWT_SECRET: randomBytes(48).toString('hex'),
    DEMO_USER_PASSWORD: randomBytes(18).toString('hex'),
  };
  let content = readFileSync(resolve(root, '.env.example'), 'utf8');
  for (const [key, value] of Object.entries(values)) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  }
  content = content.replace(/^DATABASE_URL=.*$/m,
    `DATABASE_URL=postgresql://kahoot:${values.POSTGRES_PASSWORD}@localhost:5432/kahoot_db?schema=public`);
  content = content.replace(/^TEST_DATABASE_URL=.*$/m,
    `TEST_DATABASE_URL=postgresql://kahoot:${values.POSTGRES_PASSWORD}@localhost:5432/kahoot_punto3_test?schema=public`);
  writeFileSync(envPath, content, { flag: 'wx' });
  console.log('Creado kahoot-api/.env con secretos locales aleatorios (no se imprimen).');
} else {
  console.log('Se conserva kahoot-api/.env existente.');
}

const config = dotenv.parse(readFileSync(envPath));
const authEnv = resolve(root, '../auth/.env');
if (!existsSync(authEnv)) {
  const authConfig = {
    PORT: config.AUTH_PORT || '3001',
    NODE_ENV: 'development',
    CORS_ORIGIN: config.CORS_ORIGIN || 'http://localhost:5173',
    DB_HOST: 'localhost',
    DB_PORT: config.AUTH_POSTGRES_PORT || '5433',
    DB_USER: config.AUTH_POSTGRES_USER || 'auth',
    DB_PASSWORD: config.AUTH_POSTGRES_PASSWORD,
    DB_NAME: config.AUTH_POSTGRES_DB || 'auth_db',
    JWT_SECRET: config.JWT_SECRET,
    JWT_AUDIENCE: config.JWT_AUDIENCE || 'kahoot-api',
    JWT_ISSUER: config.JWT_ISSUER || '',
  };
  if (Object.values(authConfig).some((value) => value === undefined)) {
    throw new Error('Faltan AUTH_POSTGRES_PASSWORD o JWT_SECRET en kahoot-api/.env.');
  }
  writeFileSync(authEnv, Object.entries(authConfig)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { flag: 'wx' });
  console.log('Creado auth/.env compatible con Compose para ejecución local.');
} else {
  console.log('Se conserva auth/.env existente.');
}
