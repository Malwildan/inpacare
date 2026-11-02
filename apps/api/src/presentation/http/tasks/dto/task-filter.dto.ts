import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { TaskFilters } from "../../../../application/tasks/tugas.types";
export class TaskFilterDto implements TaskFilters {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
  @IsOptional()
  @IsIn(["todo", "in_progress", "done", "cancelled"])
  status?: string;
  @IsOptional()
  @IsIn(["low", "normal", "high"])
  priority?: string;
  @IsOptional()
  @IsString()
  @MaxLength(36)
  roomId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(36)
  patientId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(36)
  picId?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  from?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  to?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
