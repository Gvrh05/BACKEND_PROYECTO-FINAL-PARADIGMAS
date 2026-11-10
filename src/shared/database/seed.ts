import 'reflect-metadata';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Quiz } from '../../modules/quizzes/entities/quiz.entity';
import { Question } from '../../modules/quizzes/entities/question.entity';
import { GameSessionEntity } from '../../modules/game-session/entities/game-session.entity';
import { databaseOptions } from './database.options';

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
    entities: [Quiz, Question, GameSessionEntity],
  });
  await database.initialize();
  try {
    await database.transaction(async (manager) => {
      await manager.getRepository(Quiz).upsert(
        {
          id: DEMO_QUIZ_ID,
          title: 'Demo Punto 3: Verdadero / Falso',
          ownerId: 'test-host-id',
        },
        ['id'],
      );
      await manager.getRepository(Question).upsert(
        [
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0111',
            quizId: DEMO_QUIZ_ID,
            statement: 'TypeScript permite declarar tipos estáticos.',
            correctAnswer: true,
            order: 1,
          },
          {
            id: '7ac9810a-b36c-4c85-8b58-b296434f0112',
            quizId: DEMO_QUIZ_ID,
            statement: 'Todas las salas comparten sus participantes.',
            correctAnswer: false,
            order: 2,
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
