import { Module } from "@nestjs/common";
import { TagihanController } from "../presentation/http/billing/tagihan.controller";
import { ApplicationModule } from "./application.module";
@Module({ imports: [ApplicationModule], controllers: [TagihanController] })
export class BillingModule {}
