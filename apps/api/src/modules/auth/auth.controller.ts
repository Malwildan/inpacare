import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { Request, Response } from "express";
import { DataSource } from "typeorm";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import {
  Actor,
  checkOrigin,
  cookie,
  CurrentActor,
  digest,
  Public,
} from "../../common/auth";
import { AppError } from "../../common/errors";

class LoginDto {
  @IsString() @MinLength(1) @MaxLength(100) username: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}
@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, { count: number; at: number }>();
  constructor(private readonly db: DataSource) {}
  async login(dto: LoginDto, req: Request, res: Response) {
    checkOrigin(req);
    const username = dto.username.trim().toLowerCase();
    if (!username) throw AppError.validation("ID petugas wajib diisi.");
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (now - value.at >= 900_000) this.attempts.delete(key);
    if (
      (this.attempts.get(username)?.count || 0) >= 10 ||
      this.attempts.size >= 1000
    )
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
      );
    // Count before asynchronous verification so concurrent failures cannot bypass the limit.
    const attempt = this.attempts.get(username) || { count: 0, at: now };
    attempt.count++;
    this.attempts.set(username, attempt);
    const [row] = await this.db.query(
      `SELECT u.id,u.username,u.name,u.role,u.coordinator,u.password_hash FROM users u WHERE lower(u.username)=$1 AND u.active AND (u.role<>'PERAWAT' OR EXISTS(SELECT 1 FROM nurses n WHERE n.user_id=u.id AND n.active))`,
      [username],
    );
    const fallback =
      "$argon2id$v=19$m=19456,t=2,p=1$bm9uZXhpc3RlbnR1c2Vy$+fGzg8LZDE67pwDt2me6EG3HEdcG5lKVLbAzvvB1vzI";
    const valid = await argon2
      .verify(row?.password_hash || fallback, dto.password)
      .catch(() => false);
    if (!valid || !row)
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "ID petugas atau kata sandi tidak sesuai.",
      );
    this.attempts.delete(username);
    const token = randomBytes(32).toString("hex"),
      csrfToken = randomBytes(32).toString("hex");
    const maxAge = 30 * 24 * 60 * 60;
    await this.db.transaction(async (tx) => {
      await tx.query(
        "DELETE FROM sessions WHERE expires_at<=now() OR token_hash=$1",
        [digest(cookie(req, "session") || "")],
      );
      await tx.query(
        "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)",
        [
          digest(token),
          row.id,
          csrfToken,
          new Date(Date.now() + maxAge * 1000),
        ],
      );
    });
    const secure = new URL(req.headers.origin!).protocol === "https:";
    res.cookie("session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: maxAge * 1000,
    });
    res.cookie("csrf_token", csrfToken, {
      path: "/",
      sameSite: "lax",
      secure,
      maxAge: maxAge * 1000,
    });
    const user: Actor = {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      coordinator: row.coordinator,
      csrfToken,
    };
    return { user };
  }
  async logout(req: Request, res: Response) {
    await this.db.query("DELETE FROM sessions WHERE token_hash=$1", [
      digest(cookie(req, "session") || ""),
    ]);
    const secure = req.headers.origin?.startsWith("https://") || false;
    res.clearCookie("session", {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure,
    });
    res.clearCookie("csrf_token", { path: "/", sameSite: "lax", secure });
  }
}
@Controller("session")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Get() sesiSaatIni(@CurrentActor() user: Actor) {
    return { user };
  }
  @Public()
  @Post()
  @HttpCode(200)
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(dto, req, res);
  }
  @Delete()
  @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }
}
@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
