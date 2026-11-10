import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateQuizDto } from './create-quiz.dto';
import { UpdateQuizDto } from './update-quiz.dto';
import { AddQuestionDto } from './add-question.dto';
import { UpdateQuestionDto } from './update-question.dto';

describe('Authoring DTOs', () => {
  const options = () =>
    Array.from({ length: 4 }, (_, index) => ({
      text: ` Opción ${index} `,
      isCorrect: index === 0,
    }));
  function check<T extends object>(type: new () => T, body: unknown) {
    const dto = plainToInstance(type, body, {
      enableImplicitConversion: false,
    });
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  }

  it('trims quiz and option text while preserving actual booleans', () => {
    expect(check(CreateQuizDto, { title: ' Quiz ' }).dto.title).toBe('Quiz');
    const { dto, errors } = check(AddQuestionDto, {
      questionText: ' Pregunta ',
      options: options(),
    });
    expect(errors).toHaveLength(0);
    expect(dto.questionText).toBe('Pregunta');
    expect(dto.options[0].text).toBe('Opción 0');
    expect(dto.timeLimitSeconds).toBeUndefined();
    expect(dto.points).toBeUndefined();
  });

  it.each([0, 2])('rejects %i correct answers', (correct) => {
    const choices = options().map((option, index) => ({
      ...option,
      isCorrect: index < correct,
    }));
    expect(
      check(AddQuestionDto, { questionText: 'Q', options: choices }).errors
        .length,
    ).toBeGreaterThan(0);
  });

  it.each(
    [
      [],
      options().slice(1),
      [...options(), { text: 'Extra', isCorrect: false }],
    ].map((choices) => ({ choices })),
  )('rejects a wrong option count', ({ choices }) => {
    expect(
      check(AddQuestionDto, { questionText: 'Q', options: choices }).errors
        .length,
    ).toBeGreaterThan(0);
  });

  it.each(['false', 'true', 0, 1, null])(
    'rejects a non-boolean correctness flag %s',
    (flag) => {
      const choices: unknown[] = options();
      choices[1] = { text: 'Incorrecta', isCorrect: flag };
      expect(
        check(AddQuestionDto, { questionText: 'Q', options: choices }).errors
          .length,
      ).toBeGreaterThan(0);
    },
  );

  it.each([
    { timeLimitSeconds: null },
    { timeLimitSeconds: '20' },
    { timeLimitSeconds: 0 },
    { timeLimitSeconds: 301 },
    { timeLimitSeconds: 1.5 },
    { points: -1 },
    { points: 100001 },
    { points: '1000' },
    { points: null },
  ])('rejects invalid numeric input %j', (fields) => {
    expect(
      check(AddQuestionDto, {
        questionText: 'Q',
        options: options(),
        ...fields,
      }).errors.length,
    ).toBeGreaterThan(0);
    expect(check(UpdateQuestionDto, fields).errors.length).toBeGreaterThan(0);
  });

  it.each([
    { title: '' },
    { title: ' ' },
    { title: null },
    { title: 'x'.repeat(151) },
    { title: 'Q', authorId: 'spoof' },
    { title: 'Q', description: 'x'.repeat(2001) },
    { title: 'Q', coverImageUrl: 'javascript:alert(1)' },
  ])('rejects invalid quiz input %j', (body) => {
    expect(check(CreateQuizDto, body).errors.length).toBeGreaterThan(0);
  });

  it('allows clearing only explicitly nullable fields', () => {
    expect(
      check(UpdateQuizDto, { description: null, coverImageUrl: null }).errors,
    ).toHaveLength(0);
    expect(check(UpdateQuizDto, { title: null }).errors.length).toBeGreaterThan(
      0,
    );
    expect(
      check(UpdateQuestionDto, { questionText: null }).errors.length,
    ).toBeGreaterThan(0);
    expect(
      check(UpdateQuestionDto, { options: null }).errors.length,
    ).toBeGreaterThan(0);
  });

  it('rejects empty nested texts and server-managed fields', () => {
    expect(
      check(AddQuestionDto, {
        questionText: 'Q',
        options: [{ text: ' ', isCorrect: true }, ...options().slice(1)],
      }).errors.length,
    ).toBeGreaterThan(0);
    expect(
      check(UpdateQuestionDto, { imageUrl: 'https://example.com/image.png' })
        .errors.length,
    ).toBeGreaterThan(0);
  });
});
