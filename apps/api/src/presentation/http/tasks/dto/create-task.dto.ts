import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";
import { CreateTaskInput } from "../../../../application/tasks/tugas.types";
import { taskTypes, TaskType } from "../../../../domain/tasks/tugas-perawatan";
export class CreateTaskDto implements CreateTaskInput {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn([...taskTypes], { message: "Pilih jenis tugas dari daftar." })
  type?: TaskType;
  @IsString({ message: "Pilih pasien." })
  @MaxLength(36, { message: "Pilih pasien." })
  patientId!: string;
  @IsString({ message: "Pilih penempatan pasien yang masih aktif." })
  @MaxLength(36, { message: "Pilih penempatan pasien yang masih aktif." })
  placementId!: string;
  @IsString({ message: "Pilih perawat penanggung jawab." })
  @MaxLength(36, { message: "Pilih perawat penanggung jawab." })
  picId!: string;
  @IsString({ message: "Isi Judul tugas dengan maksimal 150 karakter." })
  @MaxLength(150, { message: "Isi Judul tugas dengan maksimal 150 karakter." })
  title!: string;
  @IsOptional()
  @IsString({ message: "Isi Deskripsi dengan maksimal 5.000 karakter." })
  @MaxLength(5000, { message: "Isi Deskripsi dengan maksimal 5.000 karakter." })
  description?: string;
  @IsOptional()
  @IsString({ message: "Isi Catatan dengan maksimal 3.000 karakter." })
  @MaxLength(3000, { message: "Isi Catatan dengan maksimal 3.000 karakter." })
  notes?: string;
  @IsIn(["low", "normal", "high"], { message: "Pilih prioritas tugas dari daftar." })
  priority!: string;
  @IsString({ message: "Periksa tanggal dan jam mulai tugas." })
  @MaxLength(40, { message: "Periksa tanggal dan jam mulai tugas." })
  startsAt!: string;
  @IsString({ message: "Periksa tanggal dan jam selesai tugas." })
  @MaxLength(40, { message: "Periksa tanggal dan jam selesai tugas." })
  endsAt!: string;
}
