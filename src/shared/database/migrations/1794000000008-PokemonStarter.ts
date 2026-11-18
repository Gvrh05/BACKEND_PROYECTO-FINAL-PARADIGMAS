import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Preserve archived demos while the new starter has its own fixed UUID. */
export class PokemonStarter1794000000008 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`DROP INDEX ${schema}.quizzes_single_demo_idx`);
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(
      `CREATE UNIQUE INDEX quizzes_single_demo_idx ON ${schema}.quizzes (is_demo) WHERE is_demo = true`,
    );
  }
}
