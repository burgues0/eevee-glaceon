import { Assignment } from 'src/assignment/entities/assignment.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LearningModuleActivityKind } from '../enums/learning-module-activity-kind.enum';
import { LearningModuleActivityStatus } from '../enums/learning-module-activity-status.enum';

// Catalog row a module sees through GET /catalog. `externalActivityId` is the
// only identifier the module is allowed to use for content — `assignmentId`
// stays opaque to it, same as the guide's "módulo não acessa banco EEVEE".
@Entity('learning_module_activity')
@Index('IDX_learning_module_activity_module_id', ['moduleId', 'externalActivityId'], { unique: true })
export class LearningModuleActivity {
  @PrimaryGeneratedColumn('uuid')
  externalActivityId: string;

  @Column()
  moduleId: string;

  @Column()
  assignmentId: number;

  @ManyToOne(() => Assignment)
  @JoinColumn({ name: 'assignmentId' })
  assignment: Assignment;

  @Column({ type: 'enum', enum: LearningModuleActivityKind })
  kind: LearningModuleActivityKind;

  @Column({
    type: 'enum',
    enum: LearningModuleActivityStatus,
    default: LearningModuleActivityStatus.DRAFT,
  })
  status: LearningModuleActivityStatus;

  @Column()
  title: string;

  @Column({ default: 1 })
  revision: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
