import { Module } from "@nestjs/common";
import { AssignRuanganController } from "../presentation/http/placements/assign-ruangan.controller";
import { ApplicationModule } from "./application.module";
@Module({
  imports: [ApplicationModule],
  controllers: [AssignRuanganController],
})
export class PlacementsModule {}
