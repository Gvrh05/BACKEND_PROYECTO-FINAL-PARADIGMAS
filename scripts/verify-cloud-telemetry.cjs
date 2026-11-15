// Real OTLP/protobuf export to a loopback fixture, never to Grafana or a database.
// Run pnpm build in Auth and Backend first. Does not read or print Cloud credentials.
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { gunzipSync } = require('node:zlib');

async function main() {
  const packets = [];
  const receiver = http.createServer((req, res) => {
    if (req.url === '/frontend') { res.writeHead(200); res.end('frontend fixture'); return; }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const data = Buffer.concat(chunks);
      packets.push({ path: req.url, contentType: req.headers['content-type'], authorization: req.headers.authorization,
        data: req.headers['content-encoding'] === 'gzip' ? gunzipSync(data) : data });
      res.writeHead(200, { 'content-type': 'application/x-protobuf' });
      res.end();
    });
  });
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${receiver.address().port}`;
  const env = { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: endpoint, OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: `${endpoint}/v1/metrics`,
    OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Basic%20fixture-only', OTEL_EXPORTER_OTLP_METRICS_HEADERS: 'Authorization=Basic%20fixture-only',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf', OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: 'http/protobuf',
    OTEL_METRICS_EXPORTER: 'otlp', OTEL_TRACES_EXPORTER: 'none', OTEL_LOGS_EXPORTER: 'none',
    OTEL_METRIC_EXPORT_INTERVAL: '500', OTEL_METRIC_EXPORT_TIMEOUT: '400', OTEL_DEPLOYMENT_ENVIRONMENT: 'telemetry-fixture', OTEL_NODE_RESOURCE_DETECTORS: 'env,host,os',
    FRONTEND_HEALTH_URL: `${endpoint}/frontend` };
  const authScript = `
    const {observeHttp}=require('./dist/telemetry');
    const express=require('node:module').createRequire(require.resolve('@nestjs/platform-express'))('express');
    const app=express(); app.use(observeHttp);
    app.post('/auth/login',(req,res)=>res.status(req.headers['x-fixture-fail']?401:200).end());
    const server=app.listen(0,'127.0.0.1',async()=>{
      const url='http://127.0.0.1:'+server.address().port+'/auth/login?username=private-fixture-name';
      await fetch(url,{method:'POST',body:'private-fixture-password'});
      await fetch(url,{method:'POST',headers:{'x-fixture-fail':'true'}});
      setTimeout(()=>{server.close(()=>process.exit(0));},2500);
    });`;
  const apiScript = `
    const {getMeter,shutdownTelemetry}=require('./dist/tracing');
    const {FrontendHealthService}=require('./dist/shared/frontend-health.service');
    const monitor=new FrontendHealthService(); monitor.onModuleInit();
    getMeter('game-session').createCounter('game_answers').add(1,{outcome:'accepted'});
    setTimeout(async()=>{await shutdownTelemetry();monitor.onModuleDestroy();},2500);`;
  const children = [];
  function run(script, cwd, service) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', script], { cwd, env: { ...env, OTEL_SERVICE_NAME: service }, stdio: ['ignore', 'ignore', 'pipe'] });
      children.push(child);
      let stderr = '';
      child.stderr.on('data', (data) => { stderr += data.toString(); });
      const timeout = setTimeout(() => { child.kill(); reject(new Error(`${service}: emitter timeout`)); }, 15000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0 || /Error:/.test(stderr)) {
          const detail = stderr.match(/(?:Error|TypeError|ReferenceError):[^\r\n]+/)?.[0] || 'check local build';
          reject(new Error(`${service}: emitter failed (exit ${code}); ${detail}`));
        } else resolve();
      });
    });
  }
  try {
    await Promise.all([
      run(authScript, path.resolve(__dirname, '../../AUTH_PROYECTO-FINAL-PARADIGMAS'), 'profelink-auth'),
      run(apiScript, path.resolve(__dirname, '..'), 'kahoot-game-session'),
    ]);
    const auth = packets.filter((packet) => packet.data.includes(Buffer.from('profelink-auth')));
    const api = packets.filter((packet) => packet.data.includes(Buffer.from('kahoot-game-session')));
    assert(auth.length && api.length, 'Both service resources must reach the receiver');
    assert(auth.some((packet) => packet.data.includes(Buffer.from('auth_http_requests'))), 'Auth HTTP counter missing');
    assert(api.some((packet) => packet.data.includes(Buffer.from('game_answers'))), 'Game counter missing');
    assert(api.some((packet) => packet.data.includes(Buffer.from('frontend_http_up'))), 'Frontend probe gauge missing');
    for (const packet of packets) {
      assert.equal(packet.path, '/v1/metrics');
      assert.equal(packet.contentType, 'application/x-protobuf');
      assert.equal(packet.authorization, 'Basic fixture-only');
      assert(packet.data.includes(Buffer.from('telemetry-fixture')));
      const privateIndex = packet.data.indexOf(Buffer.from('private-fixture'));
      assert(privateIndex === -1, `Private fixture leaked into OTLP near: ${packet.data.toString('utf8').slice(Math.max(0, privateIndex - 80), privateIndex + 80)}`);
    }
    console.log('PASS OTLP/protobuf: Auth HTTP + game answers + frontend availability; service/environment resources and encoded auth header; no private labels.');
    console.log('Local receiver only: Grafana Cloud ingestion still requires Railway secrets and redeploy.');
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    await new Promise((resolve) => receiver.close(resolve));
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
