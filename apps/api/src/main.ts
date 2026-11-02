import "reflect-metadata";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  ExpressAdapter,
  NestExpressApplication,
} from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { ApiExceptionFilter, AppError } from "./common/errors";
import { trustedOrigins } from "./common/auth";

export async function createApp() {
  trustedOrigins();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    { bodyParser: false, logger: ["error", "warn"] },
  );
  app.disable("x-powered-by");
  const trustProxy = process.env.TRUST_PROXY || "loopback";
  if (!["loopback", "uniquelocal", "false"].includes(trustProxy))
    throw new Error("TRUST_PROXY must be loopback, uniquelocal or false");
  app.set("trust proxy", trustProxy === "false" ? false : trustProxy);
  app.use(
    (
      _req: unknown,
      res: { set: (headers: Record<string, string>) => void },
      next: () => void,
    ) => {
      res.set({
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "same-origin",
        "cache-control": "no-store",
      });
      next();
    },
  );
  app.useBodyParser("json", { limit: "256kb", strict: true });
  app.setGlobalPrefix("api/v1", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      exceptionFactory: () => AppError.validation(),
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
async function main() {
  const app = await createApp();
  const bind = new URL(`http://${process.env.API_BIND || "127.0.0.1:8080"}`);
  await app.listen(Number(bind.port || 80), bind.hostname);
  console.log(`InpaCare NestJS API ready on ${bind.hostname}:${bind.port}`);
}
if (require.main === module)
  void main().catch(() => {
    console.error(
      "API startup failed. Check database connectivity and configuration.",
    );
    process.exitCode = 1;
  });
