import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

export class QuizIntegrity1794000000001 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const s = migrationSchema(runner);
    await runner.query(`
      ALTER TABLE ${s}.quizzes ADD CONSTRAINT quiz_title_length
        CHECK (char_length(btrim(title)) BETWEEN 1 AND 150);
      ALTER TABLE ${s}.quizzes ADD CONSTRAINT quiz_description_length
        CHECK (description IS NULL OR char_length(description) <= 2000);
      ALTER TABLE ${s}.questions ADD CONSTRAINT question_text_length
        CHECK (char_length(btrim(question_text)) BETWEEN 1 AND 2000);
      ALTER TABLE ${s}.questions ADD CONSTRAINT question_time_range
        CHECK (time_limit_seconds BETWEEN 1 AND 300);
      ALTER TABLE ${s}.questions ADD CONSTRAINT question_points_range
        CHECK (points BETWEEN 0 AND 100000);
      ALTER TABLE ${s}.questions ADD CONSTRAINT question_image_metadata CHECK (
        (image_storage_key IS NULL AND image_mime_type IS NULL AND image_size IS NULL)
        OR (image_storage_key IS NOT NULL AND image_mime_type IS NOT NULL AND image_size IS NOT NULL
          AND image_size > 0 AND image_mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
      );
      ALTER TABLE ${s}.question_options ADD CONSTRAINT option_position_range CHECK (position BETWEEN 0 AND 3);
      ALTER TABLE ${s}.question_options ADD CONSTRAINT option_text_length CHECK (char_length(btrim(text)) BETWEEN 1 AND 500);

      CREATE FUNCTION ${s}.assert_question_options(question_uuid uuid) RETURNS void LANGUAGE plpgsql AS $$
      DECLARE total integer; correct integer;
      BEGIN
        PERFORM id FROM ${s}.questions WHERE id = question_uuid FOR UPDATE;
        IF NOT FOUND THEN RETURN; END IF;
        SELECT count(*), count(*) FILTER (WHERE is_correct)
          INTO total, correct FROM ${s}.question_options WHERE question_id = question_uuid;
        IF total <> 4 OR correct <> 1 THEN
          RAISE EXCEPTION 'Una pregunta requiere cuatro opciones y una única correcta'
            USING ERRCODE = '23514', CONSTRAINT = 'question_options_cardinality';
        END IF;
      END;
      $$;

      CREATE FUNCTION ${s}.validate_question_options() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME = 'questions' THEN
          PERFORM ${s}.assert_question_options(NEW.id);
        ELSE
          IF TG_OP <> 'INSERT' THEN
            PERFORM ${s}.assert_question_options(OLD.question_id);
          END IF;
          IF TG_OP <> 'DELETE' THEN
            PERFORM ${s}.assert_question_options(NEW.question_id);
          END IF;
        END IF;
        RETURN NULL;
      END;
      $$;

      CREATE CONSTRAINT TRIGGER questions_options_complete
        AFTER INSERT OR UPDATE ON ${s}.questions DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION ${s}.validate_question_options();
      CREATE CONSTRAINT TRIGGER options_complete
        AFTER INSERT OR UPDATE OR DELETE ON ${s}.question_options DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION ${s}.validate_question_options();
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const s = migrationSchema(runner);
    await runner.query(`
      DROP TRIGGER options_complete ON ${s}.question_options;
      DROP TRIGGER questions_options_complete ON ${s}.questions;
      DROP FUNCTION ${s}.validate_question_options();
      DROP FUNCTION ${s}.assert_question_options(uuid);
      ALTER TABLE ${s}.question_options DROP CONSTRAINT option_text_length, DROP CONSTRAINT option_position_range;
      ALTER TABLE ${s}.questions DROP CONSTRAINT question_image_metadata, DROP CONSTRAINT question_points_range,
        DROP CONSTRAINT question_time_range, DROP CONSTRAINT question_text_length;
      ALTER TABLE ${s}.quizzes DROP CONSTRAINT quiz_description_length, DROP CONSTRAINT quiz_title_length;
    `);
  }
}
