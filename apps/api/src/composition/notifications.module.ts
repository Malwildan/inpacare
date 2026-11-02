import { Module } from "@nestjs/common";
import { ApplicationModule } from "./application.module";
import { NotificationsController } from "../presentation/http/notifications/notifications.controller";
@Module({
  imports: [ApplicationModule],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
