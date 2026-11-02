import { Module } from "@nestjs/common";
import { RuangInapController } from "../presentation/http/rooms/ruang-inap.controller";
import { ApplicationModule } from "./application.module";
@Module({ imports: [ApplicationModule], controllers: [RuangInapController] })
export class RoomsModule {}
