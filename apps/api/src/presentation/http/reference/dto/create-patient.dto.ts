import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { CreatePatientInput } from "../../../../application/patients/patient-store.port";

export class CreatePatientDto implements CreatePatientInput {
  @IsString({ message: "Isi Nama lengkap dengan maksimal 200 karakter." })
  @MinLength(1, { message: "Isi Nama lengkap dengan maksimal 200 karakter." })
  @MaxLength(200, { message: "Isi Nama lengkap dengan maksimal 200 karakter." })
  name!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Tanggal lahir tidak valid. Pilih tanggal pada kalender." })
  @IsDateString({ strict: true }, { message: "Tanggal lahir tidak valid. Pilih tanggal pada kalender." })
  birthDate!: string;
  @IsIn(["L", "P"], { message: "Pilih Jenis kelamin." })
  gender!: "L" | "P";
  @IsBoolean({ message: "Periksa pilihan Peserta BPJS." })
  bpjs!: boolean;
  @IsOptional()
  @IsString({ message: "Isi Nomor BPJS dengan 13 digit." })
  @Matches(/^\d{13}$/, { message: "Isi Nomor BPJS dengan 13 digit." })
  @MaxLength(13, { message: "Isi Nomor BPJS dengan 13 digit." })
  bpjsNumber?: string | null;
  @IsOptional()
  @IsString({ message: "Isi Alamat dengan maksimal 1.000 karakter." })
  @MaxLength(1000, { message: "Isi Alamat dengan maksimal 1.000 karakter." })
  address?: string | null;
}
