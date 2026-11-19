import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { WorkerResourceNode } from '@eevee/execution-contracts';

// Extension proposed on top of the advisor's guide: the guide documents this
// endpoint only for `architecture-forms` quizzes. GLACEON needs a graded
// practice result instead (remote execution, pass/fail, resource tree) — see
// docs/decisoes-tecnicas.md for why this is pending confirmation with him
// before it becomes the official shape every module relies on. `quiz` is
// intentionally not implemented here: no quiz module exists in this fork yet.
export class SubmitAttemptDto {
  @ApiProperty({ enum: ['practice'] })
  @IsIn(['practice'])
  kind: 'practice';

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  score: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  passes: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  fails: number;

  @ApiProperty()
  @IsString()
  report: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  resources?: WorkerResourceNode[];
}
