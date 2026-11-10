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
  const sessions = { startSession: jest.fn() };
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
});
