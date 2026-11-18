import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

export class FlexibleQuestionOptions1794000000007 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await this.configure(runner, true);
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT q.id FROM ${schema}.questions q
          JOIN ${schema}.question_options o ON o.question_id = q.id
          WHERE q.kind = 'MULTIPLE_CHOICE'
          GROUP BY q.id HAVING count(*) <> 4
        ) THEN
          RAISE EXCEPTION 'Ajusta las preguntas de opción múltiple a cuatro opciones antes de revertir';
        END IF;
      END $$;
    `);
    await this.configure(runner, false);
  }

  private async configure(
    runner: QueryRunner,
    flexible: boolean,
  ): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`
      ALTER TABLE ${schema}.question_options DROP CONSTRAINT option_position_range,
        ADD CONSTRAINT option_position_range CHECK (position BETWEEN 0 AND ${flexible ? 4 : 3});
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
          OR (question_kind = 'MULTIPLE_CHOICE' AND ${flexible ? 'total NOT BETWEEN 2 AND 5' : 'total <> 4'}) THEN
          RAISE EXCEPTION 'Opciones incompatibles con el tipo de pregunta'
            USING ERRCODE = '23514', CONSTRAINT = 'question_options_cardinality';
        END IF;
      END;
      $$;
    `);
  }
}
