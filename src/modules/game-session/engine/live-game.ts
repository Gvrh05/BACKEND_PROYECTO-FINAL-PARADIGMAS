import { WsException } from '@nestjs/websockets';

export interface LiveQuestion {
  id: string;
  questionText: string;
  imageUrl: string | null;
  timeLimitSeconds: number;
  correctAnswer: boolean;
}

export class LiveGame {
  index = 0;
  version = 0;
  closesAt = 0;
  closed = false;
  timer?: ReturnType<typeof setTimeout>;
  readonly responses = new Map<string, boolean>();
  readonly scores = new Map<string, number>();

  constructor(
    readonly questions: LiveQuestion[],
    readonly imageDirectory?: string,
  ) {}

  get question() {
    return this.questions[this.index];
  }

  open(now: number) {
    this.version++;
    this.closed = false;
    this.responses.clear();
    this.closesAt = now + this.question.timeLimitSeconds * 1000;
  }

  submit(userId: string, questionId: string, answer: boolean, now: number) {
    if (questionId !== this.question.id)
      throw gameError('WRONG_QUESTION', 'La pregunta ya cambió');
    if (this.closed || now >= this.closesAt)
      throw gameError('LATE_ANSWER', 'El tiempo para responder terminó');
    if (this.responses.has(userId))
      throw gameError(
        'DUPLICATE_ANSWER',
        'Tu primera respuesta ya está registrada',
      );
    this.responses.set(userId, answer);
  }

  close() {
    if (this.closed) return false;
    this.closed = true;
    this.version++;
    clearTimeout(this.timer);
    for (const [id, answer] of this.responses) {
      if (answer === this.question.correctAnswer)
        this.scores.set(id, (this.scores.get(id) ?? 0) + 1);
    }
    return true;
  }

  snapshot(userId?: string) {
    const { id, questionText, imageUrl, correctAnswer } = this.question;
    const answer =
      userId === undefined ? undefined : this.responses.get(userId);
    return {
      questionId: id,
      questionText,
      imageUrl,
      position: this.index + 1,
      total: this.questions.length,
      version: this.version,
      serverNow: Date.now(),
      closesAt: this.closesAt,
      closed: this.closed,
      ...(this.closed && { correctAnswer }),
      ...(userId !== undefined && {
        answered: answer !== undefined,
        ...(this.closed && { points: Number(answer === correctAnswer) }),
      }),
    };
  }
}

export function gameError(code: string, message: string) {
  const error = new WsException({ code, message });
  error.message = code;
  return error;
}
