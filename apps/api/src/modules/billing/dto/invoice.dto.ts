import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
export class InvoiceLineDto {
  @IsOptional() @IsString() @MaxLength(36) roomItemId?: string;
  @IsOptional() @IsString() @MaxLength(40) kind?: string;
  @IsString() @MinLength(1) @MaxLength(160) description!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsString() @MaxLength(32) unitPrice!: string;
}
export class CreateInvoiceDto {
  @IsString() @MinLength(1) @MaxLength(36) patientId!: string;
  @IsOptional() @IsString() @MaxLength(36) placementId?: string | null;
  @IsString() @MaxLength(32) coveredAmount!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}
export class PaymentDto {
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
  @IsInt() @Min(1) expectedVersion!: number;
  @IsIn(["paid", "unpaid"]) status!: string;
}
export class EditInvoiceLineDto extends InvoiceLineDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
export class DeleteInvoiceDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
export class VerifyClaimDto {
  @IsString() @MinLength(1) @MaxLength(120) result!: string;
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
  @IsBoolean() verified!: boolean;
}
export class InvoiceQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() @MaxLength(10) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
