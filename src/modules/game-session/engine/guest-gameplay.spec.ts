import { SessionManager } from './session-manager';
import { SessionStatus } from '../entities/game-session.entity';

describe('Opaque guest credentials', () => {
  let manager: SessionManager;
  beforeEach(() => {
    manager = new SessionManager();
  });
  afterEach(() => {
    manager.onModuleDestroy();
    jest.restoreAllMocks();
  });
  it('binds invitation and hash-only credentials to a UUID instance, not a recycled PIN', () => {
    const room = manager.createSession('host', 'quiz');
    const guest = manager.createGuest(room.invitationId, 'Ada');
    expect(manager.verifyGuest(guest.guestToken)).toMatchObject({
      sub: guest.participantId,
      sessionId: room.id,
    });
    expect(
      JSON.stringify([
        ...(
          manager as unknown as { credentials: Map<string, unknown> }
        ).credentials.entries(),
      ]),
    ).not.toContain(guest.guestToken);
    manager.removeSession(room.pin);
    jest
      .spyOn(manager as unknown as { generatePin: () => string }, 'generatePin')
      .mockReturnValue(room.pin);
    const replacement = manager.createSession('host', 'quiz');
    expect(replacement.id).not.toBe(room.id);
    expect(() => manager.invitation(room.invitationId)).toThrow();
    expect(() => manager.verifyGuest(guest.guestToken)).toThrow();
  });
  it('expires invitations and tokens and rejects enrollment during or after start', () => {
    const room = manager.createSession('host', 'quiz');
    const guest = manager.createGuest(room.invitationId, 'Ada');
    room.acceptingGuests = false;
    expect(() => manager.createGuest(room.invitationId, 'Bob')).toThrow();
    room.status = SessionStatus.IN_PROGRESS;
    expect(() => manager.createGuest(room.invitationId, 'Bob')).toThrow();
    jest.spyOn(Date, 'now').mockReturnValue(room.expiresAt);
    expect(() => manager.verifyGuest(guest.guestToken)).toThrow();
    expect(() => manager.invitation(room.invitationId)).toThrow();
  });
  it('limits enrollment by room and unknown invitation requests by IP', () => {
    const room = manager.createSession('host', 'quiz');
    for (let i = 0; i < 30; i++)
      manager.createGuest(room.invitationId, `Guest ${i}`);
    expect(() => manager.createGuest(room.invitationId, 'Overflow')).toThrow(
      'Demasiadas solicitudes',
    );
    for (let i = 0; i < 60; i++) manager.rateLimit('ip:1');
    expect(() => manager.rateLimit('ip:1')).toThrow('Demasiadas solicitudes');
  });
  it('preserves guest identity and presence across overlapping lobby sockets', () => {
    const room = manager.createSession('host', 'quiz');
    const guest = manager.createGuest(room.invitationId, 'Ada');
    for (const socketId of ['old', 'new'])
      manager.addPlayer(room.pin, { userId: guest.participantId, socketId });
    manager.removePlayer(room.pin, guest.participantId, 'old');
    expect(room.players.get(guest.participantId)?.connected).toBe(true);
    manager.removePlayer(room.pin, guest.participantId, 'new');
    expect(room.players.get(guest.participantId)?.connected).toBe(false);
    expect(() => manager.createGuest(room.invitationId, 'Ada')).toThrow(
      'El nombre ya está en uso',
    );
  });
});
