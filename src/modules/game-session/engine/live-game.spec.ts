import { LiveGame } from './live-game';

describe('LiveGame', () => {
  function game() {
    const round = new LiveGame([
      {
        id: 'one',
        questionText: 'Pregunta 1',
        imageUrl: null,
        timeLimitSeconds: 5,
        correctAnswer: false,
      },
      {
        id: 'two',
        questionText: 'Pregunta 2',
        imageUrl: null,
        timeLimitSeconds: 7,
        correctAnswer: true,
      },
    ]);
    round.open(1000);
    return round;
  }

  it('records false once and rejects a response at the deadline', () => {
    const round = game();
    round.submit('ana', 'one', false, 5999);
    expect(() => round.submit('ana', 'one', true, 5999)).toThrow(
      'DUPLICATE_ANSWER',
    );
    expect(() => round.submit('bob', 'one', false, 6000)).toThrow(
      'LATE_ANSWER',
    );
    expect(round.snapshot('ana')).toMatchObject({
      answered: true,
      closed: false,
    });
    expect(round.snapshot()).not.toHaveProperty('correctAnswer');
  });

  it('reveals and scores exactly once, and keeps the score in the next round', () => {
    const round = game();
    round.submit('ana', 'one', false, 2000);
    round.submit('bob', 'one', true, 2000);
    expect(round.close()).toBe(true);
    expect(round.close()).toBe(false);
    expect(round.snapshot('ana')).toMatchObject({
      correctAnswer: false,
      points: 25,
    });
    expect(round.snapshot('bob')).toMatchObject({ points: 0 });
    expect(round.snapshot('absent')).toMatchObject({
      answered: false,
      points: 0,
    });
    round.index++;
    round.open(6000);
    expect(round.snapshot('ana')).toMatchObject({
      answered: false,
      closesAt: 13000,
    });
    expect(round.snapshot()).not.toHaveProperty('correctAnswer');
    expect(round.scores.get('ana')).toBe(25);
    expect(() => round.submit('ana', 'one', false, 7000)).toThrow(
      'WRONG_QUESTION',
    );
  });

  it('counts only accepted unique answers and resets the count for the next question', () => {
    const round = game();
    round.eligiblePlayers = 2;
    expect(round.snapshot()).toMatchObject({
      votesReceived: 0,
      eligiblePlayers: 2,
    });
    round.submit('ana', 'one', false, 2000);
    expect(round.snapshot()).toMatchObject({
      votesReceived: 1,
      eligiblePlayers: 2,
    });
    expect(() => round.submit('ana', 'one', true, 2001)).toThrow();
    expect(round.snapshot().votesReceived).toBe(1);
    round.close();
    round.index++;
    round.open(6000);
    expect(round.snapshot()).toMatchObject({
      votesReceived: 0,
      eligiblePlayers: 2,
    });
  });

  it('awards 20 plus 5 strictly before half-time, and reveals counts/points only after closing', () => {
    const round = game(); // Opens at 1000; duration 5000, half-time at 3500.
    round.submit('fast', 'one', false, 3499);
    round.submit('half', 'one', false, 3500);
    round.submit('slow', 'one', false, 5999);
    round.submit('wrong', 'one', true, 2000);
    expect(round.snapshot()).not.toHaveProperty('voteCounts');
    expect(round.snapshot('fast')).not.toHaveProperty('points');
    round.close();
    expect(round.snapshot('fast')).toMatchObject({
      points: 25,
      voteCounts: { true: 1, false: 3 },
    });
    expect(round.snapshot('half').points).toBe(20);
    expect(round.snapshot('slow').points).toBe(20);
    expect(round.snapshot('wrong').points).toBe(0);
    expect(round.snapshot('absent').points).toBe(0);
    expect(round.correctCounts.get('fast')).toBe(1);
    round.close();
    expect(round.scores.get('fast')).toBe(25);
    expect(round.correctCounts.get('fast')).toBe(1);
    round.index++;
    round.open(6000);
    expect(round.snapshot('fast').answered).toBe(false);
    expect(round.snapshot('fast')).not.toHaveProperty('points');
    expect(round.snapshot()).not.toHaveProperty('voteCounts');
    expect(round.roundPoints.size).toBe(0);
  });
});
