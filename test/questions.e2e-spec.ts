import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { QuestionOption } from '../src/modules/quizzes/entities/question-option.entity';
import { Question } from '../src/modules/quizzes/entities/question.entity';
import { createTestHarness } from './helpers/test-app';
import { questionBody } from './helpers/quiz-fixtures';
import openapi from '../docs/openapi.json';

describe('Question authoring', () => {
  let harness: Awaited<ReturnType<typeof createTestHarness>>;
  let app: INestApplication;
  const root = '/kahoot-api/quizzes';
  beforeAll(async () => {
    harness = await createTestHarness();
    app = await harness.startApp();
  });
  afterAll(async () => {
    if (harness) await harness.dispose();
  });
  const http = () => request(app.getHttpServer());
  const makeQuiz = async () =>
    (
      await http()
        .post(root)
        .auth(harness.tokenA, { type: 'bearer' })
        .send({ title: 'Quiz' })
        .expect(201)
    ).body;
  const makeQuestion = async (quizId: string) =>
    (
      await http()
        .post(`${root}/${quizId}/questions`)
        .auth(harness.tokenA, { type: 'bearer' })
        .send(questionBody())
        .expect(201)
    ).body;

  it('creates, lists, reads, patches and deletes a question independently', async () => {
    const quiz = await makeQuiz();
    const question = await makeQuestion(quiz.id);
    const path = `${root}/${quiz.id}/questions/${question.id}`;
    expect(question).toMatchObject({
      quizId: quiz.id,
      timeLimitSeconds: 20,
      points: 1000,
      imageUrl: null,
    });
    expect(question.options).toHaveLength(4);
    expect(
      question.options.every((option: { id: string }) =>
        /^[\da-f-]{36}$/.test(option.id),
      ),
    ).toBe(true);
    await http()
      .get(`${root}/${quiz.id}/questions`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200, [question]);
    await http()
      .get(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200, question);
    const { body: changed } = await http()
      .patch(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ questionText: '<b>Texto literal</b>' })
      .expect(200);
    expect(changed).toMatchObject({
      questionText: '<b>Texto literal</b>',
      timeLimitSeconds: 20,
      points: 1000,
      options: question.options,
    });
    const replacement = questionBody().options.map((option, index) => ({
      ...option,
      isCorrect: index === 3,
    }));
    const { body: replaced } = await http()
      .patch(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({ options: replacement, points: 0 })
      .expect(200);
    expect(
      replaced.options.filter(
        (option: { isCorrect: boolean }) => option.isCorrect,
      ),
    ).toHaveLength(1);
    expect(replaced.options[3].isCorrect).toBe(true);
    expect(replaced.points).toBe(0);
    await http()
      .patch(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .send({})
      .expect(400);
    await http()
      .delete(path)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(204);
    await http().get(path).auth(harness.tokenA, { type: 'bearer' }).expect(404);
    expect(
      await harness.dataSource
        .getRepository(QuestionOption)
        .countBy({ questionId: question.id }),
    ).toBe(0);
  });

  it('checks ownership and nested membership in every operation', async () => {
    const first = await makeQuiz();
    const second = await makeQuiz();
    const question = await makeQuestion(first.id);
    for (const [quizId, token] of [
      [first.id, harness.tokenB],
      [second.id, harness.tokenA],
      [randomUUID(), harness.tokenA],
    ]) {
      const path = `${root}/${quizId}/questions/${question.id}`;
      await http().get(path).auth(token, { type: 'bearer' }).expect(404);
      await http()
        .patch(path)
        .auth(token, { type: 'bearer' })
        .send({ questionText: 'No' })
        .expect(404);
      await http().delete(path).auth(token, { type: 'bearer' }).expect(404);
    }
    await http()
      .get(`${root}/${first.id}/questions`)
      .auth(harness.tokenB, { type: 'bearer' })
      .expect(404);
    await http()
      .post(`${root}/${first.id}/questions`)
      .auth(harness.tokenB, { type: 'bearer' })
      .send(questionBody())
      .expect(404);
    expect(
      await harness.dataSource
        .getRepository(Question)
        .countBy({ id: question.id }),
    ).toBe(1);
  });

  it('rolls back replaced options when PostgreSQL rejects their insertion', async () => {
    const quiz = await makeQuiz();
    const question = await makeQuestion(quiz.id);
    const schema = `"${harness.schema}"`;
    await harness.dataSource
      .query(`CREATE FUNCTION ${schema}.fail_option_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'induced insertion failure'; END; $$;
      CREATE TRIGGER induced_failure BEFORE INSERT ON ${schema}.question_options FOR EACH ROW WHEN (NEW.text = 'FAIL_INSERT') EXECUTE FUNCTION ${schema}.fail_option_insert()`);
    try {
      const choices = questionBody().options;
      choices[0].text = 'FAIL_INSERT';
      const response = await http()
        .patch(`${root}/${quiz.id}/questions/${question.id}`)
        .auth(harness.tokenA, { type: 'bearer' })
        .send({ options: choices })
        .expect(500);
      expect(response.body.error).toBe('Internal server error');
      const { body: after } = await http()
        .get(`${root}/${quiz.id}/questions/${question.id}`)
        .auth(harness.tokenA, { type: 'bearer' })
        .expect(200);
      expect(after).toEqual(question);
    } finally {
      await harness.dataSource.query(
        `DROP TRIGGER induced_failure ON ${schema}.question_options; DROP FUNCTION ${schema}.fail_option_insert()`,
      );
    }
  });

  it('accepts the documented question example and returns the declared direct resources', async () => {
    const quiz = await makeQuiz();
    const { body: question } = await http()
      .post(`${root}/${quiz.id}/questions`)
      .auth(harness.tokenA, { type: 'bearer' })
      .send(openapi.components.schemas.CreateQuestion.example)
      .expect(201);
    expect(Object.keys(question).sort()).toEqual(
      [...openapi.components.schemas.QuestionResource.required].sort(),
    );
    expect(question.questionText).toBe(
      openapi.components.schemas.CreateQuestion.example.questionText,
    );
    expect(
      openapi.paths['/quizzes/{quizId}/questions'].post.responses,
    ).toHaveProperty('201');
    const detail = await http()
      .get(`${root}/${quiz.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(200);
    expect(detail.body.questions).toEqual([question]);
    await http()
      .delete(`${root}/${quiz.id}`)
      .auth(harness.tokenA, { type: 'bearer' })
      .expect(204);
    expect(openapi.paths['/quizzes/{quizId}'].delete.responses).toHaveProperty(
      '204',
    );
  });
});
