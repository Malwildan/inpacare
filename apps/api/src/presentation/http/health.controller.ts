import { Controller, Get, Inject, Res } from "@nestjs/common";
import { Response } from "express";
import {
  HEALTH_PROBE,
  HealthProbe,
} from "../../application/shared/health-probe";
import { Public } from "./security/auth-context";
@Controller()
export class HealthController {
  constructor(
    @Inject(HEALTH_PROBE)
    private readonly probe: HealthProbe,
  ) {}
  @Public()
  @Get("health")
  async health(
    @Res({ passthrough: true })
    response: Response,
  ) {
    if (await this.probe.check())
      return { status: "ok", database: "connected" };
    response.status(503);
    return { status: "unavailable" };
  }
}
