import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Actor, CurrentActor, Roles } from "../security/auth-context";
import { AssignRuanganUseCases } from "../../../application/placements/assign-ruangan.use-cases";
import {
  CancelPlacementDto,
  CreatePlacementDto,
  DateRangeDto,
  UpdatePlacementDto,
} from "./dto/placement.dto";
@Controller()
export class AssignRuanganController {
  constructor(private readonly service: AssignRuanganUseCases) {}
  @Get("occupancy")
  @Roles("DOKTER", "PERAWAT", "ADMISI")
  getKalenderRuangan(
    @CurrentActor()
    actor: Actor,
    @Query()
    q: DateRangeDto,
  ) {
    return this.service.occupancy(actor, q);
  }
  @Post("placements")
  @Roles("PERAWAT")
  @HttpCode(201)
  tautkanPasien(
    @CurrentActor()
    actor: Actor,
    @Body()
    d: CreatePlacementDto,
  ) {
    return this.service.create(actor, d);
  }
  @Patch("placements/:id")
  @Roles("PERAWAT")
  perbaruiPenautan(
    @CurrentActor()
    actor: Actor,
    @Param("id")
    id: string,
    @Body()
    d: UpdatePlacementDto,
  ) {
    return this.service.update(actor, id, d);
  }
  @Delete("placements/:id")
  @Roles("PERAWAT")
  batalkanPenautan(
    @CurrentActor()
    actor: Actor,
    @Param("id")
    id: string,
    @Body()
    d: CancelPlacementDto,
  ) {
    return this.service.cancel(actor, id, d);
  }
}
