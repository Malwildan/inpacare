import { Module } from "@nestjs/common";
import { RekamMedisController } from "../presentation/http/medical-records/rekam-medis.controller";
import { ApplicationModule } from "./application.module";
@Module({ imports: [ApplicationModule], controllers: [RekamMedisController] })
export class MedicalRecordsModule {}
