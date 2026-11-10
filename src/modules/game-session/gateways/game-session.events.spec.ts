import type { Namespace } from 'socket.io';
import { GameSessionEvents } from './game-session.events';

describe('GameSessionEvents', () => {
  it('targets a room or socket for every emission, never a global broadcast', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const globalEmit = jest.fn();
    const events = new GameSessionEvents();
    events.attach({ to, emit: globalEmit } as unknown as Namespace);
    const participants = [{ userId: 'p', name: 'Player', connected: true }];
    events.participantsUpdated('123456', participants);
    events.sessionStarted('654321', '2026-11-09T12:00:00Z');
    events.toSocket('socket-id', 'error', {
      code: 'FORBIDDEN',
      message: 'Host only',
    });
    expect(to.mock.calls).toEqual([['123456'], ['654321'], ['socket-id']]);
    expect(emit.mock.calls).toEqual([
      ['participants-updated', { participants }],
      [
        'session-started',
        { sessionId: '654321', startedAt: '2026-11-09T12:00:00Z' },
      ],
      ['error', { code: 'FORBIDDEN', message: 'Host only' }],
    ]);
    expect(globalEmit).not.toHaveBeenCalled();
  });

  it('is safe before the transport is initialized (unit tests or no connected clients)', () => {
    const events = new GameSessionEvents();
    expect(() => events.participantsUpdated('123456', [])).not.toThrow();
    expect(() =>
      events.sessionStarted('123456', new Date().toISOString()),
    ).not.toThrow();
  });
});
