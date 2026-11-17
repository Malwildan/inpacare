import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
export class DateRangeDto {
  @IsOptional()
  @IsIn(["true", "false"])
  includeCancelled?: "true" | "false";
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
  @IsOptional()
  @IsString()
  @MaxLength(36)
  roomId?: string;
}
export class CreatePlacementDto {
  @IsString()
  @MaxLength(36)
  patientId!: string;
  @IsString()
  @MaxLength(36)
  roomId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startsOn!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endsOn!: string;
}
export class UpdatePlacementDto extends CreatePlacementDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(2000)
  reason!: string;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
export class CancelPlacementDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(2000)
  reason!: string;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
