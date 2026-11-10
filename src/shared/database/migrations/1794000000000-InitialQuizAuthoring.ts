import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

export class InitialQuizAuthoring1794000000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const s = migrationSchema(runner);
    await runner.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);
    await runner.query(`
      CREATE TABLE ${s}.quizzes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id uuid NOT NULL,
        title varchar(150) NOT NULL,
        description text,
        cover_image_url text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX quizzes_author_created_idx ON ${s}.quizzes (author_id, created_at, id);
      CREATE TABLE ${s}.questions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        quiz_id uuid NOT NULL REFERENCES ${s}.quizzes(id) ON DELETE CASCADE,
        question_text text NOT NULL,
        time_limit_seconds integer NOT NULL DEFAULT 20,
        points integer NOT NULL DEFAULT 1000,
        image_storage_key text UNIQUE,
        image_mime_type text,
        image_size integer,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX questions_quiz_created_idx ON ${s}.questions (quiz_id, created_at, id);
      CREATE TABLE ${s}.question_options (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        question_id uuid NOT NULL REFERENCES ${s}.questions(id) ON DELETE CASCADE,
        text varchar(500) NOT NULL,
        is_correct boolean NOT NULL,
        position smallint NOT NULL,
        CONSTRAINT question_options_position_unique UNIQUE (question_id, position)
      );
      CREATE TABLE ${s}.file_cleanup_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        storage_key text NOT NULL UNIQUE,
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX file_cleanup_due_idx ON ${s}.file_cleanup_jobs (next_attempt_at);
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const s = migrationSchema(runner);
    await runner.query(`
      DROP TABLE ${s}.file_cleanup_jobs;
      DROP TABLE ${s}.question_options;
      DROP TABLE ${s}.questions;
      DROP TABLE ${s}.quizzes;
    `);
  }
}
