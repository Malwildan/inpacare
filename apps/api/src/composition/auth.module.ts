import { Module } from "@nestjs/common";
import { ApplicationModule } from "./application.module";
import { AuthController } from "../presentation/http/auth/auth.controller";
@Module({ imports: [ApplicationModule], controllers: [AuthController] })
export class AuthModule {}
