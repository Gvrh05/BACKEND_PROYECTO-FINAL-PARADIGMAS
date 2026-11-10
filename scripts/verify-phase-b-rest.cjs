// Run manually after pnpm build. Tokens remain in memory, never printed.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  loadLocalConfig,
  token,
  startBackend,
  assertPersisted,
  quizId,
} = require('./phase-b-local.cjs');

async function main() {
  await loadLocalConfig();
  const backend = await startBackend();
  const host = token('test-host-id');
  const player = token('phase-b-rest-player');
  function curl(method, route, jwt, body) {
    const args = [
      '--silent',
      '--show-error',
      '--max-time',
      '15',
      '-X',
      method,
      `${backend.base}/kahoot-api${route}`,
      '-H',
      `Authorization: Bearer ${jwt}`,
      '--write-out',
      '\nHTTP_STATUS:%{http_code}',
    ];
    if (body !== undefined)
      args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
    const result = spawnSync(
      process.platform === 'win32' ? 'curl.exe' : 'curl',
      args,
      {
        input: body === undefined ? undefined : JSON.stringify(body),
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    console.log(`${method} ${route}\n${result.stdout}`);
    const [json, status] = result.stdout.split('\nHTTP_STATUS:');
    return { body: JSON.parse(json), status: Number(status) };
  }
  try {
    const created = curl('POST', '/game-sessions', host, { quizId });
    assert.equal(created.status, 201);
    assert.match(created.body.roomCode, /^\d{6}$/);
    const code = created.body.roomCode;
    const available = curl('GET', '/game-sessions/available-quizzes', host);
    assert.equal(available.status, 200);
    assert(available.body.some((quiz) => quiz.id === quizId));
    const joined = curl('POST', `/game-sessions/${code}/join`, player, {
      name: 'Player curl',
    });
    assert.equal(joined.status, 201);
    assert.equal(joined.body.added, true);
    const started = curl('POST', `/game-sessions/${code}/start`, host);
    assert.equal(started.status, 200);
    assert.equal(started.body.status, 'IN_PROGRESS');
    const forbidden = curl('POST', `/game-sessions/${code}/start`, player);
    assert.equal(forbidden.status, 403);
    await assertPersisted(code, started.body.startedAt);
    const checks = [
      ['GET', '/game-sessions/available-quizzes', undefined, undefined, 401],
      ['POST', '/game-sessions', player, { quizId }, 403],
      ['GET', '/game-sessions/abc', host, undefined, 400],
      ['GET', '/game-sessions/000000', host, undefined, 404],
      ['POST', `/game-sessions/${code}/start`, host, undefined, 400],
    ];
    for (const [method, route, jwt, body, expected] of checks) {
      const response = await fetch(`${backend.base}/kahoot-api${route}`, {
        method,
        headers: {
          ...(jwt && { Authorization: `Bearer ${jwt}` }),
          ...(body && { 'Content-Type': 'application/json' }),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(response.status, expected);
      const error = await response.json();
      assert.equal(error.statusCode, expected);
      assert.equal(typeof error.path, 'string');
    }
    console.log(
      'Errores REST confirmados: sin JWT 401; quiz ajeno 403; código inválido 400; sala inexistente 404; inicio repetido 400.',
    );
  } finally {
    await backend.stop();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
