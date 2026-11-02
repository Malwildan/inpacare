import { Controller, Get, Param, Query } from "@nestjs/common";
import { Actor, CurrentActor, Roles } from "../security/auth-context";
import { CyclesUseCases } from "../../../application/cycles/cycles.use-cases";
import { CycleListQueryDto } from "./dto/cycle.dto";
@Controller("cycles")
export class DashboardSiklusController {
  constructor(private readonly service: CyclesUseCases) {}
  @Get("dashboard")
  @Roles("DOKTER", "PERAWAT")
  getDaftarPasienSiklus(
    @CurrentActor()
    actor: Actor,
    @Query()
    query: CycleListQueryDto,
  ) {
    return this.service.list(actor, query);
  }
  @Get(":id/requests/:requestId")
  @Roles("DOKTER", "PERAWAT")
  getDetailPengajuan(
    @CurrentActor()
    actor: Actor,
    @Param("id")
    id: string,
    @Param("requestId")
    requestId: string,
  ) {
    return this.service.requestDetail(actor, id, requestId);
  }
}
