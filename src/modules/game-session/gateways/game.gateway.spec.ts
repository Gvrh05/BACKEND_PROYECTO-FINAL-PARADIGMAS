import { GameGateway } from './game.gateway';
import { GameSessionService } from '../services/game-session.service';
import { QuizzesService } from '../../quizzes/services/quizzes.service';

describe('GameGateway create_session', () => {
  const userId = 'c3e14bbe-d9d2-4c38-8a99-a741bf36d72e';
  const quizId = 'd215cd05-97bd-4d12-8ad1-a107061f9182';
  const service = { createSession: jest.fn() };
  const quizzes = { findOne: jest.fn() };
  let gateway: GameGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new GameGateway(
      service as unknown as GameSessionService,
      quizzes as unknown as QuizzesService,
    );
  });

  it('checks quiz access before returning a new lobby PIN', async () => {
    quizzes.findOne.mockResolvedValue({ id: quizId });
    service.createSession.mockReturnValue({ pin: '482193', quizId });
    const client = {
      id: 'host-socket',
      data: { user: { userId, username: 'profesor_test' } },
    } as unknown as Parameters<GameGateway['handleCreateSession']>[0];

    await expect(
      gateway.handleCreateSession(client, { quizId }),
    ).resolves.toEqual({
      success: true,
      pin: '482193',
      quizId,
    });
    expect(quizzes.findOne).toHaveBeenCalledWith(userId, quizId);
    expect(service.createSession).toHaveBeenCalledWith(quizId, 'host-socket');
  });

  it('does not create a lobby for an invalid quiz id or inaccessible quiz', async () => {
    const client = {
      id: 'host-socket',
      data: { user: { userId, username: 'profesor_test' } },
    } as unknown as Parameters<GameGateway['handleCreateSession']>[0];
    await expect(
      gateway.handleCreateSession(client, { quizId: 'not-a-uuid' }),
    ).resolves.toMatchObject({ success: false });
    quizzes.findOne.mockRejectedValue(new Error('not found'));
    await expect(
      gateway.handleCreateSession(client, { quizId }),
    ).rejects.toThrow('not found');
    expect(service.createSession).not.toHaveBeenCalled();
  });
});
