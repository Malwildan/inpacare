import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
} from "class-validator";

export class CreateRoomDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(40) roomClass!: string;
  @IsInt() @Min(1) @Max(20) capacity!: number;
  @IsOptional() @Matches(/^(available|maintenance)$/) status?: string;
  @IsOptional() @IsString() @MaxLength(36) picId?: string | null;
  @IsOptional() @Matches(/^\d{1,13}(\.\d{1,2})?$/) dailyRate?: string;
}

export class UpdateRoomDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(40) roomClass!: string;
  @IsInt() @Min(1) @Max(20) capacity!: number;
  @IsOptional() @IsString() @MaxLength(36) picId?: string | null;
  @IsInt() @Min(1) expectedVersion!: number;
  @Matches(/^\d{1,13}(\.\d{1,2})?$/) dailyRate!: string;
  @Matches(/^(available|maintenance)$/) status!: string;
}

export class CreateRoomItemDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(40) category!: string;
  @IsInt() @Min(1) @Max(10000) quantity!: number;
  @Matches(/^\d{1,13}(\.\d{1,2})?$/) unitPrice!: string;
}

export class UpdateRoomItemDto extends CreateRoomItemDto {
  @IsInt() @Min(1) expectedVersion!: number;
}

export class RoomVersionDto {
  @IsInt() @Min(1) expectedVersion!: number;
}
export class DeleteRoomItemDto {
  @IsInt() @Min(1) expectedVersion!: number;
}
