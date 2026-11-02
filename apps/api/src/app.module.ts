import { Controller, Get, Module, Res } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Response } from "express";
import { DataSource } from "typeorm";
import { Public, SessionGuard } from "./common/auth";
import { createDataSource } from "./database/data-source";
import { AuthModule } from "./modules/auth/auth.controller";
import { ReferenceModule } from "./modules/reference/reference.module";
import { RoomsModule } from "./modules/rooms/rooms.module";
import { PlacementsModule } from "./modules/placements/placements.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { MedicalRecordsModule } from "./modules/medical-records/medical-records.module";
import { CyclesModule } from "./modules/cycles/cycles.module";
import { BillingModule } from "./modules/billing/billing.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";

@Controller()
class HealthController {
  constructor(private readonly db: DataSource) {}
  @Public()
  @Get("health")
  async health(@Res({ passthrough: true }) response: Response) {
    try {
      await this.db.query("SELECT 1");
      return { status: "ok", database: "connected" };
    } catch {
      response.status(503);
      return { status: "unavailable" };
    }
  }
}
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ ...createDataSource().options, retryAttempts: 1 }),
    }),
    AuthModule,
    ReferenceModule,
    RoomsModule,
    PlacementsModule,
    TasksModule,
    MedicalRecordsModule,
    CyclesModule,
    BillingModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
