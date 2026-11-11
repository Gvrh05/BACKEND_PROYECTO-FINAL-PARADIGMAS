// Read-only checks. No credentials, login, rooms or administrative data required.
const { io } = require('socket.io-client');
const web = process.env.PUBLIC_WEB_URL || 'https://project-deploy-985df3.netlify.app';
const auth = process.env.PUBLIC_AUTH_URL || 'https://authproyecto-final-paradigmas-production.up.railway.app';
const api = process.env.PUBLIC_API_URL || 'https://backendproyecto-final-paradigmas-production.up.railway.app';
let failures = 0;
async function check(label, action) {
  try { await action(); console.log(`PASS ${label}`); }
  catch (error) { failures++; console.error(`FAIL ${label}: ${error.message}`); }
}
async function preflight(url) {
  const response = await fetch(url, { method: 'OPTIONS', headers: { Origin: web, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' }, signal: AbortSignal.timeout(10000) });
  if (response.headers.get('access-control-allow-origin') !== web) throw new Error(`Netlify no permitido; Allow-Origin=${response.headers.get('access-control-allow-origin') || '(ausente)'}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
async function main() {
  await check('Auth health', async () => {
    const response = await fetch(`${auth}/auth/health`, { signal: AbortSignal.timeout(10000) });
    const body = await response.json(); if (!response.ok || body.service !== 'auth') throw new Error('Auth health no válido');
  });
  await check('Backend health', async () => {
    const response = await fetch(`${api}/kahoot-api/health`, { signal: AbortSignal.timeout(10000) });
    const body = await response.json(); if (!response.ok || body.service !== 'kahoot-api') throw new Error('Backend health no válido');
  });
  await check('Auth CORS Netlify', () => preflight(`${auth}/auth/login`));
  await check('Backend CORS Netlify', () => preflight(`${api}/kahoot-api/game-sessions`));
  await check('Netlify bundle conectado a Auth y Backend', async () => {
    const html = await (await fetch(web, { signal: AbortSignal.timeout(10000) })).text();
    const script = html.match(/<script[^>]+src="([^"]+\.js)"/);
    if (!script) throw new Error('No se encontró el bundle principal');
    const bundle = await (await fetch(new URL(script[1], web), { signal: AbortSignal.timeout(10000) })).text();
    for (const [remote, route, expected] of [[auth, '/auth/health', 'auth'], [api, '/kahoot-api/health', 'kahoot-api']]) {
      if (bundle.includes(new URL(remote).host)) continue;
      const response = await fetch(web + route, { signal: AbortSignal.timeout(10000) });
      const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
      if (!response.ok || body?.service !== expected) throw new Error(`El bundle no apunta a ${expected} público y ${route} en Netlify no es su API. Redesplegar con VITE_API_URL, VITE_AUTH_API_URL y VITE_WS_URL.`);
    }
  });
  await check('Netlify deep-link SPA', async () => {
    const response = await fetch(`${web}/join/deployment-readonly-check`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Falta fallback SPA');
  });
  await check('Socket.IO WebSocket transport', () => new Promise((resolve, reject) => {
    const socket = io(api, { transports: ['websocket'], reconnection: false, timeout: 10000, extraHeaders: { Origin: web }, autoConnect: false });
    const timer = setTimeout(() => { socket.disconnect(); reject(new Error('Timeout WebSocket')); }, 12000);
    socket.once('connect', () => { clearTimeout(timer); socket.disconnect(); resolve(); });
    socket.once('connect_error', () => { clearTimeout(timer); socket.disconnect(); reject(new Error('No se estableció transporte WebSocket')); });
    socket.connect();
  }));
  console.log('Estos checks NO demuestran recepción en Grafana Cloud ni login/juego completos.');
  process.exitCode = failures ? 1 : 0;
}
main().catch(() => { console.error('No se pudo completar la verificación pública'); process.exitCode = 1; });
