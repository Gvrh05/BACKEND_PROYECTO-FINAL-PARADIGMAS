import { randomUUID } from 'node:crypto';
import { GoalKickGame } from './goal-kick-game';
describe('GoalKickGame authority, deadline and retries', () => {
  let now: number;
  const roster = [
    { playerId: 'one', playerName: 'Ada', avatarId: 14, connected: true },
    { playerId: 'two', playerName: 'Leo', avatarId: 0, connected: true },
  ];
  function create() {
    now = 1000;
    return new GoalKickGame(
      randomUUID(),
      randomUUID(),
      roster,
      randomUUID,
      () => now,
      () => 0,
    );
  }
  it('awards exactly ten once, uses another real keeper name and resets after cooldown', () => {
    const game = create(),
      state = game.players.get('one')!;
    expect(state.board.keeper.displayName).toBe('Leo');
    const attempt = state.board.attemptId,
      command = randomUUID();
    const first = game.shoot('one', attempt, command, 272, 65);
    expect(game.shoot('one', attempt, command, 272, 65)).toEqual(first);
    expect(() => game.shoot('one', attempt, command, 273, 65)).toThrow();
    expect(() => game.shoot('one', attempt, randomUUID(), 272, 65)).toThrow();
    expect(game.snapshot('one')).not.toHaveProperty('player.shot.plan');
    now = 1899;
    expect(game.advance().results).toHaveLength(0);
    now = 1900;
    expect(game.advance().results[0].result).toMatchObject({
      outcome: 'GOAL',
      pointsAwarded: 10,
    });
    expect(game.advance().results).toHaveLength(0);
    expect(game.scoreboard()[0].score).toBe(10);
    now = 2250;
    expect(game.advance().ready).toContain('one');
    expect(state.board.attemptId).not.toBe(attempt);
    expect(state.board.defenders).not.toEqual([
      { id: 'defender-0', x: 320, y: 340 },
      { id: 'defender-1', x: 650, y: 400 },
    ]);
  });
  it('settles valid goals even when the deadline callback is late, rejects goals at/after deadline', () => {
    const game = create();
    now = game.endsAt - 1000;
    game.shoot(
      'one',
      game.players.get('one')!.board.attemptId,
      randomUUID(),
      272,
      65,
    );
    now = game.endsAt - 900;
    game.shoot(
      'two',
      game.players.get('two')!.board.attemptId,
      randomUUID(),
      272,
      65,
    );
    now = game.endsAt + 500;
    const changes = game.advance();
    expect(changes.ended).toBe(true);
    expect(game.scoreboard().find((p) => p.playerId === 'one')?.score).toBe(10);
    expect(game.scoreboard().find((p) => p.playerId === 'two')?.score).toBe(0);
    expect(
      changes.results.find((r) => r.playerId === 'two')?.result.outcome,
    ).toBe('TIMEOUT');
    expect(() =>
      game.shoot(
        'one',
        game.players.get('one')!.board.attemptId,
        randomUUID(),
        272,
        65,
      ),
    ).toThrow();
  });
  it('does not reveal another board or outcome, permits solo practice and cancels without rewards', () => {
    const game = create();
    expect(game.snapshot('host').view).toBe('host');
    expect(game.snapshot('host')).not.toHaveProperty('player');
    expect(JSON.stringify(game.snapshot('one'))).not.toContain(
      game.players.get('two')!.board.attemptId,
    );
    expect(() =>
      game.shoot(
        'host',
        game.players.get('one')!.board.attemptId,
        randomUUID(),
        500,
        0,
      ),
    ).toThrow();
    expect(() =>
      game.shoot(
        'one',
        game.players.get('one')!.board.attemptId,
        randomUUID(),
        NaN,
        0,
      ),
    ).toThrow();
    game.cancel();
    now += 50000;
    game.advance();
    expect(game.scoreboard().every((p) => p.score === 0)).toBe(true);
    const solo = new GoalKickGame(
      randomUUID(),
      randomUUID(),
      [roster[0]],
      randomUUID,
      () => now,
      () => 0,
    );
    expect(solo.players.get('one')!.board.keeper.displayName).toBe(
      'Portero de práctica',
    );
  });
});
