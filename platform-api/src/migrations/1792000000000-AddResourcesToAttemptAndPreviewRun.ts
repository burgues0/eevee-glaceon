import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResourcesToAttemptAndPreviewRun1792000000000
  implements MigrationInterface
{
  name = 'AddResourcesToAttemptAndPreviewRun1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attempt" ADD COLUMN IF NOT EXISTS "resources" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "scheduling_preview_runs" ADD COLUMN IF NOT EXISTS "resources" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "scheduling_preview_runs" DROP COLUMN IF EXISTS "resources"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attempt" DROP COLUMN IF EXISTS "resources"`,
    );
  }
}
