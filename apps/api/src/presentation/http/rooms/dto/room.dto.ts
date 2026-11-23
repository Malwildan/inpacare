import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
} from "class-validator";
export class CreateRoomDto {
  @IsString({ message: "Isi Nama ruang dengan maksimal 80 karakter." })
  @MaxLength(80, { message: "Isi Nama ruang dengan maksimal 80 karakter." })
  name!: string;
  @IsString({ message: "Isi Tipe ruang dengan maksimal 40 karakter." })
  @MaxLength(40, { message: "Isi Tipe ruang dengan maksimal 40 karakter." })
  roomClass!: string;
  @IsInt({ message: "Isi Kapasitas dengan bilangan bulat dari 1 sampai 20 tempat tidur." })
  @Min(1, { message: "Isi Kapasitas dengan bilangan bulat dari 1 sampai 20 tempat tidur." })
  @Max(20, { message: "Isi Kapasitas dengan bilangan bulat dari 1 sampai 20 tempat tidur." })
  capacity!: number;
  @IsOptional()
  @Matches(/^(available|maintenance)$/, { message: "Pilih status ruang dari daftar." })
  status?: string;
  @IsOptional()
  @IsString()
  @MaxLength(36)
  picId?: string | null;
  @IsOptional()
  @Matches(/^\d{1,13}(\.\d{1,2})?$/, { message: "Isi Tarif per hari dalam rupiah, maksimal 13 digit sebelum koma dan dua angka desimal." })
  dailyRate?: string;
}
export class UpdateRoomDto {
  @IsString({ message: "Isi Nama ruang dengan maksimal 80 karakter." })
  @MaxLength(80, { message: "Isi Nama ruang dengan maksimal 80 karakter." })
  name!: string;
  @IsString({ message: "Isi Tipe ruang dengan maksimal 40 karakter." })
  @MaxLength(40, { message: "Isi Tipe ruang dengan maksimal 40 karakter." })
  roomClass!: string;
  @IsInt({ message: "Isi Kapasitas dengan bilangan bulat dari 1 sampai 20 tempat tidur." })
  @Min(1, { message: "Isi Kapasitas dengan bilangan bulat dari 1 sampai 20 tempat tidur." })
  @Max(20, { message: "Isi Kapasitas dengan bilangan bulat dari 1 sampai 20 tempat tidur." })
  capacity!: number;
  @IsOptional()
  @IsString()
  @MaxLength(36)
  picId?: string | null;
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @Matches(/^\d{1,13}(\.\d{1,2})?$/, { message: "Isi Tarif per hari dalam rupiah, maksimal 13 digit sebelum koma dan dua angka desimal." })
  dailyRate!: string;
  @Matches(/^(available|maintenance)$/, { message: "Pilih status ruang dari daftar." })
  status!: string;
}
export class CreateRoomItemDto {
  @IsString({ message: "Isi Nama fasilitas dengan maksimal 80 karakter." })
  @MaxLength(80, { message: "Isi Nama fasilitas dengan maksimal 80 karakter." })
  name!: string;
  @IsString({ message: "Isi Kategori dengan maksimal 40 karakter." })
  @MaxLength(40, { message: "Isi Kategori dengan maksimal 40 karakter." })
  category!: string;
  @IsInt({ message: "Isi Jumlah dengan bilangan bulat dari 1 sampai 10.000." })
  @Min(1, { message: "Isi Jumlah dengan bilangan bulat dari 1 sampai 10.000." })
  @Max(10000, { message: "Isi Jumlah dengan bilangan bulat dari 1 sampai 10.000." })
  quantity!: number;
  @Matches(/^\d{1,13}(\.\d{1,2})?$/, { message: "Isi Harga satuan dalam rupiah, maksimal 13 digit sebelum koma dan dua angka desimal." })
  unitPrice!: string;
}
export class UpdateRoomItemDto extends CreateRoomItemDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
export class RoomVersionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
export class DeleteRoomItemDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
