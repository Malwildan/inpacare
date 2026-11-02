import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
export class CycleListQueryDto {
  @IsOptional() @IsString() @MaxLength(36) patientId?: string;
  @IsOptional() @IsString() @MaxLength(36) roomId?: string;
  @IsOptional()
  @IsIn([
    "pending",
    "assigned",
    "in_care",
    "extend",
    "released",
    "pending_approval",
  ])
  status?: string;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
export class CreateCycleDto {
  @IsString() @MinLength(1) @MaxLength(36) patientId!: string;
  @IsString() @MinLength(1) @MaxLength(36) doctorId!: string;
  @IsOptional() @IsString() @MaxLength(36) placementId?: string | null;
}
export class ChangeCycleDto {
  @IsOptional()
  @IsIn(["pending", "assigned", "in_care", "extend", "released"])
  status?: string;
  @IsOptional() @IsString() @MaxLength(36) placementId?: string | null;
  @IsInt() @Min(1) expectedVersion!: number;
}
export class CycleRequestDto {
  @IsIn(["extend", "release"]) kind!: "extend" | "release";
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  requestedEnd?: string | null;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
export class DecideCycleRequestDto {
  @IsIn(["approve", "reject"]) decision!: "approve" | "reject";
  @IsString() @MaxLength(500) note!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}
export class DeleteCycleDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
