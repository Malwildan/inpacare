import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { Actor, CurrentActor, Roles } from "../security/auth-context";
import { ReferenceUseCases } from "../../../application/reference/reference.use-cases";
import { PatientFilterDto } from "./dto/patient-filter.dto";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { PatientsUseCases } from "../../../application/patients/patients.use-cases";
@Controller()
export class ReferenceController {
  constructor(
    private readonly reference: ReferenceUseCases,
    private readonly registration: PatientsUseCases,
  ) {}
  @Post("patients")
  @HttpCode(200)
  @Roles("ADMISI")
  createPatient(@CurrentActor() actor: Actor, @Body() dto: CreatePatientDto) {
    return this.registration.create(actor, dto);
  }
  @Get("patients")
  patients(
    @CurrentActor()
    actor: Actor,
    @Query()
    filter: PatientFilterDto,
  ) {
    return this.reference.patients(actor, {
      search: filter.q,
      limit: filter.limit,
      offset: filter.offset,
    });
  }
  @Get("staff")
  staff() {
    return this.reference.staff();
  }
  @Get("reference")
  referenceData(
    @CurrentActor()
    actor: Actor,
  ) {
    return this.reference.reference(actor);
  }
  @Get("patients/:id/context")
  context(
    @CurrentActor()
    actor: Actor,
    @Param("id")
    id: string,
  ) {
    return this.reference.context(actor, id);
  }
}
