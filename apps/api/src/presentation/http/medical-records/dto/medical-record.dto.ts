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
  @IsString({ message: "Pilih pasien." })
  @MinLength(1, { message: "Pilih pasien." })
  @MaxLength(36, { message: "Pilih pasien." })
  patientId!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: "Pilih rekap rawat inap." })
  @MinLength(1, { message: "Pilih rekap rawat inap." })
  @MaxLength(36, { message: "Pilih rekap rawat inap." })
  cycleId?: string;
  @IsString({ message: "Isi Keluhan dengan maksimal 5.000 karakter." })
  @MinLength(1, { message: "Isi Keluhan dengan maksimal 5.000 karakter." })
  @MaxLength(5000, { message: "Isi Keluhan dengan maksimal 5.000 karakter." })
  complaint!: string;
  @IsString({ message: "Isi Diagnosis dengan maksimal 5.000 karakter." })
  @MinLength(1, { message: "Isi Diagnosis dengan maksimal 5.000 karakter." })
  @MaxLength(5000, { message: "Isi Diagnosis dengan maksimal 5.000 karakter." })
  diagnosis!: string;
  @IsString({ message: "Isi Tindakan dengan maksimal 5.000 karakter." })
  @MinLength(1, { message: "Isi Tindakan dengan maksimal 5.000 karakter." })
  @MaxLength(5000, { message: "Isi Tindakan dengan maksimal 5.000 karakter." })
  treatment!: string;
  @IsOptional()
  @IsString({ message: "Isi Catatan dengan maksimal 5.000 karakter." })
  @MaxLength(5000, { message: "Isi Catatan dengan maksimal 5.000 karakter." })
  notes?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Tanggal rekam medis tidak valid. Pilih tanggal pada kalender." })
  @IsDateString({ strict: true }, { message: "Tanggal rekam medis tidak valid. Pilih tanggal pada kalender." })
  recordDate!: string;
}
export class UpdateMedicalRecordDto implements UpdateMedicalRecordInput {
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MinLength(1, { message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason!: string;
  @IsString({ message: "Isi Keluhan dengan maksimal 5.000 karakter." })
  @MinLength(1, { message: "Isi Keluhan dengan maksimal 5.000 karakter." })
  @MaxLength(5000, { message: "Isi Keluhan dengan maksimal 5.000 karakter." })
  complaint!: string;
  @IsString({ message: "Isi Diagnosis dengan maksimal 5.000 karakter." })
  @MinLength(1, { message: "Isi Diagnosis dengan maksimal 5.000 karakter." })
  @MaxLength(5000, { message: "Isi Diagnosis dengan maksimal 5.000 karakter." })
  diagnosis!: string;
  @IsString({ message: "Isi Tindakan dengan maksimal 5.000 karakter." })
  @MinLength(1, { message: "Isi Tindakan dengan maksimal 5.000 karakter." })
  @MaxLength(5000, { message: "Isi Tindakan dengan maksimal 5.000 karakter." })
  treatment!: string;
  @IsOptional()
  @IsString({ message: "Isi Catatan dengan maksimal 5.000 karakter." })
  @MaxLength(5000, { message: "Isi Catatan dengan maksimal 5.000 karakter." })
  notes?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Tanggal rekam medis tidak valid. Pilih tanggal pada kalender." })
  @IsDateString({ strict: true }, { message: "Tanggal rekam medis tidak valid. Pilih tanggal pada kalender." })
  recordDate!: string;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
export class CreateObservationDto implements ObservationInput {
  @IsString({ message: "Isi Gejala dengan maksimal 3.000 karakter." })
  @MinLength(1, { message: "Isi Gejala dengan maksimal 3.000 karakter." })
  @MaxLength(3000, { message: "Isi Gejala dengan maksimal 3.000 karakter." })
  symptoms!: string;
  @IsOptional()
  @IsString({ message: "Isi Catatan perawat dengan maksimal 3.000 karakter." })
  @MaxLength(3000, { message: "Isi Catatan perawat dengan maksimal 3.000 karakter." })
  nursingNote?: string;
  @Matches(/(?:[zZ]|[+-]\d{2}:\d{2})$/, { message: "Waktu pemeriksaan tidak valid. Periksa tanggal, jam, dan zona waktu pemeriksaan." })
  @IsDateString({ strict: true }, { message: "Waktu pemeriksaan tidak valid. Periksa tanggal, jam, dan zona waktu pemeriksaan." })
  observedAt!: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Isi Suhu dari 30 sampai 45 °C dengan maksimal dua angka desimal." })
  @Min(30, { message: "Isi Suhu dari 30 sampai 45 °C dengan maksimal dua angka desimal." })
  @Max(45, { message: "Isi Suhu dari 30 sampai 45 °C dengan maksimal dua angka desimal." })
  temperature?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsInt({ message: "Isi Sistolik dengan bilangan bulat dari 50 sampai 250 mmHg." })
  @Min(50, { message: "Isi Sistolik dengan bilangan bulat dari 50 sampai 250 mmHg." })
  @Max(250, { message: "Isi Sistolik dengan bilangan bulat dari 50 sampai 250 mmHg." })
  systolic?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsInt({ message: "Isi Diastolik dengan bilangan bulat dari 30 sampai 150 mmHg." })
  @Min(30, { message: "Isi Diastolik dengan bilangan bulat dari 30 sampai 150 mmHg." })
  @Max(150, { message: "Isi Diastolik dengan bilangan bulat dari 30 sampai 150 mmHg." })
  diastolic?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsInt({ message: "Isi Nadi dengan bilangan bulat dari 20 sampai 250 kali per menit." })
  @Min(20, { message: "Isi Nadi dengan bilangan bulat dari 20 sampai 250 kali per menit." })
  @Max(250, { message: "Isi Nadi dengan bilangan bulat dari 20 sampai 250 kali per menit." })
  pulse?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsInt({ message: "Isi Laju napas dengan bilangan bulat dari 5 sampai 60 kali per menit." })
  @Min(5, { message: "Isi Laju napas dengan bilangan bulat dari 5 sampai 60 kali per menit." })
  @Max(60, { message: "Isi Laju napas dengan bilangan bulat dari 5 sampai 60 kali per menit." })
  respiratoryRate?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Isi SpO₂ dari 50 sampai 100 persen dengan maksimal dua angka desimal." })
  @Min(50, { message: "Isi SpO₂ dari 50 sampai 100 persen dengan maksimal dua angka desimal." })
  @Max(100, { message: "Isi SpO₂ dari 50 sampai 100 persen dengan maksimal dua angka desimal." })
  spo2?: number;
}
export class UpdateObservationDto
  extends CreateObservationDto
  implements UpdateObservationInput
{
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MinLength(1, { message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason!: string;
}
export class DeleteMedicalRecordDto implements DeleteMedicalRecordInput {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MinLength(1, { message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason!: string;
}
export class ListMedicalRecordsDto implements MedicalRecordListFilters {
  @IsOptional()
  @IsString({ message: "Pilih pasien." })
  @MaxLength(36, { message: "Pilih pasien." })
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
