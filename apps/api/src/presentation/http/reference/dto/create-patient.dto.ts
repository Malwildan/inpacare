import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { CreatePatientInput } from "../../../../application/patients/patient-store.port";

export class CreatePatientDto implements CreatePatientInput {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  medicalRecordNo!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  birthDate!: string;
  @IsIn(["L", "P"])
  gender!: "L" | "P";
  @IsBoolean()
  bpjs!: boolean;
  @IsOptional()
  @IsString()
  @Matches(/^\d{13}$/)
  @MaxLength(13)
  bpjsNumber?: string | null;
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string | null;
}
