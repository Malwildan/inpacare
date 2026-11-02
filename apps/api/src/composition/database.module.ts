import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { createDataSource } from "../infrastructure/database/data-source";
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ ...createDataSource().options, retryAttempts: 1 }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
