import { randomUUID } from 'node:crypto';
import { Quiz } from '../entities/quiz.entity';
import { Question } from '../entities/question.entity';
import { QuestionOption } from '../entities/question-option.entity';
import {
  serializeQuiz,
  serializeQuestion,
  serializeQuizDetail,
} from './resources';
import openapi from '../../../../docs/openapi.json';

describe('Authoring resource serialization', () => {
  const quiz = Object.assign(new Quiz(), {
    id: randomUUID(),
    authorId: randomUUID(),
    title: 'Quiz',
    isDemo: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  });
  const question = Object.assign(new Question(), {
    id: randomUUID(),
    quizId: quiz.id,
    questionText: 'Q',
    timeLimitSeconds: 20,
    points: 1000,
    imageStorageKey: '4c56df62-1e62-4597-a27d-e7888057c4ee.png',
    imageUrl: '/uploads/questions/4c56df62-1e62-4597-a27d-e7888057c4ee.png',
    imageMimeType: 'image/png',
    imageSize: 123,
    options: [3, 1, 0, 2].map((position) =>
      Object.assign(new QuestionOption(), {
        id: randomUUID(),
        questionId: 'internal-reference',
        position,
        text: `${position}`,
        isCorrect: position === 0,
      }),
    ),
  });

  it('returns direct metadata with ISO dates and explicit nulls', () => {
    expect(serializeQuiz(quiz)).toMatchObject({
      description: null,
      coverImageUrl: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });
  it('omits all storage fields and preserves ordered public options', () => {
    const result = serializeQuestion(question);
    expect(result.options.map((option) => option.text)).toEqual([
      '0',
      '1',
      '2',
      '3',
    ]);
    expect(result.imageUrl).toBe(
      '/uploads/questions/4c56df62-1e62-4597-a27d-e7888057c4ee.png',
    );
    for (const privateValue of [
      'imageStorageKey',
      'imageMimeType',
      'imageSize',
      'position',
      'internal-reference',
    ]) {
      expect(JSON.stringify(result)).not.toContain(privateValue);
    }
    expect(question.options[0].position).toBe(3);
  });
  it('returns null for no image and composes a quiz detail', () => {
    expect(
      serializeQuestion({ ...question, imageStorageKey: null, imageUrl: null })
        .imageUrl,
    ).toBeNull();
    expect(serializeQuizDetail(quiz, [question]).questions).toHaveLength(1);
  });
  it('matches the documented resource keys and Bearer scheme', () => {
    expect(Object.keys(serializeQuiz(quiz)).sort()).toEqual(
      [...openapi.components.schemas.QuizSummary.required].sort(),
    );
    expect(Object.keys(serializeQuestion(question)).sort()).toEqual(
      [...openapi.components.schemas.QuestionResource.required].sort(),
    );
    expect(openapi.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });
});
