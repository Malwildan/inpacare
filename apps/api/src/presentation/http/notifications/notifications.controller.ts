import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { NotificationsUseCases } from "../../../application/notifications/notifications.use-cases";
import { Actor, CurrentActor } from "../security/auth-context";
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly service: NotificationsUseCases) {}
  @Get()
  list(
    @CurrentActor()
    actor: Actor,
  ) {
    return this.service.list(actor);
  }
  @Post(":id/read")
  @HttpCode(200)
  read(
    @CurrentActor()
    actor: Actor,
    @Param("id")
    id: string,
  ) {
    return this.service.markRead(actor, id);
  }
}
