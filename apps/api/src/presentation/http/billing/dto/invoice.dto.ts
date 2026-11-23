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
  ValidateIf,
} from "class-validator";
import type {
  CreateInvoiceInput,
  DeleteInvoiceInput,
  EditInvoiceLineInput,
  PaymentInput,
  VerifyClaimInput,
} from "../../../../application/billing/tagihan.use-cases";
import type { InvoiceLineInput } from "../../../../domain/billing/invoice-total";
import type { InvoiceListFilters } from "../../../../application/billing/invoice-store.port";
export class InvoiceLineDto implements InvoiceLineInput {
  @IsOptional()
  @IsString()
  @MaxLength(36)
  roomItemId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(40)
  kind?: string;
  @IsString({ message: "Isi Nama layanan dengan maksimal 160 karakter." })
  @MinLength(1, { message: "Isi Nama layanan dengan maksimal 160 karakter." })
  @MaxLength(160, { message: "Isi Nama layanan dengan maksimal 160 karakter." })
  description!: string;
  @IsInt({ message: "Isi Jumlah dengan bilangan bulat dari 1 sampai 10.000." })
  @Min(1, { message: "Isi Jumlah dengan bilangan bulat dari 1 sampai 10.000." })
  quantity!: number;
  @IsString({ message: "Isi Harga satuan dalam rupiah." })
  @MaxLength(32, { message: "Isi Harga satuan dalam rupiah." })
  unitPrice!: string;
}
export class CreateInvoiceDto implements CreateInvoiceInput {
  @IsString({ message: "Pilih pasien." })
  @MinLength(1, { message: "Pilih pasien." })
  @MaxLength(36, { message: "Pilih pasien." })
  patientId!: string;
  @IsOptional()
  @IsString()
  @MaxLength(36)
  placementId?: string | null;
  @IsString({ message: "Isi Nilai jaminan dalam rupiah." })
  @MaxLength(32, { message: "Isi Nilai jaminan dalam rupiah." })
  coveredAmount!: string;
  @IsArray({ message: "Tambahkan minimal 1 dan maksimal 30 rincian layanan." })
  @ArrayMinSize(1, { message: "Tambahkan minimal 1 dan maksimal 30 rincian layanan." })
  @ArrayMaxSize(30, { message: "Tambahkan minimal 1 dan maksimal 30 rincian layanan." })
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}
export class PaymentDto implements PaymentInput {
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MinLength(1, { message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason!: string;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(["paid", "unpaid"], { message: "Pilih status pembayaran Belum lunas atau Lunas." })
  status?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: "Isi Nilai jaminan dalam rupiah." })
  @MaxLength(32, { message: "Isi Nilai jaminan dalam rupiah." })
  coveredAmount?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray({ message: "Tambahkan minimal 1 dan maksimal 30 rincian layanan." })
  @ArrayMinSize(1, { message: "Tambahkan minimal 1 dan maksimal 30 rincian layanan." })
  @ArrayMaxSize(30, { message: "Tambahkan minimal 1 dan maksimal 30 rincian layanan." })
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines?: InvoiceLineDto[];
}
export class EditInvoiceLineDto
  extends InvoiceLineDto
  implements EditInvoiceLineInput
{
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MinLength(1, { message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason!: string;
}
export class DeleteInvoiceDto implements DeleteInvoiceInput {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MinLength(1, { message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason!: string;
}
export class VerifyClaimDto implements VerifyClaimInput {
  @IsString({ message: "Isi Hasil verifikasi dengan maksimal 120 karakter." })
  @MinLength(1, { message: "Isi Hasil verifikasi dengan maksimal 120 karakter." })
  @MaxLength(120, { message: "Isi Hasil verifikasi dengan maksimal 120 karakter." })
  result!: string;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @IsString({ message: "Isi Alasan dengan maksimal 500 karakter." })
  @MinLength(1, { message: "Isi Alasan dengan maksimal 500 karakter." })
  @MaxLength(500, { message: "Isi Alasan dengan maksimal 500 karakter." })
  reason!: string;
  @IsBoolean({ message: "Pilih status verifikasi klaim." })
  verified!: boolean;
}
export class InvoiceQueryDto implements InvoiceListFilters {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
  @IsOptional()
  @IsString({ message: "Pilih status pembayaran Belum lunas atau Lunas." })
  @MaxLength(10, { message: "Pilih status pembayaran Belum lunas atau Lunas." })
  status?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
