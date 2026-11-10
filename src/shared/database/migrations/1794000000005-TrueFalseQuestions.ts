import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

export class TrueFalseQuestions1794000000005 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`
      ALTER TABLE ${schema}.questions ADD COLUMN kind text NOT NULL DEFAULT 'MULTIPLE_CHOICE'
        CHECK (kind IN ('MULTIPLE_CHOICE', 'TRUE_FALSE'));
      CREATE OR REPLACE FUNCTION ${schema}.assert_question_options(question_uuid uuid)
      RETURNS void LANGUAGE plpgsql AS $$
      DECLARE question_kind text; total integer; correct integer; binary_labels integer;
      BEGIN
        SELECT kind INTO question_kind FROM ${schema}.questions WHERE id = question_uuid FOR UPDATE;
        IF NOT FOUND THEN RETURN; END IF;
        SELECT count(*), count(*) FILTER (WHERE is_correct),
          count(DISTINCT text) FILTER (WHERE text IN ('Verdadero', 'Falso'))
          INTO total, correct, binary_labels FROM ${schema}.question_options WHERE question_id = question_uuid;
        IF correct <> 1 OR (question_kind = 'TRUE_FALSE' AND (total <> 2 OR binary_labels <> 2))
          OR (question_kind = 'MULTIPLE_CHOICE' AND total <> 4) THEN
          RAISE EXCEPTION 'Opciones incompatibles con el tipo de pregunta'
            USING ERRCODE = '23514', CONSTRAINT = 'question_options_cardinality';
        END IF;
      END;
      $$;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM ${schema}.questions WHERE kind = 'TRUE_FALSE') THEN
          RAISE EXCEPTION 'Preserve o convierta las preguntas binarias antes de revertir';
        END IF;
      END $$;
      CREATE OR REPLACE FUNCTION ${schema}.assert_question_options(question_uuid uuid)
      RETURNS void LANGUAGE plpgsql AS $$
      DECLARE total integer; correct integer;
      BEGIN
        PERFORM id FROM ${schema}.questions WHERE id = question_uuid FOR UPDATE;
        IF NOT FOUND THEN RETURN; END IF;
        SELECT count(*), count(*) FILTER (WHERE is_correct)
          INTO total, correct FROM ${schema}.question_options WHERE question_id = question_uuid;
        IF total <> 4 OR correct <> 1 THEN
          RAISE EXCEPTION 'Una pregunta requiere cuatro opciones y una única correcta'
            USING ERRCODE = '23514', CONSTRAINT = 'question_options_cardinality';
        END IF;
      END;
      $$;
      ALTER TABLE ${schema}.questions DROP COLUMN kind;
    `);
  }
}
