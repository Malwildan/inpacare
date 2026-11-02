import { Module } from "@nestjs/common";
import { RekamMedisController } from "./rekam-medis.controller";
import { RekamMedisService } from "./rekam-medis.service";
@Module({
  controllers: [RekamMedisController],
  providers: [RekamMedisService],
  exports: [RekamMedisService],
})
export class MedicalRecordsModule {}
