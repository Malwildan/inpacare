import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import type {
  CreateMedicalRecordInput,
  DeleteMedicalRecordInput,
  ObservationInput,
  UpdateMedicalRecordInput,
  UpdateObservationInput,
} from "../../../../application/medical-records/rekam-medis.use-cases";
import type { MedicalRecordListFilters } from "../../../../application/medical-records/medical-record-store.port";
export class CreateMedicalRecordDto implements CreateMedicalRecordInput {
  @IsString()
  @MinLength(1)
  @MaxLength(36)
  patientId!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  complaint!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  diagnosis!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  treatment!: string;
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  recordDate!: string;
}
export class UpdateMedicalRecordDto implements UpdateMedicalRecordInput {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  complaint!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  diagnosis!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  treatment!: string;
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  recordDate!: string;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
export class CreateObservationDto implements ObservationInput {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  symptoms!: string;
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  nursingNote?: string;
  @Matches(/(?:[zZ]|[+-]\d{2}:\d{2})$/)
  @IsDateString({ strict: true })
  observedAt!: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(30)
  @Max(45)
  temperature?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsInt()
  @Min(50)
  @Max(250)
  systolic?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsInt()
  @Min(30)
  @Max(150)
  diastolic?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsInt()
  @Min(20)
  @Max(250)
  pulse?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsInt()
  @Min(5)
  @Max(60)
  respiratoryRate?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(50)
  @Max(100)
  spo2?: number;
}
export class UpdateObservationDto
  extends CreateObservationDto
  implements UpdateObservationInput
{
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
export class DeleteMedicalRecordDto implements DeleteMedicalRecordInput {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
export class ListMedicalRecordsDto implements MedicalRecordListFilters {
  @IsOptional()
  @IsString()
  @MaxLength(36)
  patientId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
