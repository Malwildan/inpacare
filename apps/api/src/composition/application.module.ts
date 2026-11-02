import { Global, Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuthUseCases } from "../application/auth/auth.use-cases";
import { DatabaseModule } from "./database.module";
import { createUseCases } from "./create-use-cases";
import { TugasUseCases } from "../application/tasks/tugas.use-cases";
import { RuangInapUseCases } from "../application/rooms/ruang-inap.use-cases";
import { AssignRuanganUseCases } from "../application/placements/assign-ruangan.use-cases";
import { CyclesUseCases } from "../application/cycles/cycles.use-cases";
import { RekamMedisUseCases } from "../application/medical-records/rekam-medis.use-cases";
import { TagihanUseCases } from "../application/billing/tagihan.use-cases";
import { ReferenceUseCases } from "../application/reference/reference.use-cases";
import { NotificationsUseCases } from "../application/notifications/notifications.use-cases";
const SERVICES = Symbol("ApplicationServices");
const bindings = [
  [AuthUseCases, "auth"],
  [TugasUseCases, "tasks"],
  [RuangInapUseCases, "rooms"],
  [AssignRuanganUseCases, "placements"],
  [CyclesUseCases, "cycles"],
  [RekamMedisUseCases, "medicalRecords"],
  [TagihanUseCases, "billing"],
  [ReferenceUseCases, "reference"],
  [NotificationsUseCases, "notifications"],
] as const;
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: SERVICES, useFactory: createUseCases, inject: [DataSource] },
    ...bindings.map(([provide, key]) => ({
      provide,
      useFactory: (services: ReturnType<typeof createUseCases>) =>
        services[key],
      inject: [SERVICES],
    })),
  ],
  exports: bindings.map(([provide]) => provide),
})
export class ApplicationModule {}
