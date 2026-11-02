import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Actor, CurrentActor, Roles } from "../../common/auth";
import {
  CreateTaskDto,
  ReasonDto,
  ReassignTaskDto,
  TaskFilterDto,
  UpdateTaskDto,
} from "./dto/task.dto";
import { TugasService } from "./tugas.service";
@Controller("tasks")
export class TugasController {
  constructor(private readonly tasks: TugasService) {}
  @Get() @Roles("PERAWAT") daftarTugas(
    @CurrentActor() a: Actor,
    @Query() q: TaskFilterDto,
  ) {
    return this.tasks.list(a, q);
  }
  @Post() @HttpCode(200) @Roles("PERAWAT") buatTugas(
    @CurrentActor() a: Actor,
    @Body() d: CreateTaskDto,
  ) {
    return this.tasks.create(a, d);
  }
  @Get(":id") @Roles("PERAWAT") detailTugas(
    @CurrentActor() a: Actor,
    @Param("id") id: string,
  ) {
    return this.tasks.detail(a, id);
  }
  @Get(":id/history") @Roles("PERAWAT") riwayatTugas(
    @CurrentActor() a: Actor,
    @Param("id") id: string,
  ) {
    return this.tasks.history(a, id);
  }
  @Patch(":id") @Roles("PERAWAT") perbaruiTugas(
    @CurrentActor() a: Actor,
    @Param("id") id: string,
    @Body() d: UpdateTaskDto,
  ) {
    return this.tasks.update(a, id, d);
  }
  @Delete(":id") @Roles("PERAWAT") hapusTugas(
    @CurrentActor() a: Actor,
    @Param("id") id: string,
    @Body() d: ReasonDto,
  ) {
    return this.tasks.remove(a, id, d);
  }
  @Post(":id/reassign") @HttpCode(200) @Roles("PERAWAT") alihkanTugas(
    @CurrentActor() a: Actor,
    @Param("id") id: string,
    @Body() d: ReassignTaskDto,
  ) {
    return this.tasks.reassign(a, id, d);
  }
}
