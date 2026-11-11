import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LiveGame } from './live-game';
import { SessionManager } from './session-manager';
import { SessionStatus } from '../entities/game-session.entity';
import { GamePhase } from '../dto/game-state.dto';

describe('SessionManager', () => {
  let manager: SessionManager;
  beforeEach(() => {
    manager = new SessionManager();
  });

  it('keeps players and answers in separate maps for two rooms with different six-digit PINs', () => {
    const a = manager.createSession('host-a', 'quiz-a');
    const b = manager.createSession('host-b', 'quiz-b');
    expect(a.pin).toMatch(/^\d{6}$/);
    expect(b.pin).toMatch(/^\d{6}$/);
    expect(a.pin).not.toBe(b.pin);
    expect(a.players).not.toBe(b.players);
    a.liveGame = new LiveGame([]);
    b.liveGame = new LiveGame([]);
    expect(a.liveGame.responses).not.toBe(b.liveGame.responses);
    manager.addPlayer(a.pin, { userId: 'player', name: 'Player' });
    a.liveGame.responses.set('player', false);
    expect(b.players.has('player')).toBe(false);
    expect(b.liveGame.responses.size).toBe(0);
    expect(manager.listPlayers(a.pin)).toHaveLength(2);
    expect(manager.listPlayers(b.pin)).toHaveLength(1);
  });

  it('does not expose a reserved room until it is published', () => {
    const pending = manager.reserveSession('host', 'quiz');
    expect(manager.getSession(pending.pin)).toBeUndefined();
    expect(manager.activeCount).toBe(0);
    manager.publishSession(pending);
    expect(manager.getSession(pending.pin)).toBe(pending);
    expect(() => manager.publishSession(pending)).toThrow(BadRequestException);
  });

  it('joins idempotently, preserves data and projects only public participant fields', () => {
    const session = manager.createSession('host', 'quiz');
    expect(
      manager.addPlayer(session.pin, {
        userId: 'p',
        name: 'First',
        socketId: 's1',
      }).added,
    ).toBe(true);
    const player = session.players.get('p')!;
    player.score = 123; // Sentinel to ensure reconnection does not reset Punto 4 data.
    const result = manager.addPlayer(session.pin, {
      userId: 'p',
      socketId: 's2',
    });
    expect(result).toEqual({
      added: false,
      player: { userId: 'p', name: 'First', connected: true },
    });
    expect(session.players.get('p')).toBe(player);
    expect(player.score).toBe(123);
    expect(player.socketId).toBe('s2');
    expect(manager.listPlayers(session.pin)).toHaveLength(2);
  });

  it('REST-only registration is not online presence', () => {
    const { pin } = manager.createSession('host', 'quiz');
    expect(manager.addPlayer(pin, { userId: 'p' }).player.connected).toBe(
      false,
    );
  });

  it('removes a player in LOBBY only after the last active socket disconnects', () => {
    const { pin } = manager.createSession('host', 'quiz');
    manager.addPlayer(pin, { userId: 'p', socketId: 'old' });
    manager.addPlayer(pin, { userId: 'p', socketId: 'new' });
    manager.removePlayer(pin, 'p', 'old');
    expect(
      manager.listPlayers(pin).find((p) => p.userId === 'p')?.connected,
    ).toBe(true);
    manager.removePlayer(pin, 'p', 'unknown');
    expect(manager.listPlayers(pin)).toHaveLength(2);
    manager.removePlayer(pin, 'p', 'new');
    expect(manager.listPlayers(pin)).toHaveLength(1);
  });

  it('marks offline in IN_PROGRESS and allows an existing player to reconnect, but not a new one', () => {
    const { pin } = manager.createSession('host', 'quiz');
    manager.addPlayer(pin, { userId: 'p', name: 'Player', socketId: 's1' });
    const started = manager.startSession(pin, 'host');
    manager.removePlayer(pin, 'p', 's1');
    expect(manager.listPlayers(pin).find((p) => p.userId === 'p')).toEqual({
      userId: 'p',
      name: 'Player',
      connected: false,
    });
    expect(manager.addPlayer(pin, { userId: 'p', socketId: 's2' }).added).toBe(
      false,
    );
    expect(manager.requireSession(pin).startedAt).toBe(started.startedAt);
    expect(() => manager.addPlayer(pin, { userId: 'new' })).toThrow(
      BadRequestException,
    );
  });

  it('enforces host-only and LOBBY-only transition with a single timestamp', () => {
    const { pin } = manager.createSession('host', 'quiz');
    expect(() => manager.startSession(pin, 'other')).toThrow(
      ForbiddenException,
    );
    const at = new Date('2026-11-09T12:00:00Z');
    const session = manager.startSession(pin, 'host', at);
    expect(session.status).toBe(SessionStatus.IN_PROGRESS);
    expect(session.phase).toBe(GamePhase.IN_PROGRESS);
    expect(session.startedAt).toBe(at);
    expect(() => manager.startSession(pin, 'host')).toThrow(
      BadRequestException,
    );
    session.status = SessionStatus.FINISHED;
    expect(() => manager.startSession(pin, 'host')).toThrow(
      BadRequestException,
    );
    expect(() => manager.addPlayer(pin, { userId: 'host' })).toThrow(
      BadRequestException,
    );
  });

  it('returns not found for an absent room', () => {
    expect(() => manager.listPlayers('000000')).toThrow(NotFoundException);
    expect(() => manager.addPlayer('000000', { userId: 'p' })).toThrow(
      NotFoundException,
    );
    expect(() => manager.startSession('000000', 'host')).toThrow(
      NotFoundException,
    );
  });
});
