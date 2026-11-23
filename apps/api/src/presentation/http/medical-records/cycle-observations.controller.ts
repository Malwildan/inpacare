import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { RekamMedisUseCases } from "../../../application/medical-records/rekam-medis.use-cases";
import { Actor, CurrentActor, Roles } from "../security/auth-context";
import { CreateObservationDto } from "./dto/medical-record.dto";

@Controller("cycles/:id/observations")
export class CycleObservationsController {
  constructor(private readonly service: RekamMedisUseCases) {}

  @Get()
  @Roles("DOKTER", "PERAWAT")
  list(@CurrentActor() actor: Actor, @Param("id") cycleId: string) {
    return this.service.cycleObservations(actor, cycleId);
  }

  @Post()
  @Roles("PERAWAT")
  create(
    @CurrentActor() actor: Actor,
    @Param("id") cycleId: string,
    @Body() body: CreateObservationDto,
  ) {
    return this.service.addCycleObservation(actor, cycleId, body);
  }
}
