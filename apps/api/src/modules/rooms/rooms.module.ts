import { Module } from "@nestjs/common";
import { RuangInapController } from "./ruang-inap.controller";
import { RuangInapService } from "./ruang-inap.service";
@Module({
  controllers: [RuangInapController],
  providers: [RuangInapService],
  exports: [RuangInapService],
})
export class RoomsModule {}
