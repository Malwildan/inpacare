import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateBy } from "class-validator";
import { MoveTaskInput } from "../../../../application/tasks/tugas.types";
export class MoveTaskDto implements MoveTaskInput {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(["todo", "in_progress", "done", "cancelled"]) status!: "todo" | "in_progress" | "done" | "cancelled";
  @ValidateBy({ name: "nullableTaskId", validator: { validate: (value: unknown) => value === null || (typeof value === "string" && value.length > 0 && value.length <= 36) } })
  beforeTaskId!: string | null;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
