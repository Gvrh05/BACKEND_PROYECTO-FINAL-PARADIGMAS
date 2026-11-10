import 'reflect-metadata';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Quiz } from '../../modules/quizzes/entities/quiz.entity';
import { Question } from '../../modules/quizzes/entities/question.entity';
import { QuestionOption } from '../../modules/quizzes/entities/question-option.entity';
import { databaseOptions } from './database.options';
import { PUNTO3_DEMO_AUTHOR_ID } from './punto3-demo-owner';

export const DEMO_QUIZ_ID = '7ac9810a-b36c-4c85-8b58-b296434f0110';

/** Manual only: stable primary keys make repeated runs idempotent. */
export async function seed() {
  await ConfigModule.forRoot({ isGlobal: true });
  const config = new ConfigService();
  if (config.get('NODE_ENV') === 'production') {
    throw new Error('El seed de demo no se permite en producción');
  }
  const database = new DataSource({
    ...databaseOptions(config),
  });
  await database.initialize();
  try {
    await database.transaction(async (manager) => {
      await manager.getRepository(Quiz).upsert(
        {
          id: DEMO_QUIZ_ID,
          title: 'Demo Punto 3: Verdadero / Falso',
          authorId: PUNTO3_DEMO_AUTHOR_ID,
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
