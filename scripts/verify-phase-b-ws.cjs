// Manual Socket.IO smoke test against real AppModule/Postgres. Never runs seed.
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const {
  loadLocalConfig,
  token,
  startBackend,
  assertPersisted,
  quizId,
} = require('./phase-b-local.cjs');

function nextEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, receive);
      reject(new Error(`Timeout esperando ${event}`));
    }, 8000);
    function receive(payload) {
      clearTimeout(timeout);
      socket.off(event, receive);
      resolve(payload);
    }
    socket.on(event, receive);
  });
}

async function main() {
  await loadLocalConfig();
  const backend = await startBackend();
  const hostToken = token('test-host-id');
  const playerToken = token('phase-b-ws-player');
  const sockets = [];
  try {
    const response = await fetch(`${backend.base}/kahoot-api/game-sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hostToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quizId }),
    });
    assert.equal(response.status, 201);
    const { roomCode } = await response.json();
    console.log(`Sala WS creada por REST: ${roomCode}`);
    async function connect(jwt, label) {
      const socket = io(`${backend.base}/game`, {
        autoConnect: false,
        auth: { token: jwt },
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);
      const connected = nextEvent(socket, 'connect');
      socket.connect();
      await connected;
      console.log(`${label}: connect /game con JWT HS256`);
      const snapshot = nextEvent(socket, 'session-state');
      socket.emit('join-session', { roomCode });
      const state = await snapshot;
      assert.equal(state.roomCode, roomCode);
      console.log(`${label}: session-state ${JSON.stringify(state)}`);
      return socket;
    }
    const host = await connect(hostToken, 'host');
    const player = await connect(playerToken, 'player');
    const denied = nextEvent(player, 'error');
    player.emit('start-session', { roomCode });
    const error = await denied;
    assert.equal(error.code, 'FORBIDDEN');
    console.log(`player: error ${JSON.stringify(error)}`);
    const hostStarted = nextEvent(host, 'session-started');
    const playerStarted = nextEvent(player, 'session-started');
    host.emit('start-session', { roomCode });
    const [a, b] = await Promise.all([hostStarted, playerStarted]);
    assert.equal(a.sessionId, roomCode);
    assert.deepEqual(a, b);
    console.log(`host: session-started ${JSON.stringify(a)}`);
    console.log(`player: session-started ${JSON.stringify(b)}`);
    await assertPersisted(roomCode, a.startedAt);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await backend.stop();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
