import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLearningModuleTables1793000000000
  implements MigrationInterface
{
  name = 'CreateLearningModuleTables1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."learning_module_activity_kind_enum" AS ENUM('practice', 'quiz');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."learning_module_activity_status_enum" AS ENUM('draft', 'published', 'retired');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "learning_module_activity" (
        "externalActivityId" uuid NOT NULL DEFAULT gen_random_uuid(),
        "moduleId" character varying NOT NULL,
        "assignmentId" integer NOT NULL,
        "kind" "public"."learning_module_activity_kind_enum" NOT NULL,
        "status" "public"."learning_module_activity_status_enum" NOT NULL DEFAULT 'draft',
        "title" character varying NOT NULL,
        "revision" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_learning_module_activity" PRIMARY KEY ("externalActivityId"),
        CONSTRAINT "FK_learning_module_activity_assignment" FOREIGN KEY ("assignmentId") REFERENCES "assignment"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_learning_module_activity_module_id"
      ON "learning_module_activity" ("moduleId", "externalActivityId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "learning_module_attempt_idempotency" (
        "idempotencyKey" character varying NOT NULL,
        "moduleId" character varying NOT NULL,
        "externalActivityId" uuid NOT NULL,
        "userId" integer NOT NULL,
        "attemptId" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_learning_module_attempt_idempotency" PRIMARY KEY ("idempotencyKey"),
        CONSTRAINT "FK_learning_module_attempt_idempotency_attempt" FOREIGN KEY ("attemptId") REFERENCES "attempt"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "learning_module_attempt_idempotency"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "learning_module_activity"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."learning_module_activity_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."learning_module_activity_kind_enum"`);
  }
}
