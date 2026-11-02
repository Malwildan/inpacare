import { IsInt, IsString, MaxLength, Min } from "class-validator";
import {
  ReasonInput,
  ReassignTaskInput,
} from "../../../../application/tasks/tugas.types";
export class ReasonDto implements ReasonInput {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString()
  @MaxLength(500)
  reason!: string;
}
export class ReassignTaskDto extends ReasonDto implements ReassignTaskInput {
  @IsString()
  @MaxLength(36)
  picId!: string;
}
