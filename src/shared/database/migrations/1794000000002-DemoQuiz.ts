import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

export class DemoQuiz1794000000002 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`
      ALTER TABLE ${schema}.quizzes
        ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
      CREATE UNIQUE INDEX quizzes_single_demo_idx
        ON ${schema}.quizzes (is_demo) WHERE is_demo = true;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`
      DROP INDEX ${schema}.quizzes_single_demo_idx;
      ALTER TABLE ${schema}.quizzes DROP COLUMN is_demo;
    `);
  }
}
