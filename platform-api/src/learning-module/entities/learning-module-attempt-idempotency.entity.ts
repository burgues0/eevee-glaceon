import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Lets POST .../attempts be retried safely with the same Idempotency-Key —
// the guide requires EEVEE to "devolver o resultado já registrado em vez de
// criar uma segunda tentativa" when a module retries a lost response.
@Entity('learning_module_attempt_idempotency')
export class LearningModuleAttemptIdempotency {
  @PrimaryColumn()
  idempotencyKey: string;

  @Column()
  moduleId: string;

  @Column()
  externalActivityId: string;

  @Column()
  userId: number;

  @Column()
  attemptId: number;

  @CreateDateColumn()
  createdAt: Date;
}
