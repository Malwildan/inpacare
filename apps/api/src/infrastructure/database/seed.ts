import { createDataSource } from "./entity-registry";

async function main(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();
  try {
    const password = process.env.SEED_DEMO_PASSWORD;
    if (!password || password.length < 12)
      throw new Error("Set SEED_DEMO_PASSWORD to at least 12 characters");
    const argon2 = await import("argon2");
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(7231901)");
      const tables: Array<{ name: string }> = await manager.query(
        `SELECT tablename AS name FROM pg_tables WHERE schemaname=current_schema() AND tablename NOT IN ('migrations','_sqlx_migrations')`,
      );
      for (const { name } of tables) {
        const [result] = await manager.query(
          `SELECT count(*)::int AS n FROM "${name}"`,
        );
        if (Number(result.n) !== 0)
          throw new Error(`Refusing to seed: ${name} is not empty`);
      }
      const users = [
        ["USR-COORD", "rina", "Rina Saputra", "PERAWAT", true],
        ["USR-NURSE-1", "dina", "Dina Putri", "PERAWAT", false],
        ["USR-NURSE-2", "bima", "Bima Pratama", "PERAWAT", false],
        ["USR-DOCTOR-1", "hendra", "dr. Hendra Wijaya", "DOKTER", false],
        ["USR-DOCTOR-2", "maya", "dr. Maya Kirana", "DOKTER", false],
        ["USR-ADMISI", "admisi", "Alya Putri", "ADMISI", false],
      ] as const;
      for (const [id, username, name, role, coordinator] of users) {
        await manager.query(
          "INSERT INTO users(id,username,name,role,coordinator,password_hash) VALUES($1,$2,$3,$4,$5,$6)",
          [id, username, name, role, coordinator, hash],
        );
        if (role === "PERAWAT")
          await manager.query(
            "INSERT INTO nurses(id,user_id,name) VALUES($1,$2,$3)",
            [`NRS-${users.indexOf(users.find((u) => u[0] === id)!)}`, id, name],
          );
        if (role === "DOKTER")
          await manager.query(
            "INSERT INTO doctors(id,user_id,specialty,name) VALUES($1,$2,$3,$4)",
            [
              `DOC-${users.indexOf(users.find((u) => u[0] === id)!)}`,
              id,
              "Penyakit Dalam",
              name,
            ],
          );
      }
      const patientNames = [
        "Siti Rahmawati",
        "Budi Santoso",
        "Nadia Sari",
        "Arif Wijaya",
        "Rudi Hartono",
        "Dewi Lestari",
        "Ahmad Fauzi",
        "Ratna Wulandari",
        "Agus Setiawan",
        "Putri Anggraini",
        "Yusuf Pratama",
        "Sri Utami",
      ];
      const today = new Date(
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
          new Date(),
        ) + "T00:00:00.000Z",
      );
      const isoDate = (date: Date) => date.toISOString().slice(0, 10);
      for (let i = 0; i < patientNames.length; i++) {
        const birth = new Date(today);
        birth.setUTCDate(birth.getUTCDate() - (25 + i * 3) * 365);
        const insured = i % 3 !== 1;
        await manager.query(
          "INSERT INTO patients(id,medical_record_no,name,birth_date,gender,bpjs,bpjs_number) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            `PT-${String(i + 1).padStart(3, "0")}`,
            `RM-${String(4218 + i).padStart(5, "0")}`,
            patientNames[i],
            isoDate(birth),
            i % 2 === 0 ? "P" : "L",
            insured,
            insured ? `00012345${String(i).padStart(5, "0")}` : null,
          ],
        );
      }
      const roomNames = [
        "Melati 01",
        "Melati 02",
        "Anggrek 05",
        "Anggrek 06",
        "Mawar 01",
      ];
      const roomItems = [
        ["Tempat tidur pasien", "Fasilitas", 150000],
        ["Monitor pasien", "Peralatan", 75000],
        ["Meja pasien", "Fasilitas", 25000],
      ] as const;
      for (let i = 0; i < roomNames.length; i++) {
        const room = `RG-${String(i + 1).padStart(3, "0")}`;
        await manager.query(
          "INSERT INTO rooms(id,name,room_class,capacity,pic_id,daily_rate,status) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            room,
            roomNames[i],
            i < 2 ? "Kelas I" : "Kelas II",
            i === 4 ? 1 : 4,
            "USR-NURSE-1",
            String(i < 2 ? 450000 : 300000),
            i === 4 ? "maintenance" : "available",
          ],
        );
        for (let j = 0; j < roomItems.length; j++) {
          const [name, category, price] = roomItems[j];
          await manager.query(
            "INSERT INTO room_items(id,room_id,name,category,quantity,unit_price) VALUES($1,$2,$3,$4,1,$5)",
            [`IT-${i}-${j}`, room, name, category, String(price)],
          );
        }
      }
      const start = new Date(today);
      start.setUTCDate(start.getUTCDate() - 4);
      const end = new Date(today);
      end.setUTCDate(end.getUTCDate() + 14);
      for (let i = 0; i < 8; i++) {
        const patient = `PT-${String(i + 1).padStart(3, "0")}`,
          placement = `PL-${String(i + 1).padStart(3, "0")}`,
          room = `RG-${String((i % 4) + 1).padStart(3, "0")}`;
        const doctor = i % 2 === 0 ? "USR-DOCTOR-1" : "USR-DOCTOR-2";
        await manager.query(
          "INSERT INTO placements(id,patient_id,room_id,starts_on,ends_on,created_by) VALUES($1,$2,$3,$4,$5,$6)",
          [placement, patient, room, isoDate(start), isoDate(end), "USR-COORD"],
        );
        await manager.query(
          "INSERT INTO cycles(id,patient_id,placement_id,doctor_id,nurse_id,status) VALUES($1,$2,$3,$4,$5,$6)",
          [
            `CY-${String(i + 1).padStart(3, "0")}`,
            patient,
            placement,
            doctor,
            "USR-NURSE-1",
            i === 0 ? "pending" : i === 1 ? "assigned" : "in_care",
          ],
        );
        const record = `MR-${String(i + 1).padStart(3, "0")}`;
        await manager.query(
          "INSERT INTO medical_records(id,patient_id,doctor_id,complaint,diagnosis,treatment,notes) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            record,
            patient,
            doctor,
            "Keluhan yang dicatat untuk demonstrasi",
            "Diagnosis contoh — bukan data klinis nyata",
            "Rencana perawatan contoh",
            "Data sintetis untuk demonstrasi aplikasi.",
          ],
        );
        const observation = `OB-${String(i + 1).padStart(3, "0")}`;
        await manager.query(
          "INSERT INTO observations(id,record_id,nurse_id,symptoms,nursing_note,observed_at) VALUES($1,$2,$3,$4,$5,now())",
          [
            observation,
            record,
            "USR-NURSE-1",
            "Keluhan berkurang",
            "Observasi sintetis.",
          ],
        );
        await manager.query(
          "INSERT INTO vital_signs(id,observation_id,temperature,systolic,diastolic,pulse,respiratory_rate,spo2) VALUES($1,$2,36.5,120,80,78,18,98)",
          [`VT-${String(i + 1).padStart(3, "0")}`, observation],
        );
      }
      const titles = [
        "Pemeriksaan tanda vital",
        "Pemantauan kondisi pasien",
        "Pencatatan hasil observasi",
        "Pemantauan asupan cairan",
        "Pemeriksaan lanjutan",
      ];
      for (let i = 0; i < 200; i++) {
        const patient = `PT-${String((i % 8) + 1).padStart(3, "0")}`,
          placement = `PL-${String((i % 8) + 1).padStart(3, "0")}`,
          room = `RG-${String((i % 4) + 1).padStart(3, "0")}`;
        const at = new Date(today);
        at.setUTCDate(at.getUTCDate() + Math.floor(i / 32));
        at.setUTCHours(i % 10, 0, 0, 0);
        const id = `TK-${String(i + 1).padStart(3, "0")}`,
          status = (
            ["todo", "todo", "in_progress", "done", "cancelled"] as const
          )[i % 5],
          pic = i % 3 === 0 ? "USR-NURSE-2" : "USR-NURSE-1";
        const title = titles[i % 5];
        await manager.query(
          "INSERT INTO tasks(id,patient_id,room_id,placement_id,pic_id,created_by,title,description,starts_at,ends_at,priority,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            id,
            patient,
            room,
            placement,
            pic,
            "USR-COORD",
            title,
            "Ikuti instruksi dokter yang bertanggung jawab. Data demonstrasi.",
            at,
            new Date(at.getTime() + 45 * 60_000),
            i % 4 === 0 ? "high" : "normal",
            status,
          ],
        );
        await manager.query(
          "INSERT INTO task_history(id,task_id,actor_id,action,reason,after_data) VALUES($1,$2,$3,$4,$5,$6)",
          [
            `TH-${String(i + 1).padStart(3, "0")}`,
            id,
            "USR-COORD",
            "created",
            "Seed demonstrasi",
            { title, status, picId: pic, version: 1 },
          ],
        );
      }
      for (let i = 0; i < 4; i++) {
        const invoice = `INV-${String(i + 1).padStart(3, "0")}`,
          insured = i % 3 !== 1,
          covered = insured ? "600000" : "0",
          status = i === 2 ? "paid" : "unpaid";
        await manager.query(
          "INSERT INTO invoices(id,patient_id,placement_id,bpjs_snapshot,total_amount,covered_amount,payable_amount,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            invoice,
            `PT-${String(i + 1).padStart(3, "0")}`,
            `PL-${String(i + 1).padStart(3, "0")}`,
            insured,
            "900000",
            covered,
            String(900000 - Number(covered)),
            status,
            "USR-ADMISI",
          ],
        );
        await manager.query(
          "INSERT INTO invoice_lines(id,invoice_id,description,quantity,unit_price,line_total) VALUES($1,$2,$3,2,450000,900000)",
          [
            `IL-${String(i + 1).padStart(3, "0")}`,
            invoice,
            "Rawat inap — tarif contoh",
          ],
        );
        await manager.query(
          "INSERT INTO invoice_history(id,invoice_id,actor_id,action,reason,after_data) VALUES($1,$2,$3,$4,$5,$6)",
          [
            `IH-${String(i + 1).padStart(3, "0")}`,
            invoice,
            "USR-ADMISI",
            "created",
            "Seed demonstrasi",
            { totalAmount: "900000.00", coveredAmount: covered, status },
          ],
        );
      }
    });
  } finally {
    await dataSource.destroy();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
