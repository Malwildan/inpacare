import { Module } from "@nestjs/common";
import { RekamMedisController } from "../presentation/http/medical-records/rekam-medis.controller";
import { CycleObservationsController } from "../presentation/http/medical-records/cycle-observations.controller";
import { ApplicationModule } from "./application.module";
@Module({ imports: [ApplicationModule], controllers: [RekamMedisController, CycleObservationsController] })
export class MedicalRecordsModule {}
