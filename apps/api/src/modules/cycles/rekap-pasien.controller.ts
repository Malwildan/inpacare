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
import { Actor, CurrentActor, Roles } from "../../common/auth";
import {
  ChangeCycleDto,
  CreateCycleDto,
  CycleListQueryDto,
  CycleRequestDto,
  DecideCycleRequestDto,
  DeleteCycleDto,
} from "./dto/cycle.dto";
import { CyclesService } from "./cycles.service";

@Controller("cycles")
export class RekapPasienController {
  constructor(private readonly service: CyclesService) {}
  @Get() @Roles("DOKTER", "PERAWAT") getDaftarRekap(
    @CurrentActor() actor: Actor,
    @Query() query: CycleListQueryDto,
  ) {
    return this.service.list(actor, query);
  }
  @Post() @Roles("PERAWAT") tambahRekap(
    @CurrentActor() actor: Actor,
    @Body() body: CreateCycleDto,
  ) {
    return this.service.create(actor, body);
  }
  @Get(":id") @Roles("DOKTER", "PERAWAT") getDetailRekap(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
  ) {
    return this.service.detail(actor, id);
  }
  @Patch(":id") @Roles("PERAWAT") ubahStatus(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: ChangeCycleDto,
  ) {
    return this.service.change(actor, id, body);
  }
  @Delete(":id") @Roles("PERAWAT") hapusRekap(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: DeleteCycleDto,
  ) {
    return this.service.remove(actor, id, body);
  }
  @Post(":id/requests") @Roles("PERAWAT") request(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: CycleRequestDto,
  ) {
    return this.service.request(actor, id, body);
  }
  @Post(":id/requests/:requestId/decision")
  @HttpCode(200)
  @Roles("DOKTER")
  process(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Body() body: DecideCycleRequestDto,
  ) {
    return this.service.decide(actor, id, requestId, body);
  }
}
