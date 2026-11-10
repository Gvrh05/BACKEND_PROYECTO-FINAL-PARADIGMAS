import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

export class LiveGameResult1794000000006 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE ${migrationSchema(runner)}.game_sessions ADD COLUMN result jsonb`,
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE ${migrationSchema(runner)}.game_sessions DROP COLUMN result`,
    );
  }
}
