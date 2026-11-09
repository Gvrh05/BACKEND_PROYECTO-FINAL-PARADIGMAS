import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

export class PublicQuestionImageUrl1794000000003 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`
      ALTER TABLE ${schema}.questions ADD COLUMN image_url text;
      UPDATE ${schema}.questions
        SET image_url = '/uploads/questions/' || image_storage_key
        WHERE image_storage_key IS NOT NULL;
      ALTER TABLE ${schema}.questions ADD CONSTRAINT question_image_public_url CHECK (
        (image_storage_key IS NULL AND image_url IS NULL)
        OR (image_storage_key IS NOT NULL
          AND image_url = '/uploads/questions/' || image_storage_key)
      );
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`
      ALTER TABLE ${schema}.questions DROP CONSTRAINT question_image_public_url;
      ALTER TABLE ${schema}.questions DROP COLUMN image_url;
    `);
  }
}
