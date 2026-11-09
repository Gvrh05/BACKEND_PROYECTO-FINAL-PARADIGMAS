import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { getDatabaseOptions } from '../../src/shared/database/database.config';
import { Quiz } from '../../src/modules/quizzes/entities/quiz.entity';
import { Question } from '../../src/modules/quizzes/entities/question.entity';
import { QuestionOption } from '../../src/modules/quizzes/entities/question-option.entity';
import { FileCleanupJob } from '../../src/modules/quizzes/entities/file-cleanup-job.entity';
import { InitialQuizAuthoring1794000000000 } from '../../src/shared/database/migrations/1794000000000-InitialQuizAuthoring';
import { QuizIntegrity1794000000001 } from '../../src/shared/database/migrations/1794000000001-QuizIntegrity';

export async function createTestDatabase() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL debe apuntar a una base PostgreSQL descartable terminada en _test',
    );
  }
  const url = new URL(process.env.TEST_DATABASE_URL);
  if (!url.pathname.endsWith('_test')) {
    throw new Error('Por seguridad, la base de pruebas debe terminar en _test');
  }
  const schema = `test_${randomUUID().replace(/-/g, '')}`;
  url.searchParams.set('schema', schema);
  const options = getDatabaseOptions({ DATABASE_URL: url.toString() });
  const dataSource = new DataSource({
    ...options,
    entities: [Quiz, Question, QuestionOption, FileCleanupJob],
    migrations: [InitialQuizAuthoring1794000000000, QuizIntegrity1794000000001],
  });
  await dataSource.initialize();
  try {
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    await dataSource.runMigrations();
  } catch (error) {
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await dataSource.destroy();
    throw error;
  }
  return {
    dataSource,
    url: url.toString(),
    schema,
    async dispose() {
      // Only this randomly-created test schema is ever removed.
      await dataSource.query(`DROP SCHEMA "${schema}" CASCADE`);
      await dataSource.destroy();
    },
  };
}
