import { Module } from "@nestjs/common";
import { AssignRuanganController } from "./assign-ruangan.controller";
import { AssignRuanganService } from "./assign-ruangan.service";
@Module({
  controllers: [AssignRuanganController],
  providers: [AssignRuanganService],
  exports: [AssignRuanganService],
})
export class PlacementsModule {}
