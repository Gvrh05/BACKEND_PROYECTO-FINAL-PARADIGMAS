// Read-only verification of demo metadata and all ten publicly served PNGs.
require('dotenv').config();
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createHash } = require('node:crypto');
async function main() {
  const api = (process.env.VERIFY_API_URL || 'http://localhost:43000/kahoot-api').replace(/\/$/, '');
  const auth = (process.env.VERIFY_AUTH_URL || 'http://localhost:43001/auth').replace(/\/$/, '');
  const response = await fetch(`${auth}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: process.env.DEMO_USER_USERNAME || 'profesor_test', password: process.env.DEMO_USER_PASSWORD }) });
  assert.equal(response.status, 200, 'Demo login failed');
  const { accessToken } = await response.json();
  const headers = { authorization: `Bearer ${accessToken}` };
  const list = await (await fetch(`${api}/quizzes`, { headers })).json();
  const summary = list.find((quiz) => quiz.isDemo);
  assert(summary, 'Demo missing');
  const detail = await (await fetch(`${api}/quizzes/${summary.id}`, { headers })).json();
  assert.equal(detail.questions.length, 10);
  const hashes = [];
  for (const question of detail.questions) {
    assert(question.imageUrl, 'Missing demo question image');
    const image = await fetch(new URL(question.imageUrl, api));
    assert.equal(image.status, 200);
    assert(image.headers.get('content-type')?.includes('image/png'));
    const bytes = Buffer.from(await image.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'png');
    assert(metadata.width > 0 && metadata.height > 0);
    hashes.push(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(new Set(hashes).size, 10, 'Each demo question should have its own illustration');
  const deletion = await fetch(`${api}/quizzes/${summary.id}`, { method: 'DELETE', headers });
  assert.equal(deletion.status, 403, 'Demo protection must remain active');
  console.log('PASS demo: 10 distinct PNG images served correctly; questions preserved and demo deletion forbidden.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
