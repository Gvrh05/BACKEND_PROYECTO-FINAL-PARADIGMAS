import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Additive: the authoring schema and existing quiz data are not altered. */
export class GameSessions1794000000004 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(
      `CREATE TYPE ${schema}.game_sessions_status_enum AS ENUM ('LOBBY', 'IN_PROGRESS', 'FINISHED')`,
    );
    await runner.query(`CREATE TABLE ${schema}.game_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "roomCode" varchar(6) NOT NULL UNIQUE,
      "quizId" varchar NOT NULL,
      "hostId" varchar NOT NULL,
      status ${schema}.game_sessions_status_enum NOT NULL DEFAULT 'LOBBY',
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "startedAt" timestamptz,
      "finishedAt" timestamptz
    )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`DROP TABLE ${schema}.game_sessions`);
    await runner.query(`DROP TYPE ${schema}.game_sessions_status_enum`);
  }
}
