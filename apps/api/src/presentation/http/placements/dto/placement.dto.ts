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
  @IsString({ message: "Pilih ruang." })
  @MaxLength(36, { message: "Pilih ruang." })
  roomId?: string;
}
export class CreatePlacementDto {
  @IsString({ message: "Pilih pasien." })
  @MaxLength(36, { message: "Pilih pasien." })
  patientId!: string;
  @IsString({ message: "Pilih ruang." })
  @MaxLength(36, { message: "Pilih ruang." })
  roomId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Tanggal masuk tidak valid. Pilih tanggal pada kalender." })
  startsOn!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Tanggal selesai tidak valid. Pilih tanggal pada kalender." })
  endsOn!: string;
}
export class UpdatePlacementDto extends CreatePlacementDto {
  @IsString({ message: "Isi alasan perubahan atau pembatalan penempatan dengan maksimal 2.000 karakter." })
  @Matches(/\S/, { message: "Isi alasan perubahan atau pembatalan penempatan dengan maksimal 2.000 karakter." })
  @MaxLength(2000, { message: "Isi alasan perubahan atau pembatalan penempatan dengan maksimal 2.000 karakter." })
  reason!: string;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
export class CancelPlacementDto {
  @IsString({ message: "Isi alasan perubahan atau pembatalan penempatan dengan maksimal 2.000 karakter." })
  @Matches(/\S/, { message: "Isi alasan perubahan atau pembatalan penempatan dengan maksimal 2.000 karakter." })
  @MaxLength(2000, { message: "Isi alasan perubahan atau pembatalan penempatan dengan maksimal 2.000 karakter." })
  reason!: string;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
