import { Module } from "@nestjs/common";
import { ApplicationModule } from "./application.module";
import { ReferenceController } from "../presentation/http/reference/reference.controller";
@Module({ imports: [ApplicationModule], controllers: [ReferenceController] })
export class ReferenceModule {}
