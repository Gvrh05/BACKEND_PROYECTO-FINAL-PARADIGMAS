import { ForbiddenException } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { GameSessionService } from '../services/game-session.service';
import { TokenVerifier } from '../../../shared/auth/token-verifier.service';
import { GameSessionEvents } from './game-session.events';

/** The incoming create_session gateway was superseded by Punto 3 REST create.
 * Keep gateway coverage on the authenticated, room-scoped join/start contract.
 */
describe('GameGateway Punto 3 integration', () => {
  const userId = 'c3e14bbe-d9d2-4c38-8a99-a741bf36d72e';
  const sessions = {
    startSession: jest.fn(),
    setReady: jest.fn(),
    closeVoting: jest.fn(),
  };
  const verifier = { verify: jest.fn() };
  const events = { toSocket: jest.fn() };
  let gateway: GameGateway;
  beforeEach(() => {
    jest.clearAllMocks();
    verifier.verify.mockResolvedValue({ sub: userId });
    gateway = new GameGateway(
      sessions as unknown as GameSessionService,
      verifier as unknown as TokenVerifier,
      events as unknown as GameSessionEvents,
    );
  });
  function socket() {
    return {
      id: 'host-socket',
      connected: true,
      handshake: { auth: { token: 'signed-token' } },
      data: { user: { sub: userId } },
    } as unknown as Parameters<GameGateway['start']>[0];
  }
  it('uses the verified subject for the shared start service', async () => {
    await gateway.start(socket(), { roomCode: '482193' });
    expect(sessions.startSession).toHaveBeenCalledWith('482193', userId);
    expect(events.toSocket).not.toHaveBeenCalled();
  });
  it('rejects malformed room codes without starting a game', async () => {
    await gateway.start(socket(), { roomCode: 'invalid' });
    expect(sessions.startSession).not.toHaveBeenCalled();
    expect(events.toSocket).toHaveBeenCalledWith(
      'host-socket',
      'error',
      expect.objectContaining({ code: 'INVALID_ROOM_CODE' }),
    );
  });
  it('keeps no-host errors private to the requesting socket', async () => {
    sessions.startSession.mockRejectedValueOnce(
      new ForbiddenException('Solo host'),
    );
    await gateway.start(socket(), { roomCode: '482193' });
    expect(events.toSocket).toHaveBeenCalledWith(
      'host-socket',
      'error',
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('updates readiness using the verified subject only in the subscribed room', async () => {
    const client = socket();
    client.data.roomCode = '482193';
    await gateway.ready(client, { roomCode: '482193', ready: true });
    expect(sessions.setReady).toHaveBeenCalledWith('482193', userId, true);
    sessions.setReady.mockClear();
    await gateway.ready(client, { roomCode: '111111', ready: true });
    await gateway.ready(client, {
      roomCode: '482193',
      ready: true,
      userId: 'another',
    });
    await gateway.ready(client, { roomCode: '482193', ready: 'true' });
    expect(sessions.setReady).not.toHaveBeenCalled();
    expect(events.toSocket).toHaveBeenCalledWith(
      'host-socket',
      'error',
      expect.any(Object),
    );
  });

  it('scopes manual closing to the joined room and rejects guest controls', async () => {
    const client = socket();
    client.data.roomCode = '482193';
    const questionId = '11111111-1111-4111-8111-111111111111';
    await gateway.closeVoting(client, { roomCode: '482193', questionId });
    expect(sessions.closeVoting).toHaveBeenCalledWith(
      '482193',
      userId,
      questionId,
    );
    sessions.closeVoting.mockClear();
    await gateway.closeVoting(client, { roomCode: '999999', questionId });
    client.data.guestRoom = '482193';
    await gateway.closeVoting(client, { roomCode: '482193', questionId });
    expect(sessions.closeVoting).not.toHaveBeenCalled();
  });
});
