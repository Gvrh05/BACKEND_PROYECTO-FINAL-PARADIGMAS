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
      points: 1,
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
    expect(round.scores.get('ana')).toBe(1);
    expect(() => round.submit('ana', 'one', false, 7000)).toThrow(
      'WRONG_QUESTION',
    );
  });
});
