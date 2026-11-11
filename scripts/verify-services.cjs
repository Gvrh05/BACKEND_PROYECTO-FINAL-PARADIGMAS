// Smoke test against the running local stack. Does not create or delete data.
require('dotenv').config();
const { io } = require('socket.io-client');

async function check(response, label, expected = 200) {
  if (response.status !== expected) {
    throw new Error(`${label}: se esperaba HTTP ${expected}, recibido ${response.status}`);
  }
  console.log(`OK ${label}: HTTP ${response.status}`);
  return response;
}

async function main() {
  const api = (process.env.VERIFY_API_URL || 'http://localhost:3000/kahoot-api').replace(/\/$/, '');
  const auth = (process.env.VERIFY_AUTH_URL || 'http://localhost:3001/auth').replace(/\/$/, '');
  const frontend = process.env.VERIFY_FRONTEND_URL || 'http://localhost:5173/';
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password) throw new Error('Configura DEMO_USER_PASSWORD en .env');

  await check(await fetch(frontend), 'frontend');
  await check(await fetch(`${auth}/health`), 'auth health');
  await check(await fetch(`${api}/health`), 'api health');
  await check(await fetch(`${api}/quizzes`), 'API sin token', 401);

  const login = await check(await fetch(`${auth}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: process.env.DEMO_USER_USERNAME || 'profesor_test',
      password,
    }),
  }), 'login demo');
  const { accessToken } = await login.json();
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('Auth no devolvió accessToken');
  await check(await fetch(`${api}/quizzes`, {
    headers: { authorization: `Bearer ${accessToken}` },
  }), 'API con token de Auth');

  await new Promise((resolve, reject) => {
    const socket = io(`${new URL(api).origin}/game`, {
      auth: { token: accessToken },
      reconnection: false,
      timeout: 10000,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket.IO: no respondió a la prueba autenticada'));
    }, 10000);
    socket.once('connect', () => socket.emit('join-session', { roomCode: 'invalid' }));
    socket.once('error', (error) => {
      clearTimeout(timer);
      socket.disconnect();
      if (error?.code !== 'INVALID_ROOM_CODE') {
        reject(new Error(`Socket.IO: respuesta inesperada ${error?.code || 'desconocida'}`));
        return;
      }
      console.log('OK Socket.IO: token verificado y mensaje procesado');
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error(`Socket.IO: ${error.message}`));
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falló la verificación');
  process.exitCode = 1;
});
