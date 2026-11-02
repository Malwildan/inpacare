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
import {
  CreateMedicalRecordDto,
  CreateObservationDto,
  DeleteMedicalRecordDto,
  ListMedicalRecordsDto,
  UpdateMedicalRecordDto,
  UpdateObservationDto,
} from "./dto/medical-record.dto";
import { RekamMedisUseCases } from "../../../application/medical-records/rekam-medis.use-cases";
@Controller("medical-records")
export class RekamMedisController {
  constructor(private readonly service: RekamMedisUseCases) {}
  @Get()
  @Roles("DOKTER", "PERAWAT", "ADMISI")
  list(
    @CurrentActor()
    actor: Actor,
    @Query()
    query: ListMedicalRecordsDto,
  ) {
    return this.service.list(actor, query.search, query.limit, query.patientId);
  }
  @Post()
  @HttpCode(200)
  @Roles("DOKTER")
  create(
    @CurrentActor()
    actor: Actor,
    @Body()
    body: CreateMedicalRecordDto,
  ) {
    return this.service.create(actor, body);
  }
  @Get(":id")
  detail(
    @CurrentActor()
    actor: Actor,
    @Param("id")
    id: string,
  ) {
    return this.service.detail(actor, id);
  }
  @Patch(":id")
  @Roles("DOKTER")
  update(
    @CurrentActor()
    actor: Actor,
    @Param("id")
    id: string,
    @Body()
    body: UpdateMedicalRecordDto,
  ) {
    return this.service.update(actor, id, body);
  }
  @Delete(":id")
  @Roles("DOKTER")
  remove(
    @CurrentActor()
    actor: Actor,
    @Param("id")
    id: string,
    @Body()
    body: DeleteMedicalRecordDto,
  ) {
    return this.service.delete(actor, id, body);
  }
  @Post(":id/observations")
  @HttpCode(200)
  @Roles("PERAWAT")
  observation(
    @CurrentActor()
    actor: Actor,
    @Param("id")
    id: string,
    @Body()
    body: CreateObservationDto,
  ) {
    return this.service.addObservation(actor, id, body);
  }
  @Patch(":id/observations/:observationId")
  @Roles("PERAWAT")
  correctObservation(
    @CurrentActor()
    actor: Actor,
    @Param("id")
    id: string,
    @Param("observationId")
    observationId: string,
    @Body()
    body: UpdateObservationDto,
  ) {
    return this.service.updateObservation(actor, id, observationId, body);
  }
}
