import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { AuthModule } from '../src/shared/auth/auth.module';
import { HttpExceptionFilter } from '../src/shared/filters/http-exception.filter';
import { APP_CONFIG } from '../src/shared/utils/constants';
import { GameSessionController } from '../src/modules/game-session/controllers/game-session.controller';
import { GameSessionService } from '../src/modules/game-session/services/game-session.service';
import { GameGateway } from '../src/modules/game-session/gateways/game.gateway';
import { GameSessionEvents } from '../src/modules/game-session/gateways/game-session.events';
import { SessionManager } from '../src/modules/game-session/engine/session-manager';
import { GameSessionEntity } from '../src/modules/game-session/entities/game-session.entity';
import { QuizzesService } from '../src/modules/quizzes/services/quizzes.service';
import type { SessionSnapshotDto } from '../src/modules/game-session/dto/session-response.dto';
import type { ParticipantDto } from '../src/modules/game-session/dto/participant.dto';
import { DataSource } from 'typeorm';
import { PUNTO3_DEMO_AUTHOR_ID } from '../src/shared/database/punto3-demo-owner';
import { randomUUID } from 'node:crypto';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../src/shared/guards/jwt-auth.guard';
import { PublicInvitationsController } from '../src/modules/game-session/controllers/public-invitations.controller';

/** Transport e2e: real Nest controllers/gateway/JWT/services, controlled repositories.
 * Real Postgres is covered separately by scripts/verify-phase-b-{rest,ws}.cjs.
 * This module deliberately does not import DatabaseModule or load a dev .env.
 */
describe('Game sessions HTTP + Socket.IO (e2e)', () => {
  const quizId = '7ac9810a-b36c-4c85-8b58-b296434f0110';
  const foreignQuizId = '7ac9810a-b36c-4c85-8b58-b296434f0220';
  const config = {
    JWT_SECRET: 'e2e-only-secret-not-for-deployment',
    JWT_ISSUER: 'e2e-auth',
    JWT_AUDIENCE: 'e2e-game',
  };
  const prefix = `/${APP_CONFIG.GLOBAL_PREFIX}/game-sessions`;
  let app: INestApplication;
  let base: string;
  let sockets: Socket[];
  const ids = new Map<string, string>([
    ['test-host-id', PUNTO3_DEMO_AUTHOR_ID],
  ]);
  function identity(alias: string) {
    if (/^[\da-f-]{36}$/.test(alias)) return alias;
    if (!ids.has(alias)) ids.set(alias, randomUUID());
    return ids.get(alias)!;
  }

  function jwt(sub = 'test-host-id', claims: Record<string, unknown> = {}) {
    return new JwtService().sign(
      {
        sub: identity(sub),
        role: 'PROFESOR',
        purpose: 'account',
        credentialVersion: 1,
        ...claims,
      },
      {
        secret: config.JWT_SECRET,
        algorithm: 'HS256',
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
        ...(claims.exp === undefined && { expiresIn: '5m' }),
      },
    );
  }

  beforeEach(async () => {
    jest.spyOn(global, 'fetch').mockImplementation((_url, options) => {
      const token = (
        options?.headers as Record<string, string>
      ).Authorization.slice(7);
      const claims = new JwtService().verify<Record<string, unknown>>(token, {
        secret: config.JWT_SECRET,
      });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: claims.sub,
            role: claims.role,
            active: true,
            isSystem: false,
            credentialVersion: claims.credentialVersion,
            username: claims.name ?? 'Participante',
          }),
        ),
      );
    });
    sockets = [];
    const quizRows = [
      {
        id: quizId,
        title: 'Own quiz',
        authorId: PUNTO3_DEMO_AUTHOR_ID,
        createdAt: new Date(),
        updatedAt: new Date(),
        questions: [
          {
            id: quizId,
            kind: 'TRUE_FALSE',
            timeLimitSeconds: 20,
            questionText: 'Fixture',
            options: [{ text: 'Verdadero', isCorrect: true, position: 0 }],
          },
        ],
      },
      {
        id: foreignQuizId,
        title: 'Foreign quiz',
        authorId: '7ac9810a-b36c-4c85-8b58-b296434f0200',
      },
    ];
    const sessionRows = new Map<string, Record<string, unknown>>();
    const module = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [GameSessionController, PublicInvitationsController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        GameSessionService,
        SessionManager,
        GameGateway,
        GameSessionEvents,
        QuizzesService,
        {
          provide: DataSource,
          useValue: {
            getRepository: () => ({
              findOne: () => Promise.resolve(quizRows[0]),
              findOneBy: (where: { id: string; authorId: string }) =>
                Promise.resolve(
                  quizRows.find(
                    (row) =>
                      row.id === where.id && row.authorId === where.authorId,
                  ) ?? null,
                ),
              find: ({ where }: { where: { authorId: string } }) =>
                Promise.resolve(
                  quizRows.filter((row) => row.authorId === where.authorId),
                ),
            }),
          },
        },
        {
          provide: getRepositoryToken(GameSessionEntity),
          useValue: {
            create: (data: Record<string, unknown>) => ({ ...data }),
            save: (data: Record<string, unknown>) => {
              sessionRows.set(data.roomCode as string, { ...data });
              return Promise.resolve(data);
            },
            update: (
              where: Record<string, unknown>,
              data: Record<string, unknown>,
            ) => {
              const row = sessionRows.get(where.roomCode as string);
              if (
                !row ||
                !Object.entries(where).every(
                  ([key, value]) => row[key] === value,
                )
              )
                return Promise.resolve({ affected: 0 });
              Object.assign(row, data);
              return Promise.resolve({ affected: 1 });
            },
          },
        },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(config))
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix(APP_CONFIG.GLOBAL_PREFIX);
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const socket of sockets ?? []) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    await app?.close();
    jest.restoreAllMocks();
  });

  async function create() {
    const response = await request(app.getHttpServer())
      .post(prefix)
      .auth(jwt(), { type: 'bearer' })
      .send({ quizId })
      .expect(201);
    return response.body.roomCode as string;
  }

  function next<T = any>(
    socket: Socket,
    event: string,
    predicate: (payload: T) => boolean = () => true,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, receive);
        reject(new Error(`Timeout waiting for ${event}`));
      }, 3000);
      function receive(payload: T) {
        if (!predicate(payload)) return;
        clearTimeout(timer);
        socket.off(event, receive);
        resolve(payload);
      }
      socket.on(event, receive);
    });
  }

  async function connect(
    token: string | undefined = jwt(),
    guestToken?: string,
  ) {
    const socket = io(`${base}/game`, {
      autoConnect: false,
      forceNew: true,
      transports: ['websocket'],
      auth: guestToken ? { guestToken } : token ? { token } : {},
      reconnection: false,
    });
    sockets.push(socket);
    const connected = next(socket, 'connect');
    socket.connect();
    await connected;
    return socket;
  }

  async function join(
    socket: Socket,
    roomCode: string,
  ): Promise<SessionSnapshotDto> {
    const state = next<SessionSnapshotDto>(socket, 'session-state');
    socket.emit('join-session', { roomCode });
    return state;
  }

  async function snapshot(roomCode: string): Promise<SessionSnapshotDto> {
    const response = await request(app.getHttpServer())
      .get(`${prefix}/${roomCode}`)
      .auth(jwt(), { type: 'bearer' })
      .expect(200);
    return response.body;
  }

  async function restStart(roomCode: string) {
    return request(app.getHttpServer())
      .post(`${prefix}/${roomCode}/start`)
      .auth(jwt(), { type: 'bearer' })
      .expect(200);
  }

  it('requires JWT for every REST route, including create', async () => {
    for (const [method, route] of [
      ['post', ''],
      ['get', '/available-quizzes'],
      ['get', '/123456'],
      ['get', '/123456/participants'],
      ['post', '/123456/join'],
      ['post', '/123456/start'],
    ] as const) {
      await request(app.getHttpServer())
        [method](`${prefix}${route}`)
        .send({})
        .expect(401);
    }
  });

  it('creates a room with six digits, adds another user idempotently, lists two users and permits only host start', async () => {
    const roomCode = await create();
    expect(roomCode).toMatch(/^\d{6}$/);
    expect(await snapshot(roomCode)).toMatchObject({
      roomCode,
      sessionId: roomCode,
      status: 'LOBBY',
      hostId: identity('test-host-id'),
      quizId,
    });
    const joinRoute = `${prefix}/${roomCode}/join`;
    const first = await request(app.getHttpServer())
      .post(joinRoute)
      .auth(jwt('player'), { type: 'bearer' })
      .send({ name: ' Player ' })
      .expect(201);
    expect(first.body).toEqual({
      added: true,
      player: { userId: identity('player'), name: 'Player', connected: false },
    });
    const second = await request(app.getHttpServer())
      .post(joinRoute)
      .auth(jwt('player'), { type: 'bearer' })
      .send({})
      .expect(201);
    expect(second.body.added).toBe(false);
    const participants = await request(app.getHttpServer())
      .get(`${prefix}/${roomCode}/participants`)
      .auth(jwt(), { type: 'bearer' })
      .expect(200);
    expect(participants.body.map((p: ParticipantDto) => p.userId)).toEqual([
      identity('test-host-id'),
      identity('player'),
    ]);
    await request(app.getHttpServer())
      .post(`${prefix}/${roomCode}/start`)
      .auth(jwt('player'), { type: 'bearer' })
      .expect(403);
    const started = await restStart(roomCode);
    expect(started.body).toMatchObject({
      status: 'IN_PROGRESS',
      startedAt: expect.any(String),
    });
    // Permission check takes precedence even after the host started the room.
    await request(app.getHttpServer())
      .post(`${prefix}/${roomCode}/start`)
      .auth(jwt('player'), { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${prefix}/${roomCode}/start`)
      .auth(jwt(), { type: 'bearer' })
      .expect(400);
  });

  it('lists only quizzes owned by sub and projects id/title, independent of the public quiz mock', async () => {
    const own = await request(app.getHttpServer())
      .get(`${prefix}/available-quizzes`)
      .auth(jwt(), { type: 'bearer' })
      .expect(200);
    expect(own.body).toEqual([{ id: quizId, title: 'Own quiz' }]);
    const other = await request(app.getHttpServer())
      .get(`${prefix}/available-quizzes`)
      .auth(jwt('7ac9810a-b36c-4c85-8b58-b296434f0200'), { type: 'bearer' })
      .expect(200);
    expect(other.body).toEqual([{ id: foreignQuizId, title: 'Foreign quiz' }]);
    const empty = await request(app.getHttpServer())
      .get(`${prefix}/available-quizzes`)
      .auth(jwt('nobody'), { type: 'bearer' })
      .expect(200);
    expect(empty.body).toEqual([]);
  });

  it('rejects foreign/absent quizzes and invalid or client-supplied identity fields', async () => {
    for (const id of [foreignQuizId, '7ac9810a-b36c-4c85-8b58-b296434f0999']) {
      await request(app.getHttpServer())
        .post(prefix)
        .auth(jwt(), { type: 'bearer' })
        .send({ quizId: id })
        .expect(403);
    }
    for (const body of [
      { quizId: '' },
      { quizId: 'invalid' },
      { quizId, hostId: 'forged' },
    ]) {
      await request(app.getHttpServer())
        .post(prefix)
        .auth(jwt(), { type: 'bearer' })
        .send(body)
        .expect(400);
    }
    const roomCode = await create();
    for (const body of [
      { userId: 'host' },
      { name: '' },
      { name: '  ' },
      { name: null },
      { name: 42 },
    ]) {
      await request(app.getHttpServer())
        .post(`${prefix}/${roomCode}/join`)
        .auth(jwt('player'), { type: 'bearer' })
        .send(body)
        .expect(400);
    }
  });

  it('validates six-digit codes and returns 404 for a missing room in the existing error envelope', async () => {
    for (const code of ['abc', '12345', '1234567']) {
      for (const [method, suffix] of [
        ['get', ''],
        ['get', '/participants'],
        ['post', '/join'],
        ['post', '/start'],
      ] as const) {
        await request(app.getHttpServer())
          [method](`${prefix}/${code}${suffix}`)
          .auth(jwt(), { type: 'bearer' })
          .send({})
          .expect(400);
      }
    }
    const missing = await request(app.getHttpServer())
      .get(`${prefix}/000000`)
      .auth(jwt(), { type: 'bearer' })
      .expect(404);
    expect(missing.body).toMatchObject({
      statusCode: 404,
      path: `${prefix}/000000`,
      error: { message: 'Sala inexistente' },
    });
  });

  it('rejects invalid, expired and mismatched issuer/audience JWTs', async () => {
    const signer = new JwtService();
    const tokens = [
      'invalid',
      jwt('player', { exp: 1 }),
      signer.sign(
        { sub: 'p' },
        {
          secret: config.JWT_SECRET,
          issuer: 'wrong',
          audience: config.JWT_AUDIENCE,
        },
      ),
      signer.sign(
        { sub: 'p' },
        {
          secret: config.JWT_SECRET,
          issuer: config.JWT_ISSUER,
          audience: 'wrong',
        },
      ),
    ];
    for (const token of tokens)
      await request(app.getHttpServer())
        .get(`${prefix}/available-quizzes`)
        .auth(token, { type: 'bearer' })
        .expect(401);
  });

  it('rejects new players after start while preserving the snapshot and allowing an existing identity', async () => {
    const roomCode = await create();
    await request(app.getHttpServer())
      .post(`${prefix}/${roomCode}/join`)
      .auth(jwt('player'), { type: 'bearer' })
      .send({})
      .expect(201);
    await restStart(roomCode);
    await request(app.getHttpServer())
      .post(`${prefix}/${roomCode}/join`)
      .auth(jwt('new-player'), { type: 'bearer' })
      .send({})
      .expect(400);
    const rejoin = await request(app.getHttpServer())
      .post(`${prefix}/${roomCode}/join`)
      .auth(jwt('player'), { type: 'bearer' })
      .send({})
      .expect(201);
    expect(rejoin.body.added).toBe(false);
    expect((await snapshot(roomCode)).participants).toHaveLength(2);
  });

  it.each(['missing', 'invalid', 'expired'])(
    'disconnects an invalid WS handshake: %s',
    async (kind) => {
      const badToken =
        kind === 'missing'
          ? undefined
          : kind === 'expired'
            ? jwt('player', { exp: 1 })
            : 'invalid';
      const socket = io(`${base}/game`, {
        autoConnect: false,
        forceNew: true,
        auth: badToken ? { token: badToken } : {},
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);
      const disconnected = next(socket, 'disconnect');
      socket.connect();
      expect(await disconnected).toBe('io server disconnect');
      expect(socket.connected).toBe(false);
    },
  );

  it('joins over WS, rejects no-host, and sends session-started to host and player', async () => {
    const roomCode = await create();
    const host = await connect();
    expect((await join(host, roomCode)).status).toBe('LOBBY');
    const player = await connect(jwt('player', { name: 'Player WS' }));
    const update = next<{ participants: ParticipantDto[] }>(
      host,
      'participants-updated',
    );
    const state = await join(player, roomCode);
    expect(state.participants).toHaveLength(2);
    expect(
      (await update).participants.find((p) => p.userId === identity('player'))
        ?.connected,
    ).toBe(true);
    const forbidden = next(player, 'error');
    player.emit('start-session', { roomCode });
    expect(await forbidden).toMatchObject({ code: 'FORBIDDEN' });
    expect((await snapshot(roomCode)).status).toBe('LOBBY');
    const hostEvent = next(host, 'session-started');
    const playerEvent = next(player, 'session-started');
    host.emit('start-session', { roomCode });
    const [a, b] = await Promise.all([hostEvent, playerEvent]);
    expect(a).toEqual(b);
    expect(a).toEqual({ sessionId: roomCode, startedAt: expect.any(String) });
    expect((await snapshot(roomCode)).startedAt).toBe(a.startedAt);
    const repeated = next(host, 'error');
    host.emit('start-session', { roomCode });
    expect(await repeated).toMatchObject({ code: 'INVALID_SESSION_STATUS' });
  });

  it('returns stable WS errors for malformed codes, missing rooms and joins after start', async () => {
    const socket = await connect(jwt('new-player'));
    for (const payload of [
      { roomCode: 'abc' },
      { roomCode: '123456', userId: 'forged' },
      null,
      {},
    ]) {
      const invalid = next(socket, 'error');
      socket.emit('join-session', payload);
      expect(await invalid).toMatchObject({ code: 'INVALID_ROOM_CODE' });
    }
    const absent = next(socket, 'error');
    socket.emit('join-session', { roomCode: '000000' });
    expect(await absent).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    const roomCode = await create();
    await restStart(roomCode);
    const started = next(socket, 'error');
    socket.emit('join-session', { roomCode });
    expect(await started).toMatchObject({ code: 'SESSION_ALREADY_STARTED' });
  });

  it('notifies WS members for REST join/start, with exactly one start for concurrent requests', async () => {
    const roomCode = await create();
    const host = await connect();
    await join(host, roomCode);
    const update = next<{ participants: ParticipantDto[] }>(
      host,
      'participants-updated',
    );
    await request(app.getHttpServer())
      .post(`${prefix}/${roomCode}/join`)
      .auth(jwt('rest-player'), { type: 'bearer' })
      .send({ name: 'REST player' })
      .expect(201);
    expect((await update).participants).toHaveLength(2);
    const received: unknown[] = [];
    host.on('session-started', (event) => received.push(event));
    const startEvent = next(host, 'session-started');
    const results = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post(`${prefix}/${roomCode}/start`)
          .auth(jwt(), { type: 'bearer' }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    await startEvent;
    // Same-socket snapshot is an ordering barrier, not an arbitrary sleep.
    await join(host, roomCode);
    expect(received).toHaveLength(1);
  });

  it('removes on LOBBY disconnect and restores a single participant on reload', async () => {
    const roomCode = await create();
    const host = await connect();
    await join(host, roomCode);
    const player = await connect(jwt('player'));
    await join(player, roomCode);
    const removed = next<{ participants: ParticipantDto[] }>(
      host,
      'participants-updated',
      ({ participants }) =>
        !participants.some((p) => p.userId === identity('player')),
    );
    player.disconnect();
    await removed;
    const reloaded = await connect(jwt('player'));
    const state = await join(reloaded, roomCode);
    expect(state.participants.map((p) => p.userId)).toEqual([
      identity('test-host-id'),
      identity('player'),
    ]);
  });

  it('keeps an IN_PROGRESS player offline, then reconnects without resetting startedAt', async () => {
    const roomCode = await create();
    const host = await connect();
    await join(host, roomCode);
    const player = await connect(jwt('player'));
    await join(player, roomCode);
    const started = await restStart(roomCode);
    const offline = next<{ participants: ParticipantDto[] }>(
      host,
      'participants-updated',
      ({ participants }) =>
        participants.some(
          (p) => p.userId === identity('player') && !p.connected,
        ),
    );
    player.disconnect();
    await offline;
    const reloaded = await connect(jwt('player'));
    const state = await join(reloaded, roomCode);
    expect(state.status).toBe('IN_PROGRESS');
    expect(state.startedAt).toBe(started.body.startedAt);
    expect(
      state.participants.filter((p) => p.userId === identity('player')),
    ).toEqual([
      { userId: identity('player'), name: 'Participante', connected: true },
    ]);
  });

  it('does not remove an identity when its old socket disconnects after reconnection', async () => {
    const roomCode = await create();
    const host = await connect();
    await join(host, roomCode);
    const old = await connect(jwt('player'));
    await join(old, roomCode);
    const fresh = await connect(jwt('player'));
    await join(fresh, roomCode);
    const update = next<{ participants: ParticipantDto[] }>(
      host,
      'participants-updated',
    );
    old.disconnect();
    expect(
      (await update).participants.find((p) => p.userId === identity('player'))
        ?.connected,
    ).toBe(true);
    expect((await snapshot(roomCode)).participants).toHaveLength(2);
  });

  it('isolates join/disconnect/start events between two rooms', async () => {
    const a = await create();
    const b = await create();
    const hostA = await connect();
    const hostB = await connect();
    await join(hostA, a);
    await join(hostB, b);
    const bUpdates: { participants: ParticipantDto[] }[] = [];
    const bStarts: unknown[] = [];
    hostB.on('participants-updated', (event) => bUpdates.push(event));
    hostB.on('session-started', (event) => bStarts.push(event));
    const player = await connect(jwt('only-a'));
    await join(player, a);
    const removed = next<{ participants: ParticipantDto[] }>(
      hostA,
      'participants-updated',
      ({ participants }) =>
        !participants.some((p) => p.userId === identity('only-a')),
    );
    player.disconnect();
    await removed;
    const start = next(hostA, 'session-started');
    await restStart(a);
    await start;
    await join(hostB, b); // ordering barrier; it generates B's single legitimate update
    expect(bStarts).toEqual([]);
    expect(bUpdates).toEqual([
      {
        participants: [
          {
            userId: identity('test-host-id'),
            name: 'Anfitrión',
            connected: true,
          },
        ],
      },
    ]);
    expect((await snapshot(b)).status).toBe('LOBBY');
    expect((await snapshot(b)).participants).toHaveLength(1);
  });

  it('leaves the previous Socket.IO room on a successful room switch', async () => {
    const a = await create();
    const b = await create();
    const hostA = await connect();
    await join(hostA, a);
    const player = await connect(jwt('switching-player'));
    await join(player, a);
    const removed = next<{ participants: ParticipantDto[] }>(
      hostA,
      'participants-updated',
      ({ participants }) =>
        !participants.some((p) => p.userId === identity('switching-player')),
    );
    await join(player, b);
    await removed;
    expect((await snapshot(a)).participants).toHaveLength(1);
    expect((await snapshot(b)).participants).toHaveLength(2);
    const playerStarts: unknown[] = [];
    player.on('session-started', (event) => playerStarts.push(event));
    await restStart(a);
    await join(player, b);
    expect(playerStarts).toEqual([]);
    const started = next(player, 'session-started');
    await restStart(b);
    expect(await started).toMatchObject({ sessionId: b });
  });

  it('supports public guests with room-scoped identity, reconnect, safe rounds and revocation', async () => {
    const roomCode = await create();
    const other = await create();
    const invitationId = (await snapshot(roomCode)).invitationId;
    const route = `/kahoot-api/public/invitations/${invitationId}`;
    const metadata = await request(app.getHttpServer()).get(route).expect(200);
    expect(metadata.body).toEqual({
      invitationId,
      roomCode,
      status: 'LOBBY',
      name: 'Own quiz',
    });
    const response = await request(app.getHttpServer())
      .post(`${route}/participants`)
      .send({ username: '  Ada  ' })
      .expect(201);
    const guest = response.body as {
      participantId: string;
      guestToken: string;
      username: string;
    };
    expect(guest.username).toBe('Ada');
    await request(app.getHttpServer())
      .post(`${route}/participants`)
      .send({ username: 'ada' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`${route}/participants`)
      .send({ username: 'Other', participantId: guest.participantId })
      .expect(400);
    await request(app.getHttpServer())
      .get(`${prefix}/${roomCode}`)
      .auth(guest.guestToken, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .get(`${prefix}/${roomCode}`)
      .auth(jwt('other-teacher'), { type: 'bearer' })
      .expect(404);
    const host = await connect();
    await join(host, roomCode);
    const player = await connect(undefined, guest.guestToken);
    const state = await join(player, roomCode);
    expect(state).not.toHaveProperty('quizId');
    expect(state).not.toHaveProperty('invitationId');
    expect(state.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: guest.participantId, name: 'Ada' }),
      ]),
    );
    for (const [event, payload] of [
      ['start-session', { roomCode }],
      ['next-question', { roomCode, questionId: quizId }],
      ['join-session', { roomCode: other }],
    ] as const) {
      const error = next(player, 'error');
      player.emit(event, payload);
      expect(await error).toMatchObject({ code: 'FORBIDDEN' });
    }
    const offline = next<{ participants: ParticipantDto[] }>(
      host,
      'participants-updated',
      ({ participants }) =>
        participants.some(
          (p) => p.userId === guest.participantId && !p.connected,
        ),
    );
    player.disconnect();
    await offline;
    const reconnected = await connect(undefined, guest.guestToken);
    expect(
      (await join(reconnected, roomCode)).participants.filter(
        (p) => p.userId === guest.participantId,
      ),
    ).toHaveLength(1);
    const opened = next(reconnected, 'question-opened');
    await restStart(roomCode);
    expect((await opened).game).not.toHaveProperty('correctAnswer');
    await request(app.getHttpServer())
      .post(`${route}/participants`)
      .send({ username: 'Late' })
      .expect(400);
    const forged = next(reconnected, 'error');
    reconnected.emit('submit-answer', {
      roomCode,
      questionId: quizId,
      answer: true,
      playerId: identity('test-host-id'),
    });
    expect(await forged).toMatchObject({ code: 'FORBIDDEN' });
    const accepted = next(reconnected, 'answer-accepted');
    reconnected.emit('submit-answer', {
      roomCode,
      questionId: quizId,
      answer: true,
    });
    await accepted;
    const duplicate = next(reconnected, 'error');
    reconnected.emit('submit-answer', {
      roomCode,
      questionId: quizId,
      answer: false,
    });
    expect(await duplicate).toMatchObject({ code: 'DUPLICATE_ANSWER' });
    const manager = app.get(SessionManager);
    manager.requireSession(roomCode).liveGame!.close();
    expect(
      manager
        .requireSession(roomCode)
        .liveGame!.scores.get(guest.participantId),
    ).toBe(1);
    const finished = next(reconnected, 'game-finished');
    host.emit('next-question', { roomCode, questionId: quizId });
    await finished;
    expect(() => manager.verifyGuest(guest.guestToken)).toThrow();
    await request(app.getHttpServer()).get(route).expect(404);
  });

  it('rejects ambiguous handshakes and rechecks account revocation on administrative events', async () => {
    const roomCode = await create();
    const ambiguous = io(`${base}/game`, {
      autoConnect: false,
      auth: { token: jwt(), guestToken: 'fake' },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(ambiguous);
    const disconnected = next(ambiguous, 'disconnect');
    ambiguous.connect();
    await disconnected;
    const host = await connect();
    await join(host, roomCode);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    const denied = next(host, 'error');
    host.emit('start-session', { roomCode });
    expect(await denied).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(app.get(SessionManager).requireSession(roomCode).status).toBe(
      'LOBBY',
    );
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await request(app.getHttpServer())
      .get(`${prefix}/${roomCode}`)
      .auth(jwt(), { type: 'bearer' })
      .expect(503);
  });
});
