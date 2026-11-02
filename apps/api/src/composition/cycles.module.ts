import { Module } from "@nestjs/common";
import { ApplicationModule } from "./application.module";
import { RekapPasienController } from "../presentation/http/cycles/rekap-pasien.controller";
import { DashboardSiklusController } from "../presentation/http/cycles/dashboard-siklus.controller";
@Module({
  imports: [ApplicationModule],
  controllers: [DashboardSiklusController, RekapPasienController],
})
export class CyclesModule {}
