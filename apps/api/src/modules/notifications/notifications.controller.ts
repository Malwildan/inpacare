import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Actor, CurrentActor } from "../../common/auth";
import { NotificationsService } from "./notifications.service";
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() list(@CurrentActor() actor: Actor) {
    return this.service.list(actor);
  }
  @Post(":id/read") @HttpCode(200) read(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
  ) {
    return this.service.markRead(actor, id);
  }
}
