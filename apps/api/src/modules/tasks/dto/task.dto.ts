import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Matches,
} from "class-validator";
import { Type } from "class-transformer";
export class TaskFilterDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional()
  @IsIn(["todo", "in_progress", "done", "cancelled"])
  status?: string;
  @IsOptional() @IsIn(["low", "normal", "high"]) priority?: string;
  @IsOptional() @IsString() @MaxLength(36) roomId?: string;
  @IsOptional() @IsString() @MaxLength(36) patientId?: string;
  @IsOptional() @IsString() @MaxLength(36) picId?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  from?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}
export class CreateTaskDto {
  @IsString() @MaxLength(36) patientId!: string;
  @IsString() @MaxLength(36) placementId!: string;
  @IsString() @MaxLength(36) picId!: string;
  @IsString() @MaxLength(150) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
  @IsIn(["low", "normal", "high"]) priority!: string;
  @IsString() @MaxLength(40) startsAt!: string;
  @IsString() @MaxLength(40) endsAt!: string;
}
export class UpdateTaskDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
  @IsOptional() @IsIn(["low", "normal", "high"]) priority?: string;
  @IsOptional() @IsString() @MaxLength(40) startsAt?: string;
  @IsOptional() @IsString() @MaxLength(40) endsAt?: string;
  @IsOptional()
  @IsIn(["todo", "in_progress", "done", "cancelled"])
  status?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class ReasonDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MaxLength(500) reason!: string;
}
export class ReassignTaskDto extends ReasonDto {
  @IsString() @MaxLength(36) picId!: string;
}
