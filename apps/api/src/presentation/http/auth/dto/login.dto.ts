import { IsString, MaxLength, MinLength } from "class-validator";
export class LoginDto {
  @IsString({ message: "Isi ID petugas dengan maksimal 100 karakter." })
  @MinLength(1, { message: "Isi ID petugas dengan maksimal 100 karakter." })
  @MaxLength(100, { message: "Isi ID petugas dengan maksimal 100 karakter." })
  username!: string;
  @IsString({ message: "Isi Kata sandi dengan maksimal 200 karakter." })
  @MinLength(1, { message: "Isi Kata sandi dengan maksimal 200 karakter." })
  @MaxLength(200, { message: "Isi Kata sandi dengan maksimal 200 karakter." })
  password!: string;
}
