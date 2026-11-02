import { Module } from "@nestjs/common";
import { DashboardSiklusController } from "./dashboard-siklus.controller";
import { RekapPasienController } from "./rekap-pasien.controller";
import { CyclesService } from "./cycles.service";
@Module({
  controllers: [DashboardSiklusController, RekapPasienController],
  providers: [CyclesService],
  exports: [CyclesService],
})
export class CyclesModule {}
