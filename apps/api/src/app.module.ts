import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DataSource } from "typeorm";
import { HEALTH_PROBE } from "./application/shared/health-probe";
import { TypeOrmHealthProbe } from "./infrastructure/database/health-probe";
import { HealthController } from "./presentation/http/health.controller";
import { SessionGuard } from "./presentation/http/guards/session.guard";
import { ApplicationModule } from "./composition/application.module";
import { AuthModule } from "./composition/auth.module";
import { ReferenceModule } from "./composition/reference.module";
import { RoomsModule } from "./composition/rooms.module";
import { PlacementsModule } from "./composition/placements.module";
import { TasksModule } from "./composition/tasks.module";
import { MedicalRecordsModule } from "./composition/medical-records.module";
import { CyclesModule } from "./composition/cycles.module";
import { BillingModule } from "./composition/billing.module";
import { NotificationsModule } from "./composition/notifications.module";
@Module({
  imports: [
    ApplicationModule,
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
  providers: [
    {
      provide: HEALTH_PROBE,
      useFactory: (db: DataSource) => new TypeOrmHealthProbe(db),
      inject: [DataSource],
    },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
