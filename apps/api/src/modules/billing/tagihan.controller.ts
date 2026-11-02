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
  CreateInvoiceDto,
  DeleteInvoiceDto,
  EditInvoiceLineDto,
  InvoiceQueryDto,
  PaymentDto,
  VerifyClaimDto,
} from "./dto/invoice.dto";
import { TagihanService } from "./tagihan.service";
@Controller("invoices")
@Roles("ADMISI")
export class TagihanController {
  constructor(private readonly service: TagihanService) {}
  @Get() list(@CurrentActor() actor: Actor, @Query() q: InvoiceQueryDto) {
    return this.service.list(actor, q.search, q.status, q.limit);
  }
  @Get("patients/:patientId/context") patientContext(
    @CurrentActor() actor: Actor,
    @Param("patientId") id: string,
  ) {
    return this.service.patientContext(actor, id);
  }
  @Post() create(@CurrentActor() actor: Actor, @Body() body: CreateInvoiceDto) {
    return this.service.create(actor, body);
  }
  @Get(":id") detail(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.service.detail(actor, id);
  }
  @Patch(":id") payment(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: PaymentDto,
  ) {
    return this.service.changePayment(actor, id, body);
  }
  @Delete(":id") remove(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: DeleteInvoiceDto,
  ) {
    return this.service.remove(actor, id, body);
  }
  @Patch(":id/lines/:lineId") editLine(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() body: EditInvoiceLineDto,
  ) {
    return this.service.editLine(actor, id, lineId, body);
  }
  @Delete(":id/lines/:lineId") deleteLine(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() body: DeleteInvoiceDto,
  ) {
    return this.service.deleteLine(actor, id, lineId, body);
  }
  @Post(":id/claim-verification") @HttpCode(200) verifyClaim(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: VerifyClaimDto,
  ) {
    return this.service.verifyClaim(actor, id, body);
  }
}
