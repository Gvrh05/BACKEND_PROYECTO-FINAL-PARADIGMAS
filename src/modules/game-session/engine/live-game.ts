import { WsException } from '@nestjs/websockets';

export type ScoringMode = 'classic' | 'speed' | 'precision';

export interface LiveQuestion {
  id: string;
  questionText: string;
  imageUrl: string | null;
  timeLimitSeconds: number;
  correctAnswer: boolean | number;
  choices?: string[];
}

export class LiveGame {
  index = 0;
  version = 0;
  closesAt = 0;
  openedAt = 0;
  closed = false;
  eligiblePlayers = 0;
  timer?: ReturnType<typeof setTimeout>;
  readonly responses = new Map<string, boolean | number>();
  readonly scores = new Map<string, number>();
  readonly answerTimes = new Map<string, number>();
  readonly roundPoints = new Map<string, number>();
  readonly correctCounts = new Map<string, number>();

  constructor(
    readonly questions: LiveQuestion[],
    readonly imageDirectory?: string,
    readonly scoringMode: ScoringMode = 'classic',
  ) {}

  get question() {
    return this.questions[this.index];
  }

  open(now: number) {
    this.version++;
    this.closed = false;
    this.responses.clear();
    this.answerTimes.clear();
    this.roundPoints.clear();
    this.openedAt = now;
    this.closesAt = now + this.question.timeLimitSeconds * 1000;
  }

  submit(
    userId: string,
    questionId: string,
    answer: boolean | number,
    now: number,
  ) {
    if (questionId !== this.question.id)
      throw gameError('WRONG_QUESTION', 'La pregunta ya cambió');
    if (this.closed || now >= this.closesAt)
      throw gameError('LATE_ANSWER', 'El tiempo para responder terminó');
    if (this.responses.has(userId))
      throw gameError(
        'DUPLICATE_ANSWER',
        'Tu primera respuesta ya está registrada',
      );
    const { choices } = this.question;
    const valid = choices
      ? typeof answer === 'number' &&
        Number.isInteger(answer) &&
        answer >= 0 &&
        answer < choices.length
      : typeof answer === 'boolean';
    if (!valid)
      throw gameError('INVALID_ANSWER', 'Selecciona una respuesta válida');
    this.responses.set(userId, answer);
    this.answerTimes.set(userId, Math.max(0, now - this.openedAt));
  }

  close() {
    if (this.closed) return false;
    this.closed = true;
    this.version++;
    clearTimeout(this.timer);
    for (const [id, answer] of this.responses) {
      const correct = answer === this.question.correctAnswer;
      const points = correct
        ? this.pointsAt(this.answerTimes.get(id) ?? Infinity)
        : 0;
      this.roundPoints.set(id, points);
      if (correct) {
        this.scores.set(id, (this.scores.get(id) ?? 0) + points);
        this.correctCounts.set(id, (this.correctCounts.get(id) ?? 0) + 1);
      }
    }
    return true;
  }

  private pointsAt(elapsed: number): number {
    const duration = this.question.timeLimitSeconds * 1000;
    switch (this.scoringMode) {
      case 'precision':
        return 25;
      case 'speed':
        return Math.max(5, 25 - Math.floor((21 * elapsed) / duration));
      case 'classic':
        return elapsed < duration / 2 ? 25 : 20;
    }
  }

  private countVotes(answer: boolean | number) {
    return [...this.responses.values()].filter((value) => value === answer)
      .length;
  }

  snapshot(userId?: string) {
    const { id, questionText, imageUrl, correctAnswer, choices } =
      this.question;
    const answer =
      userId === undefined ? undefined : this.responses.get(userId);
    return {
      questionId: id,
      questionText,
      imageUrl,
      ...(choices && { choices }),
      position: this.index + 1,
      total: this.questions.length,
      version: this.version,
      serverNow: Date.now(),
      closesAt: this.closesAt,
      ...(this.scoringMode !== 'classic' && {
        scoringMode: this.scoringMode,
        openedAt: this.openedAt,
      }),
      closed: this.closed,
      votesReceived: this.responses.size,
      eligiblePlayers: this.eligiblePlayers,
      ...(this.closed && {
        correctAnswer,
        ...(choices
          ? { choiceVotes: choices.map((_, index) => this.countVotes(index)) }
          : {
              voteCounts: {
                true: this.countVotes(true),
                false: this.countVotes(false),
              },
            }),
      }),
      ...(userId !== undefined && {
        answered: answer !== undefined,
        ...(this.closed && { points: this.roundPoints.get(userId) ?? 0 }),
      }),
    };
  }
}

export function gameError(code: string, message: string) {
  const error = new WsException({ code, message });
  error.message = code;
  return error;
}
