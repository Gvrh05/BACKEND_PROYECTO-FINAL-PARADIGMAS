// Integration acceptance against a running stack. Creates only uniquely named fixtures.
require('dotenv').config();
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { io } = require('socket.io-client');

const origin = (process.env.VERIFY_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
const sockets = [];
const created = [];
let master;
async function request(path, { method = 'GET', token, body, status = 200 } = {}) {
  const response = await fetch(origin + path, {
    method,
    headers: { ...(body && { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }) },
    ...(body && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.text();
  assert([status].flat().includes(response.status), `${method} ${path}: expected ${status}, got ${response.status}: ${data}`);
  return data ? JSON.parse(data) : undefined;
}
function event(socket, name, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Timed out waiting for ${name}`)); }, timeout);
    function receive(payload) { clearTimeout(timer); resolve(payload); }
    socket.once(name, receive);
  });
}
async function connect(auth) {
  const socket = io(origin + '/game', { auth, autoConnect: false, reconnection: false, timeout: 10000 });
  sockets.push(socket);
  const connected = event(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}
async function command(socket, name, payload, response) {
  const pending = event(socket, response);
  socket.emit(name, payload);
  return pending;
}
async function login(username, password) {
  return request('/auth/login', { method: 'POST', body: { username, password } });
}
async function main() {
  master = (await login(process.env.DEMO_USER_USERNAME || 'profesor_test', process.env.DEMO_USER_PASSWORD)).accessToken;
  const profile = await request('/auth/me', { token: master });
  assert.equal(profile.role, 'MASTER');
  assert.equal(profile.isSystem, true);
  await request(`/auth/users/${profile.id}`, { method: 'PATCH', token: master, body: { active: false }, status: 403 });
  await request('/auth/register', { method: 'POST', body: { username: 'forbidden', password: 'forbidden123', role: 'MASTER' }, status: 400 });
  const suffix = randomBytes(4).toString('hex');
  const password = randomBytes(20).toString('hex');
  const teacher = await request('/auth/users', {
    method: 'POST', token: master, body: { username: `qa_${suffix}`, password }, status: 201,
  });
  created.push(teacher);
  const registration = { username: `qb_${suffix}`, password };
  const registered = await request('/auth/register', { method: 'POST', body: registration, status: 201 });
  created.push(registered);
  assert.equal(registered.role, 'PROFESOR');
  assert(!registered.accessToken && !registered.passwordHash);
  await request('/auth/register', { method: 'POST', body: registration, status: 409 });
  const professor = (await login(created[0].username, password)).accessToken;
  const other = (await login(created[1].username, password)).accessToken;
  await request('/auth/users', { token: professor, status: 403 });
  await request('/auth/users', { token: master });
  const quizzes = await request('/kahoot-api/quizzes', { token: master });
  const demo = quizzes.find((quiz) => quiz.isDemo);
  assert(demo, 'Demo seed must exist');
  for (const token of [master, professor]) {
    await request(`/kahoot-api/quizzes/${demo.id}`, { token });
    await request(`/kahoot-api/quizzes/${demo.id}`, { method: 'DELETE', token, status: [403, 404] });
    await request(`/kahoot-api/quizzes/${demo.id}`, { method: 'PATCH', token, body: { title: 'Forbidden' }, status: [403, 404] });
  }
  const quiz = await request('/kahoot-api/quizzes', { method: 'POST', token: professor, body: { title: `Acceptance ${suffix}` }, status: 201 });
  const question = await request(`/kahoot-api/quizzes/${quiz.id}/questions`, {
    method: 'POST', token: professor, status: 201,
    body: { kind: 'TRUE_FALSE', questionText: 'El agua es una sustancia.', timeLimitSeconds: 6,
      options: [{ text: 'Verdadero', isCorrect: true }, { text: 'Falso', isCorrect: false }] },
  });
  for (const token of [master, other]) {
    await request(`/kahoot-api/quizzes/${quiz.id}`, { token, status: 404 });
  }
  const room = await request('/kahoot-api/game-sessions', { method: 'POST', token: professor, body: { quizId: quiz.id }, status: 201 });
  assert(room.invitationId && room.roomCode);
  const pinJoin = await request(`/kahoot-api/game-sessions/${room.roomCode}/join`, {
    method: 'POST', token: other, body: {}, status: 201,
  });
  assert.equal(pinJoin.player.userId, registered.id);
  const pinPlayer = await connect({ token: other });
  const pinLobby = await command(pinPlayer, 'join-session', { roomCode: room.roomCode }, 'session-state');
  assert(pinLobby.participants.some((participant) => participant.userId === registered.id && participant.connected));
  const invitation = `/kahoot-api/public/invitations/${room.invitationId}`;
  const metadata = await request(invitation);
  assert.equal(metadata.roomCode, room.roomCode);
  assert(!metadata.quizId && !metadata.hostId && !metadata.questions);
  const guest = await request(`${invitation}/participants`, { method: 'POST', body: { username: ' Alumno móvil ' }, status: 201 });
  assert.equal(guest.username, 'Alumno móvil');
  await request(`${invitation}/participants`, { method: 'POST', body: { username: guest.username }, status: 409 });
  await request('/auth/users', { token: guest.guestToken, status: 401 });
  await request('/kahoot-api/quizzes', { token: guest.guestToken, status: 401 });
  const host = await connect({ token: professor });
  const player = await connect({ guestToken: guest.guestToken });
  await command(host, 'join-session', { roomCode: room.roomCode }, 'session-state');
  const lobby = await command(player, 'join-session', { roomCode: room.roomCode }, 'session-state');
  assert(lobby.participants.some((p) => p.userId === guest.participantId));
  const denied = await command(player, 'start-session', { roomCode: room.roomCode }, 'error');
  assert.equal(denied.code, 'FORBIDDEN');
  const opened = event(player, 'question-opened');
  await request(`/kahoot-api/game-sessions/${room.roomCode}/start`, { method: 'POST', token: professor });
  const round = await opened;
  assert(!('correctAnswer' in round.game));
  await request(`${invitation}/participants`, { method: 'POST', body: { username: 'Tardío' }, status: [400, 403, 409] });
  const answer = { roomCode: room.roomCode, questionId: question.id, answer: true };
  const closed = event(host, 'question-closed');
  await command(player, 'submit-answer', answer, 'answer-accepted');
  assert.equal((await command(player, 'submit-answer', answer, 'error')).code, 'DUPLICATE_ANSWER');
  player.disconnect();
  const recovered = await connect({ guestToken: guest.guestToken });
  const snapshot = await command(recovered, 'join-session', { roomCode: room.roomCode }, 'session-state');
  assert.equal(snapshot.game.answered, true);
  await closed;
  assert.equal((await command(recovered, 'submit-answer', answer, 'error')).code, 'LATE_ANSWER');
  const finished = event(recovered, 'game-finished');
  host.emit('next-question', { roomCode: room.roomCode, questionId: question.id });
  const final = await finished;
  assert.equal(final.scores.find((p) => p.playerName === guest.username).score, 1);
  const result = await request(`/kahoot-api/results/${room.roomCode}`, { token: professor });
  assert.equal(result.totalPlayers, 2);
  await request(`/kahoot-api/results/${room.roomCode}`, { token: other, status: 404 });
  await request(`/kahoot-api/results/${room.roomCode}`, { token: guest.guestToken, status: 401 });
  await request(invitation, { status: [404, 410] });
  await request(`/auth/users/${created[0].id}`, { method: 'PATCH', token: master, body: { active: false } });
  await request('/kahoot-api/quizzes', { token: professor, status: 401 });
  assert.equal((await command(host, 'join-session', { roomCode: room.roomCode }, 'error')).code, 'UNAUTHENTICATED');
  await request(`/auth/users/${created[0].id}`, { method: 'PATCH', token: master, body: { active: true } });
  await request('/auth/me', { token: professor, status: 401 });
  const renewed = (await login(created[0].username, password)).accessToken;
  await request(`/kahoot-api/quizzes/${quiz.id}`, { method: 'DELETE', token: renewed, status: 204 });
  await request(`/auth/users/${created[0].id}/reset-password`, { method: 'POST', token: master, body: { password: randomBytes(20).toString('hex') }, status: [200, 201, 204] });
  await request('/auth/me', { token: renewed, status: 401 });
  console.log('PASS: proxy, MASTER/PROFESOR, demo, ownership, guest lobby/game/reconnect/results, revocation and password reset');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  for (const socket of sockets) socket.disconnect();
  for (const user of created) {
    await request(`/auth/users/${user.id}`, { method: 'PATCH', token: master, body: { active: false } }).catch(() => undefined);
  }
});
