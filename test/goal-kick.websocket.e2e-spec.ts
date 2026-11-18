import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { io, Socket } from 'socket.io-client';
import { GameGateway } from '../src/modules/game-session/gateways/game.gateway';
import { GameSessionEvents } from '../src/modules/game-session/gateways/game-session.events';
import { GameSessionService } from '../src/modules/game-session/services/game-session.service';
import { SessionManager } from '../src/modules/game-session/engine/session-manager';
import { TokenVerifier } from '../src/shared/auth/token-verifier.service';
import { QuizzesService } from '../src/modules/quizzes/services/quizzes.service';
import { Repository } from 'typeorm';
import { GameSessionEntity } from '../src/modules/game-session/entities/game-session.entity';
import {
  resolveShot,
  trajectory,
} from '../src/modules/game-session/engine/goal-kick-physics';
import type { GoalKickGame } from '../src/modules/game-session/engine/goal-kick-game';
type State = ReturnType<GoalKickGame['snapshot']>;

/** Isolated real Socket.IO transport and production gateway/service/engine.
 * Auth account verification is a fixture; guest credentials are real opaque room credentials.
 * No external DB, passwords, accounts or live rooms are touched.
 */
describe('Tiro al Arco real WebSocket transport', () => {
  it('runs host + account + anonymous guest, rejects spoofing and recovers without double scoring', async () => {
    const manager = new SessionManager(),
      events = new GameSessionEvents();
    const service = new GameSessionService(
      manager,
      {} as QuizzesService,
      {} as Repository<GameSessionEntity>,
      events,
    );
    const hostId = randomUUID(),
      playerId = randomUUID();
    const verifier = {
      verify: (token: string) =>
        token === 'host-fixture'
          ? Promise.resolve({ sub: hostId, name: 'Docente' })
          : token === 'player-fixture'
            ? Promise.resolve({ sub: playerId, name: 'Account' })
            : Promise.reject(new Error('invalid fixture')),
    };
    const gateway = new GameGateway(
      service,
      verifier as unknown as TokenVerifier,
      events,
    );
    const http = createServer(),
      server = new Server(http);
    const namespace = server.of('/game');
    gateway.afterInit(namespace);
    type Client = Parameters<GameGateway['handleConnection']>[0];
    namespace.on('connection', (socket) => {
      const client = socket as unknown as Client;
      gateway.handleConnection(client);
      socket.on('join-session', (p: unknown) => {
        void gateway.join(client, p);
      });
      socket.on('game:start-minigame', (p: unknown) => {
        void gateway.startGoalKick(client, p);
      });
      socket.on('game:shoot', (p: unknown) => {
        void gateway.shootGoalKick(client, p);
      });
      socket.on('game:sync', (p: unknown) => {
        void gateway.syncGoalKick(client, p);
      });
      socket.on('game:cancel', (p: unknown) => {
        void gateway.cancelGoalKick(client, p);
      });
      socket.on('game:return-lobby', (p: unknown) => {
        void gateway.returnGoalKick(client, p);
      });
      socket.on('disconnect', () => {
        void gateway.handleDisconnect(client);
      });
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    if (!address || typeof address === 'string')
      throw new Error('missing port');
    const url = `http://127.0.0.1:${address.port}/game`;
    const sockets: Socket[] = [];
    function receive<T>(
      socket: Socket,
      event: string,
      send: () => void,
      accept: (p: T) => boolean = () => true,
    ): Promise<T> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.off(event, listener);
          reject(new Error(`Timed out: ${event}`));
        }, 5000);
        const listener = (p: T) => {
          if (accept(p)) {
            clearTimeout(timer);
            socket.off(event, listener);
            resolve(p);
          }
        };
        socket.on(event, listener);
        send();
      });
    }
    const room = manager.createSession(hostId, randomUUID());
    const guest = manager.createGuest(room.invitationId, 'Invitado');
    async function connect(auth: object) {
      const socket = io(url, {
        auth,
        transports: ['websocket'],
        autoConnect: false,
      });
      sockets.push(socket);
      await receive(socket, 'connect', () => {
        socket.connect();
      });
      await receive(socket, 'session-state', () =>
        socket.emit('join-session', { roomCode: room.pin, avatarId: 14 }),
      );
      return socket;
    }
    try {
      const host = await connect({ token: 'host-fixture' }),
        account = await connect({ token: 'player-fixture' }),
        anonymous = await connect({ guestToken: guest.guestToken });
      const accountState = receive<{ state: State }>(
        account,
        'game:state',
        () => {},
      );
      const guestState = receive<{ state: State }>(
        anonymous,
        'game:state',
        () => {},
      );
      const hostState = await receive<{ state: State }>(
        host,
        'game:state',
        () =>
          host.emit('game:start-minigame', {
            roomCode: room.pin,
            commandId: randomUUID(),
          }),
      );
      expect(hostState.state.view).toBe('host');
      expect(hostState.state).not.toHaveProperty('player');
      const initial = (await guestState).state;
      await accountState;
      if (initial.view !== 'player') throw new Error('missing guest board');
      expect(initial.player.board.keeper.displayName).toBe('Account');
      const denied = await receive<{ code: string }>(
        anonymous,
        'game:error',
        () =>
          anonymous.emit('game:cancel', {
            roomCode: room.pin,
            gameId: initial.gameId,
            commandId: randomUUID(),
          }),
      );
      expect(denied.code).toBe('FORBIDDEN');
      const forbidden = await receive<{ code: string }>(
        anonymous,
        'game:error',
        () =>
          anonymous.emit('game:shoot', {
            roomCode: '999999',
            gameId: initial.gameId,
            attemptId: initial.player.board.attemptId,
            commandId: randomUUID(),
            aimX: 272,
            curve: 65,
          }),
      );
      expect(forbidden.code).toBe('FORBIDDEN');
      const aim = [272, 728]
        .flatMap((x) => [-195, -130, -65, 65, 130, 195].map((k) => ({ x, k })))
        .find(
          (p) =>
            resolveShot(trajectory(p.x, p.k), initial.player.board.defenders)
              .outcome === 'GOAL',
        )!;
      const command = {
        roomCode: room.pin,
        gameId: initial.gameId,
        attemptId: initial.player.board.attemptId,
        commandId: randomUUID(),
        aimX: aim.x,
        curve: aim.k,
      };
      const result = receive<{ outcome: string; pointsAwarded: number }>(
        anonymous,
        'game:shot-result',
        () => {},
      );
      const publicGoal = receive<{ shotId: string; pointsAwarded: number }>(
        host,
        'game:goal',
        () => {},
      );
      const accepted = await receive<{ shotId: string; state: State }>(
        anonymous,
        'game:shot-accepted',
        () => anonymous.emit('game:shoot', command),
      );
      expect(accepted.state).not.toHaveProperty('player.shot.plan');
      const retry = await receive<{ shotId: string }>(
        anonymous,
        'game:shot-accepted',
        () => anonymous.emit('game:shoot', command),
      );
      expect(retry.shotId).toBe(accepted.shotId);
      expect(await result).toMatchObject({
        outcome: 'GOAL',
        pointsAwarded: 10,
      });
      expect((await publicGoal).shotId).toBe(accepted.shotId);
      anonymous.disconnect();
      const resumed = await connect({ guestToken: guest.guestToken });
      const snapshot = await receive<{ state: State }>(
        resumed,
        'game:state',
        () =>
          resumed.emit('game:sync', {
            roomCode: room.pin,
            gameId: initial.gameId,
          }),
      );
      expect(snapshot.state.endsAt).toBe(initial.endsAt);
      expect(
        snapshot.state.scoreboard.find(
          (p) => p.playerId === guest.participantId,
        )?.score,
      ).toBe(10);
      await receive(host, 'game:ended', () =>
        host.emit('game:cancel', {
          roomCode: room.pin,
          gameId: initial.gameId,
          commandId: randomUUID(),
        }),
      );
      await receive(host, 'game:lobby-restored', () =>
        host.emit('game:return-lobby', {
          roomCode: room.pin,
          gameId: initial.gameId,
          commandId: randomUUID(),
        }),
      );
      expect(manager.assertCanStart(room.pin, hostId)).toBe(room);
      expect(room.liveGame).toBeUndefined();
    } finally {
      for (const socket of sockets) socket.disconnect();
      manager.onModuleDestroy();
      await new Promise<void>((resolve) => {
        void server.close(() => resolve());
      });
    }
  }, 20000);
});
