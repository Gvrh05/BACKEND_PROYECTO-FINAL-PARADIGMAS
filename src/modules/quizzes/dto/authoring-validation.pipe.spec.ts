import { BadRequestException } from '@nestjs/common';
import { AuthoringValidationPipe } from './authoring-validation.pipe';
import { UpdateQuizDto } from './update-quiz.dto';
import { UpdateQuestionDto } from './update-question.dto';

describe('AuthoringValidationPipe', () => {
  const pipe = new AuthoringValidationPipe();
  it.each([UpdateQuizDto, UpdateQuestionDto])(
    'rejects empty PATCH and unknown/read-only fields',
    async (type) => {
      const metadata = { type: 'body' as const, metatype: type };
      for (const body of [
        {},
        { id: 'spoof' },
        { authorId: 'spoof' },
        { imageUrl: 'spoof' },
        { createdAt: 'spoof' },
        null,
        [],
      ]) {
        await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
    },
  );
  it('keeps the authenticated user decorator untouched', async () => {
    const user = { userId: 'verified' };
    expect(await pipe.transform(user, { type: 'custom' })).toBe(user);
  });
  it('accepts a meaningful nullable-field PATCH', async () => {
    expect(
      await pipe.transform(
        { description: null },
        { type: 'body', metatype: UpdateQuizDto },
      ),
    ).toMatchObject({ description: null });
  });
});
