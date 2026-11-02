import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthUseCases } from "../../../application/auth/auth.use-cases";
import {
  checkOrigin,
  cookie,
  CurrentActor,
  HttpActor,
  Public,
} from "../security/auth-context";
import { LoginDto } from "./dto/login.dto";
@Controller("session")
export class AuthController {
  constructor(private readonly auth: AuthUseCases) {}
  @Get()
  sesiSaatIni(
    @CurrentActor()
    user: HttpActor,
  ) {
    return { user };
  }
  @Public()
  @Post()
  @HttpCode(200)
  async login(
    @Body()
    dto: LoginDto,
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response,
  ) {
    checkOrigin(req);
    const result = await this.auth.login({
      username: dto.username,
      password: dto.password,
      source: req.ip || req.socket.remoteAddress || "unknown",
      currentToken: cookie(req, "session"),
    });
    const secure = new URL(req.headers.origin!).protocol === "https:";
    res.cookie("session", result.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: result.maxAge * 1000,
    });
    res.cookie("csrf_token", result.user.csrfToken, {
      path: "/",
      sameSite: "lax",
      secure,
      maxAge: result.maxAge * 1000,
    });
    return { user: result.user };
  }
  @Delete()
  @HttpCode(204)
  async logout(
    @Req()
    req: Request,
    @Res({ passthrough: true })
    res: Response,
  ) {
    await this.auth.logout(cookie(req, "session"));
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
