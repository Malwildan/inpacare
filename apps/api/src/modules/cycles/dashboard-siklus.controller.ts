import { Controller, Get, Param, Query } from "@nestjs/common";
import { Actor, CurrentActor, Roles } from "../../common/auth";
import { CyclesService } from "./cycles.service";
import { CycleListQueryDto } from "./dto/cycle.dto";

@Controller("cycles")
export class DashboardSiklusController {
  constructor(private readonly service: CyclesService) {}
  @Get("dashboard") @Roles("DOKTER", "PERAWAT") getDaftarPasienSiklus(
    @CurrentActor() actor: Actor,
    @Query() query: CycleListQueryDto,
  ) {
    return this.service.list(actor, query);
  }
  @Get(":id/requests/:requestId")
  @Roles("DOKTER", "PERAWAT")
  getDetailPengajuan(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Param("requestId") requestId: string,
  ) {
    return this.service.requestDetail(actor, id, requestId);
  }
}
