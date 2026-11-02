import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { UpdateTaskInput } from "../../../../application/tasks/tugas.types";
export class UpdateTaskDto implements UpdateTaskInput {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
  @IsOptional()
  @IsIn(["low", "normal", "high"])
  priority?: string;
  @IsOptional()
  @IsString()
  @MaxLength(40)
  startsAt?: string;
  @IsOptional()
  @IsString()
  @MaxLength(40)
  endsAt?: string;
  @IsOptional()
  @IsIn(["todo", "in_progress", "done", "cancelled"])
  status?: "todo" | "in_progress" | "done" | "cancelled";
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
