import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Question } from '../src/modules/quizzes/entities/question.entity';
import { QuestionOption } from '../src/modules/quizzes/entities/question-option.entity';
import { Quiz } from '../src/modules/quizzes/entities/quiz.entity';
import { createTestHarness } from './helpers/test-app';
import { questionBody } from './helpers/quiz-fixtures';

describe('Authoring isolation and concurrency', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let app: INestApplication;
  const root = '/kahoot-api/quizzes';
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    harness = await createTestHarness();
    app = await harness.startApp();
  });
  afterAll(async () => {
    if (harness) await harness.dispose();
  });
  async function resources() {
    const { body: quiz } = await http()
      .post(root)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ title: 'Concurrente' })
      .expect(201);
    const { body: question } = await http()
      .post(`${root}/${quiz.id}/questions`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send(questionBody())
      .expect(201);
    return {
      quiz,
      question,
      quizPath: `${root}/${quiz.id}`,
      questionPath: `${root}/${quiz.id}/questions/${question.id}`,
    };
  }

  async function expectNoOrphans() {
    const s = `"${harness.schema}"`;
    const [result] = await harness.dataSource.query(
      `SELECT count(*)::int AS total FROM ${s}.question_options o LEFT JOIN ${s}.questions q ON q.id=o.question_id WHERE q.id IS NULL`,
    );
    expect(result.total).toBe(0);
  }

  it('rejects foreign and anonymous calls for every resource JSON operation without side effects', async () => {
    const { quiz, question, quizPath, questionPath } = await resources();
    const choices = questionBody();
    const operations = [
      () => http().get(quizPath),
      () => http().patch(quizPath).send({ title: 'Intrusión' }),
      () => http().delete(quizPath),
      () => http().get(`${quizPath}/questions`),
      () => http().post(`${quizPath}/questions`).send(choices),
      () => http().get(questionPath),
      () => http().patch(questionPath).send({ questionText: 'Intrusión' }),
      () => http().delete(questionPath),
    ];
    const before = (
      await http()
        .get(quizPath)
        .auth(harness.tokenA, { type: 'bearer' })
        .expect(200)
    ).body;
    for (const operation of operations) {
      await operation().auth(harness.tokenB, { type: 'bearer' }).expect(404);
      await operation().expect(401);
    }
    await http().post(root).send({ title: 'Sin sesión' }).expect(401);
    const foreignList = await http()
      .get(root)
      .auth(harness.tokenB, { type: 'bearer' })
      .expect(200);
    expect(
      foreignList.body.find((item: { id: string }) => item.id === quiz.id),
    ).toBeUndefined();
    const after = (
      await http()
        .get(quizPath)
        .auth(harness.tokenA, { type: 'bearer' })
        .expect(200)
    ).body;
    expect(after).toEqual(before);
    expect(after.questions[0].id).toBe(question.id);
  });

  it('serializes simultaneous option replacements into complete sets', async () => {
    const { question, questionPath } = await resources();
    await Promise.all(
      Array.from({ length: 8 }, (_, index) => {
        const options = questionBody().options.map((option, position) => ({
          text: `${index}:${option.text}`,
          isCorrect: position === index % 4,
        }));
        return http()
          .patch(questionPath)
          .auth(harness.tokenA, { type: 'bearer' })
          .send({ options })
          .expect(200);
      }),
    );
    const after = (
      await http()
        .get(questionPath)
        .auth(harness.tokenA, { type: 'bearer' })
        .expect(200)
    ).body;
    expect(after.options).toHaveLength(4);
    expect(
      after.options.filter(
        (option: { isCorrect: boolean }) => option.isCorrect,
      ),
    ).toHaveLength(1);
    expect(
      new Set(
        after.options.map(
          (option: { text: string }) => option.text.split(':')[0],
        ),
      ).size,
    ).toBe(1);
    expect(
      await harness.dataSource
        .getRepository(QuestionOption)
        .countBy({ questionId: question.id }),
    ).toBe(4);
  });

  it('leaves no children when quiz deletion races with question creation', async () => {
    const { quiz, quizPath } = await resources();
    const [removed, created] = await Promise.all([
      http().delete(quizPath).auth(harness.tokenA, { type: 'bearer' }),
      http()
        .post(`${quizPath}/questions`)
        .auth(harness.tokenA, { type: 'bearer' })
        .send(questionBody()),
    ]);
    expect(removed.status).toBe(204);
    expect([201, 404]).toContain(created.status);
    expect(
      await harness.dataSource.getRepository(Quiz).countBy({ id: quiz.id }),
    ).toBe(0);
    expect(
      await harness.dataSource
        .getRepository(Question)
        .countBy({ quizId: quiz.id }),
    ).toBe(0);
    await expectNoOrphans();
  });

  it('handles two deletions and editing/deleting the same question without orphan options', async () => {
    const { question, questionPath, quizPath } = await resources();
    const results = await Promise.all([
      http().delete(questionPath).auth(harness.tokenA, { type: 'bearer' }),
      http()
        .patch(questionPath)
        .auth(harness.tokenA, { type: 'bearer' })
        .send({ options: questionBody().options }),
    ]);
    expect(results[0].status).toBe(204);
    expect([200, 404]).toContain(results[1].status);
    expect(
      await harness.dataSource
        .getRepository(QuestionOption)
        .countBy({ questionId: question.id }),
    ).toBe(0);
    const deletes = await Promise.all(
      [1, 2].map(() =>
        http().delete(quizPath).auth(harness.tokenA, { type: 'bearer' }),
      ),
    );
    expect(deletes.map((response) => response.status).sort()).toEqual([
      204, 404,
    ]);
    await expectNoOrphans();
  });
});
