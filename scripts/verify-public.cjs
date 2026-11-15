// Read-only deployment check: no logins, accounts, quizzes or writes.
const assert = require('node:assert/strict');

async function verifyPublic(env = process.env) {
  function requiredUrl(key) {
    assert(env[key], `Configura ${key} con una URL pública (sin secretos).`);
    const url = new URL(env[key]);
    assert(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
      `${key} debe ser una URL HTTP(S) sin credenciales.`);
    return url.href.replace(/\/$/, '');
  }
  const frontend = requiredUrl('PUBLIC_FRONTEND_URL');
  const auth = requiredUrl('PUBLIC_AUTH_URL');
  const api = requiredUrl('PUBLIC_API_URL');
  const origin = new URL(frontend).origin;
  async function get(url, cors) {
    const response = await fetch(url, { headers: { Origin: origin }, signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
    if (cors) assert.equal(response.headers.get('access-control-allow-origin'), origin, `${url}: CORS no permite ${origin}`);
    return response;
  }
  const front = await get(frontend, false);
  assert(front.headers.get('content-type')?.includes('text/html'), 'Frontend no devuelve HTML');
  await front.body?.cancel();
  for (const [base, service] of [[auth, 'auth'], [api, 'kahoot-api']]) {
    const health = await get(`${base}/health`, true);
    assert(health.headers.get('content-type')?.includes('application/json'), `${base}/health devuelve HTML en vez de JSON`);
    assert.equal((await health.json()).service, service, 'Healthcheck apunta al servicio incorrecto');
    const docs = await get(`${base}/docs/openapi.json`, true);
    assert(docs.headers.get('content-type')?.includes('application/json'), `${base}/docs/openapi.json devuelve HTML`);
    assert((await docs.json()).openapi, 'Referencia OpenAPI inválida');
    const preflight = await fetch(`${base}/${service === 'auth' ? 'login' : 'quizzes'}`, {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
      signal: AbortSignal.timeout(15000),
    });
    assert(preflight.ok, `Preflight rechazado en ${base}`);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin, `Preflight CORS incorrecto en ${base}`);
    console.log(`OK ${service}: health, OpenAPI y CORS de ${origin}`);
  }
  // Engine.IO handshake validates the public transport, not game authorization.
  const transport = await get(`${new URL(api).origin}/socket.io/?EIO=4&transport=polling`, true);
  const packet = await transport.text();
  assert(packet.startsWith('0{') && JSON.parse(packet.slice(1)).sid, 'Socket.IO devuelve HTML o no tiene transporte Engine.IO');
  console.log('OK frontend y transporte Socket.IO; falta probar la partida autenticada desde dispositivos reales.');
}

module.exports = { verifyPublic };
if (require.main === module) {
  verifyPublic().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
