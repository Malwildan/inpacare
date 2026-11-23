import { IsInt, IsString, MaxLength, Min } from "class-validator";
import {
  ReasonInput,
  ReassignTaskInput,
} from "../../../../application/tasks/tugas.types";
export class ReasonDto implements ReasonInput {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason!: string;
}
export class ReassignTaskDto extends ReasonDto implements ReassignTaskInput {
  @IsString({ message: "Pilih perawat penanggung jawab." })
  @MaxLength(36, { message: "Pilih perawat penanggung jawab." })
  picId!: string;
}
