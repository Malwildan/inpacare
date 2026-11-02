import { Module } from "@nestjs/common";
import { TugasController } from "../presentation/http/tasks/tugas.controller";
import { ApplicationModule } from "./application.module";
@Module({ imports: [ApplicationModule], controllers: [TugasController] })
export class TasksModule {}
