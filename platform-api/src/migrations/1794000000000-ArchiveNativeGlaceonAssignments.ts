import { MigrationInterface, QueryRunner } from 'typeorm';

// Fase 3 do refactor GLACEON: o conteúdo desses 2 assignments nativos
// (Terraform/Ansible) agora é servido pela Learning Module Integration API
// via learning_module_activity, não mais pela listagem/workspace nativos.
// Arquivamos em vez de apagar: histórico de tentativas/notas fica intacto.
export class ArchiveNativeGlaceonAssignments1794000000000
  implements MigrationInterface
{
  name = 'ArchiveNativeGlaceonAssignments1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assignment" ADD COLUMN IF NOT EXISTS "archived" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "assignment" SET "archived" = true WHERE "workerType" IN ('terraform', 'ansible')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "assignment" SET "archived" = false WHERE "workerType" IN ('terraform', 'ansible')`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment" DROP COLUMN IF EXISTS "archived"`,
    );
  }
}
