import 'reflect-metadata';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Quiz } from '../../modules/quizzes/entities/quiz.entity';
import {
  Question,
  QuestionKind,
} from '../../modules/quizzes/entities/question.entity';
import { QuestionOption } from '../../modules/quizzes/entities/question-option.entity';
import { databaseOptions } from './database.options';
import { authenticateDemoAccount } from './demo-account';

export const DEMO_QUIZ_ID = '7ac9810a-b36c-4c85-8b58-b296434f0110';

const BINARY_QUIZ_ID = 'efed51ad-1c55-4817-a164-c70f679e8000';
const BINARY_IMAGE = 'efed51ad-1c55-4817-a164-c70f679e8001.png';

/** Manual only: stable primary keys make repeated runs idempotent. */
export async function seed() {
  await ConfigModule.forRoot({ isGlobal: true });
  const config = new ConfigService();
  const user = await authenticateDemoAccount();
  if (config.get('NODE_ENV') === 'production') {
    throw new Error('El seed de demo no se permite en producción');
  }
  const database = new DataSource({
    ...databaseOptions(config),
  });
  await database.initialize();
  try {
    await database.transaction(async (manager) => {
      const existing = await manager
        .getRepository(Quiz)
        .findOneBy({ id: DEMO_QUIZ_ID });
      if (existing) {
        if (!existing.isDemo)
          await manager
            .getRepository(Quiz)
            .update({ id: existing.id }, { isDemo: true });
        return;
      }
      await manager.getRepository(Quiz).upsert(
        {
          id: DEMO_QUIZ_ID,
          title: 'Demo Punto 3: Verdadero / Falso',
          authorId: user.id,
          isDemo: true,
        },
        ['id'],
      );
      await manager.getRepository(Question).upsert(
        [
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0111',
            quizId: DEMO_QUIZ_ID,
            questionText: 'TypeScript permite declarar tipos estáticos.',
          },
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0112',
            quizId: DEMO_QUIZ_ID,
            questionText: 'Todas las salas comparten sus participantes.',
          },
        ],
        ['id'],
      );
      await manager.getRepository(QuestionOption).upsert(
        [
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0121',
            questionId: '7ac9810a-b36c-4c85-8b58-b296434f0111',
            text: 'Verdadero',
            isCorrect: true,
            position: 0,
          },
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0122',
            questionId: '7ac9810a-b36c-4c85-8b58-b296434f0111',
            text: 'Falso',
            isCorrect: false,
            position: 1,
          },
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0123',
            questionId: '7ac9810a-b36c-4c85-8b58-b296434f0112',
            text: 'Verdadero',
            isCorrect: false,
            position: 0,
          },
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0124',
            questionId: '7ac9810a-b36c-4c85-8b58-b296434f0112',
            text: 'Falso',
            isCorrect: true,
            position: 1,
          },
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0125',
            questionId: '7ac9810a-b36c-4c85-8b58-b296434f0111',
            text: 'No sé',
            isCorrect: false,
            position: 2,
          },
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0126',
            questionId: '7ac9810a-b36c-4c85-8b58-b296434f0111',
            text: 'Sin respuesta',
            isCorrect: false,
            position: 3,
          },
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0127',
            questionId: '7ac9810a-b36c-4c85-8b58-b296434f0112',
            text: 'No sé',
            isCorrect: false,
            position: 2,
          },
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0128',
            questionId: '7ac9810a-b36c-4c85-8b58-b296434f0112',
            text: 'Sin respuesta',
            isCorrect: false,
            position: 3,
          },
        ],
        ['id'],
      );
    });
    const owner = user.id;
    const folder = resolve(
      process.env.UPLOADS_DEST || './uploads',
      'questions',
    );
    await mkdir(folder, { recursive: true });
    const image = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300"><rect width="640" height="300" fill="#e5eef9"/><circle cx="320" cy="150" r="90" fill="#3868ca"/></svg>',
      ),
    )
      .png()
      .toFile(join(folder, BINARY_IMAGE));
    await database.transaction(async (manager) => {
      if (await manager.getRepository(Quiz).existsBy({ id: BINARY_QUIZ_ID }))
        return;
      await manager.getRepository(Quiz).upsert(
        {
          id: BINARY_QUIZ_ID,
          title: 'Demo en vivo · Verdadero / Falso',
          authorId: owner,
        },
        ['id'],
      );
      const examples = [
        {
          suffix: '1',
          text: 'La figura azul de la imagen es un círculo.',
          correct: true,
        },
        {
          suffix: '2',
          text: 'Todas las salas comparten sus participantes.',
          correct: false,
        },
      ];
      for (const example of examples) {
        const id = 'efed51ad-1c55-4817-a164-c70f679e800' + example.suffix;
        await manager.getRepository(Question).upsert(
          {
            id,
            quizId: BINARY_QUIZ_ID,
            kind: QuestionKind.TRUE_FALSE,
            questionText: example.text,
            timeLimitSeconds: 20,
            ...(example.suffix === '1' && {
              imageStorageKey: BINARY_IMAGE,
              imageUrl: '/uploads/questions/' + BINARY_IMAGE,
              imageMimeType: 'image/png',
              imageSize: image.size,
            }),
          },
          ['id'],
        );
        await manager.getRepository(QuestionOption).upsert(
          [true, false].map((answer, position) => ({
            id:
              'efed51ad-1c55-4817-a164-c70f679e80' + example.suffix + position,
            questionId: id,
            text: answer ? 'Verdadero' : 'Falso',
            isCorrect: answer === example.correct,
            position,
          })),
          ['id'],
        );
      }
    });
    console.log('Quiz binario de demo: ' + BINARY_QUIZ_ID);
    console.log(`Quiz de demo: ${DEMO_QUIZ_ID}; ownerId: test-host-id`);
  } finally {
    await database.destroy();
  }
}

// Importing this file never runs the seed (including from tests).
if (require.main === module) {
  void seed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Seed fallido');
    process.exitCode = 1;
  });
}
