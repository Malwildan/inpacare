import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { CreateTaskInput } from "../../../../application/tasks/tugas.types";
export class CreateTaskDto implements CreateTaskInput {
  @IsString()
  @MaxLength(36)
  patientId!: string;
  @IsString()
  @MaxLength(36)
  placementId!: string;
  @IsString()
  @MaxLength(36)
  picId!: string;
  @IsString()
  @MaxLength(150)
  title!: string;
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
  @IsIn(["low", "normal", "high"])
  priority!: string;
  @IsString()
  @MaxLength(40)
  startsAt!: string;
  @IsString()
  @MaxLength(40)
  endsAt!: string;
}
