// Manual smoke-test helpers: real AppModule + real local Postgres, never seed.
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { ConfigModule } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { Client } = require('pg');

const quizId = '7ac9810a-b36c-4c85-8b58-b296434f0110';

async function loadLocalConfig() {
  await ConfigModule.forRoot();
  const url = new URL(process.env.DATABASE_URL);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    (url.port || '5432') !== '5432'
  ) {
    throw new Error('La prueba manual exige Postgres local en puerto 5432');
  }
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const result = await db.query(
      'SELECT id FROM quizzes WHERE id = $1 AND author_id = $2',
      [quizId, '7ac9810a-b36c-4c85-8b58-b296434f0100'],
    );
    if (result.rowCount !== 1)
      throw new Error(
        'No existe el quiz de demo del host; ejecuta el seed manualmente',
      );
  } finally {
    await db.end();
  }
  console.log(
    'Postgres real: localhost:5432; quiz del seed presente; sin mocks ni ejecución de seed.',
  );
}

function token(sub) {
  return new JwtService().sign(
    { sub, name: sub === 'test-host-id' ? 'Host demo' : 'Player demo' },
    {
      secret: process.env.JWT_SECRET,
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER || undefined,
      audience: process.env.JWT_AUDIENCE || undefined,
      expiresIn: '5m',
    },
  );
}

async function startBackend() {
  // Allocate a free port rather than replacing the user's running dev server.
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('El backend no arrancó en 90s')),
        90000,
      );
      child.once('error', reject);
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Backend terminó al arrancar: ${code}`));
      });
      child.stdout.on('data', (data) => {
        if (data.toString().includes('Application running on:')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  } catch (error) {
    child.kill();
    throw error;
  }
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null) return;
      await new Promise((resolve) => {
        child.once('exit', resolve);
        child.kill();
      });
    },
  };
}

async function assertPersisted(roomCode, startedAt) {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows } = await db.query(
      'SELECT "roomCode", status, "startedAt" FROM game_sessions WHERE "roomCode" = $1',
      [roomCode],
    );
    if (
      rows.length !== 1 ||
      rows[0].status !== 'IN_PROGRESS' ||
      rows[0].startedAt.toISOString() !== startedAt
    ) {
      throw new Error('La transición no coincide con la fila persistida');
    }
    console.log(`BD confirmada: ${JSON.stringify(rows[0])}`);
  } finally {
    await db.end();
  }
}

module.exports = {
  loadLocalConfig,
  token,
  startBackend,
  assertPersisted,
  quizId,
};
