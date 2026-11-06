import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTerraformAndAnsibleWorkerTypes1791700000000
  implements MigrationInterface
{
  name = 'AddTerraformAndAnsibleWorkerTypes1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."assignment_workertype_enum" ADD VALUE IF NOT EXISTS 'terraform'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."assignment_workertype_enum" ADD VALUE IF NOT EXISTS 'ansible'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."template_workertype_enum" ADD VALUE IF NOT EXISTS 'terraform'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."template_workertype_enum" ADD VALUE IF NOT EXISTS 'ansible'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres não suporta remover enums
  }
}
