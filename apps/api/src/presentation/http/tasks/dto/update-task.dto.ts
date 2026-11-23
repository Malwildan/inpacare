import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { UpdateTaskInput } from "../../../../application/tasks/tugas.types";
export class UpdateTaskDto implements UpdateTaskInput {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsOptional()
  @IsString({ message: "Isi Judul tugas dengan maksimal 150 karakter." })
  @MaxLength(150, { message: "Isi Judul tugas dengan maksimal 150 karakter." })
  title?: string;
  @IsOptional()
  @IsString({ message: "Isi Deskripsi dengan maksimal 5.000 karakter." })
  @MaxLength(5000, { message: "Isi Deskripsi dengan maksimal 5.000 karakter." })
  description?: string;
  @IsOptional()
  @IsString({ message: "Isi Catatan dengan maksimal 3.000 karakter." })
  @MaxLength(3000, { message: "Isi Catatan dengan maksimal 3.000 karakter." })
  notes?: string;
  @IsOptional()
  @IsIn(["low", "normal", "high"], { message: "Pilih prioritas tugas dari daftar." })
  priority?: string;
  @IsOptional()
  @IsString({ message: "Periksa tanggal dan jam mulai tugas." })
  @MaxLength(40, { message: "Periksa tanggal dan jam mulai tugas." })
  startsAt?: string;
  @IsOptional()
  @IsString({ message: "Periksa tanggal dan jam selesai tugas." })
  @MaxLength(40, { message: "Periksa tanggal dan jam selesai tugas." })
  endsAt?: string;
  @IsOptional()
  @IsIn(["todo", "in_progress", "done", "cancelled"], { message: "Pilih status tugas dari daftar." })
  status?: "todo" | "in_progress" | "done" | "cancelled";
  @IsOptional()
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason?: string;
}
