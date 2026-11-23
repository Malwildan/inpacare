import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsObject,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";
import type {
  ChangeCycleInput,
  CreateCycleInput,
  CycleRequestInput,
  DecideCycleRequestInput,
  DeleteCycleInput,
  ReassignCycleInput,
} from "../../../../application/cycles/cycles.use-cases";
import type { CycleListFilters } from "../../../../application/cycles/cycle-store.port";
export class CycleListQueryDto implements CycleListFilters {
  @IsOptional()
  @IsString({ message: "Pilih pasien." })
  @MaxLength(36, { message: "Pilih pasien." })
  patientId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(36)
  roomId?: string;
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
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
export class CyclePlacementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(36)
  roomId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Tanggal masuk tidak valid. Pilih tanggal pada kalender." })
  @IsDateString({ strict: true }, { message: "Tanggal masuk tidak valid. Pilih tanggal pada kalender." })
  startsOn!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Tanggal selesai tidak valid. Pilih tanggal pada kalender." })
  @IsDateString({ strict: true }, { message: "Tanggal selesai tidak valid. Pilih tanggal pada kalender." })
  endsOn!: string;
}
export class CreateCycleDto implements CreateCycleInput {
  @IsString({ message: "Pilih pasien." })
  @MinLength(1, { message: "Pilih pasien." })
  @MaxLength(36, { message: "Pilih pasien." })
  patientId!: string;
  @IsString({ message: "Pilih dokter penanggung jawab." })
  @MinLength(1, { message: "Pilih dokter penanggung jawab." })
  @MaxLength(36, { message: "Pilih dokter penanggung jawab." })
  doctorId!: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: "Pilih perawat penanggung jawab." })
  @MinLength(1, { message: "Pilih perawat penanggung jawab." })
  @MaxLength(36, { message: "Pilih perawat penanggung jawab." })
  nurseId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(36)
  placementId?: string | null;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CyclePlacementDto)
  newPlacement?: CyclePlacementDto | null;
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  requestId?: string;
}
export class ChangeCycleDto implements ChangeCycleInput {
  @IsOptional()
  @IsIn(["pending", "assigned", "in_care", "extend", "released"])
  status?: string;
  @IsOptional()
  @IsString()
  @MaxLength(36)
  placementId?: string | null;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
export class CycleRequestDto implements CycleRequestInput {
  @IsIn(["extend", "release"])
  kind!: "extend" | "release";
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Tanggal selesai baru tidak valid. Pilih tanggal pada kalender." })
  @IsDateString({ strict: true }, { message: "Tanggal selesai baru tidak valid. Pilih tanggal pada kalender." })
  requestedEnd?: string | null;
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MinLength(1, { message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason!: string;
}
export class DecideCycleRequestDto implements DecideCycleRequestInput {
  @IsIn(["approve", "reject"], { message: "Pilih keputusan Setujui atau Tolak." })
  decision!: "approve" | "reject";
  @IsString({ message: "Isi Catatan keputusan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Catatan keputusan dengan maksimal 500 karakter." })
  note!: string;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
export class DeleteCycleDto implements DeleteCycleInput {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MinLength(1, { message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason!: string;
}
export class ReassignCycleDto implements ReassignCycleInput {
  @IsString({ message: "Pilih perawat penanggung jawab." })
  @MinLength(1, { message: "Pilih perawat penanggung jawab." })
  @MaxLength(36, { message: "Pilih perawat penanggung jawab." })
  nurseId!: string;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString({ message: "Isi alasan pengalihan dengan maksimal 500 karakter." })
  @MinLength(1, { message: "Isi alasan pengalihan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi alasan pengalihan dengan maksimal 500 karakter." })
  reason!: string;
}
