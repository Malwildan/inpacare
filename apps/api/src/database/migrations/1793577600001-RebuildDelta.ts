import { MigrationInterface, QueryRunner } from "typeorm";

export class RebuildDelta1793577600001 implements MigrationInterface {
  name = "RebuildDelta1793577600001";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE patients ADD COLUMN IF NOT EXISTS address text;
      ALTER TABLE patients ADD COLUMN IF NOT EXISTS status text;
      ALTER TABLE doctors ADD COLUMN IF NOT EXISTS name text;
      ALTER TABLE nurses ADD COLUMN IF NOT EXISTS name text;
      ALTER TABLE nurses ADD COLUMN IF NOT EXISTS unit text;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_at timestamptz;
      ALTER TABLE rooms ALTER COLUMN created_at SET DEFAULT now();
      ALTER TABLE cycles ADD COLUMN IF NOT EXISTS cycle_date date;
      ALTER TABLE cycles ALTER COLUMN cycle_date SET DEFAULT timezone('Asia/Jakarta', now())::date;
      ALTER TABLE cycles ADD COLUMN IF NOT EXISTS doctor_profile_id varchar(36) REFERENCES doctors(id);
      ALTER TABLE cycles ADD COLUMN IF NOT EXISTS nurse_profile_id varchar(36) REFERENCES nurses(id);
      ALTER TABLE cycle_requests ADD COLUMN IF NOT EXISTS previous_status text;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS claim_verified boolean NOT NULL DEFAULT false;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS claim_verified_at timestamptz;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS claim_verified_by varchar(36) REFERENCES users(id);
      ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS room_item_id varchar(36) REFERENCES room_items(id);
      ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS kind text;
      ALTER TABLE observations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
      ALTER TABLE observations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
      ALTER TABLE observations ADD COLUMN IF NOT EXISTS nurse_profile_id varchar(36) REFERENCES nurses(id);
      ALTER TABLE observations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
      ALTER TABLE vital_signs ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
      ALTER TABLE vital_signs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
      ALTER TABLE rooms ADD COLUMN IF NOT EXISTS pic_nurse_id varchar(36) REFERENCES nurses(id);
      ALTER TABLE room_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
      ALTER TABLE cycles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pic_nurse_id varchar(36) REFERENCES nurses(id);
      ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS doctor_profile_id varchar(36) REFERENCES doctors(id);
      CREATE TABLE IF NOT EXISTS medical_history (
        id varchar(36) PRIMARY KEY, entity_type text NOT NULL, entity_id varchar(36) NOT NULL,
        actor_id varchar(36) NOT NULL REFERENCES users(id), action text NOT NULL, reason text,
        before_data jsonb, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS medical_history_entity ON medical_history(entity_type, entity_id, created_at, id);
      DROP INDEX IF EXISTS cycles_active_patient;
      CREATE UNIQUE INDEX cycles_active_patient ON cycles(patient_id) WHERE status <> 'released' AND deleted_at IS NULL;
      UPDATE rooms r SET pic_nurse_id=n.id FROM nurses n WHERE n.user_id=r.pic_id AND r.pic_nurse_id IS NULL;
      UPDATE cycles c SET doctor_profile_id=d.id FROM doctors d WHERE d.user_id=c.doctor_id AND c.doctor_profile_id IS NULL;
      UPDATE cycles c SET nurse_profile_id=n.id FROM nurses n WHERE n.user_id=c.nurse_id AND c.nurse_profile_id IS NULL;
      UPDATE tasks t SET pic_nurse_id=n.id FROM nurses n WHERE n.user_id=t.pic_id AND t.pic_nurse_id IS NULL;
      UPDATE medical_records r SET doctor_profile_id=d.id FROM doctors d WHERE d.user_id=r.doctor_id AND r.doctor_profile_id IS NULL;
      UPDATE observations o SET nurse_profile_id=n.id FROM nurses n WHERE n.user_id=o.nurse_id AND o.nurse_profile_id IS NULL;
      UPDATE doctors d SET name=u.name FROM users u WHERE d.user_id=u.id AND d.name IS NULL;
      UPDATE nurses n SET name=u.name FROM users u WHERE n.user_id=u.id AND n.name IS NULL;
      DO $$ DECLARE room_unmapped integer; cycle_doctor_unmapped integer; cycle_nurse_unmapped integer; task_unmapped integer; record_unmapped integer; observation_unmapped integer; BEGIN
        SELECT count(*) INTO room_unmapped FROM rooms WHERE pic_id IS NOT NULL AND pic_nurse_id IS NULL;
        SELECT count(*) INTO cycle_doctor_unmapped FROM cycles WHERE doctor_profile_id IS NULL;
        SELECT count(*) INTO cycle_nurse_unmapped FROM cycles WHERE nurse_profile_id IS NULL;
        SELECT count(*) INTO task_unmapped FROM tasks WHERE pic_id IS NOT NULL AND pic_nurse_id IS NULL;
        SELECT count(*) INTO record_unmapped FROM medical_records WHERE doctor_profile_id IS NULL;
        SELECT count(*) INTO observation_unmapped FROM observations WHERE nurse_profile_id IS NULL;
        RAISE NOTICE 'Unmapped legacy staff profile links preserved as NULL: rooms %, cycle doctors %, cycle nurses %, tasks %, records %, observations %', room_unmapped, cycle_doctor_unmapped, cycle_nurse_unmapped, task_unmapped, record_unmapped, observation_unmapped;
      END $$;
      CREATE OR REPLACE FUNCTION sync_staff_profile_link() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME='rooms' THEN
          SELECT n.id INTO NEW.pic_nurse_id FROM nurses n WHERE n.user_id=NEW.pic_id;
          IF NEW.pic_id IS NOT NULL AND NEW.pic_nurse_id IS NULL THEN RAISE EXCEPTION 'No nurse profile for PIC user id %', NEW.pic_id; END IF;
        ELSIF TG_TABLE_NAME='cycles' THEN
          SELECT d.id INTO NEW.doctor_profile_id FROM doctors d WHERE d.user_id=NEW.doctor_id;
          SELECT n.id INTO NEW.nurse_profile_id FROM nurses n WHERE n.user_id=NEW.nurse_id;
          IF NEW.doctor_profile_id IS NULL THEN RAISE EXCEPTION 'No doctor profile for user id %', NEW.doctor_id; END IF;
          IF NEW.nurse_profile_id IS NULL THEN RAISE EXCEPTION 'No nurse profile for user id %', NEW.nurse_id; END IF;
        ELSIF TG_TABLE_NAME='tasks' THEN
          SELECT n.id INTO NEW.pic_nurse_id FROM nurses n WHERE n.user_id=NEW.pic_id;
          IF NEW.pic_id IS NOT NULL AND NEW.pic_nurse_id IS NULL THEN RAISE EXCEPTION 'No nurse profile for PIC user id %', NEW.pic_id; END IF;
        ELSIF TG_TABLE_NAME='medical_records' THEN
          SELECT d.id INTO NEW.doctor_profile_id FROM doctors d WHERE d.user_id=NEW.doctor_id;
          IF NEW.doctor_profile_id IS NULL THEN RAISE EXCEPTION 'No doctor profile for user id %', NEW.doctor_id; END IF;
        ELSIF TG_TABLE_NAME='observations' THEN
          SELECT n.id INTO NEW.nurse_profile_id FROM nurses n WHERE n.user_id=NEW.nurse_id;
          IF NEW.nurse_profile_id IS NULL THEN RAISE EXCEPTION 'No nurse profile for user id %', NEW.nurse_id; END IF;
        END IF;
        RETURN NEW;
      END $$;
      DROP TRIGGER IF EXISTS rooms_staff_profile_link ON rooms;
      CREATE TRIGGER rooms_staff_profile_link BEFORE INSERT OR UPDATE OF pic_id ON rooms FOR EACH ROW EXECUTE FUNCTION sync_staff_profile_link();
      DROP TRIGGER IF EXISTS cycles_staff_profile_link ON cycles;
      CREATE TRIGGER cycles_staff_profile_link BEFORE INSERT OR UPDATE OF doctor_id,nurse_id ON cycles FOR EACH ROW EXECUTE FUNCTION sync_staff_profile_link();
      DROP TRIGGER IF EXISTS tasks_staff_profile_link ON tasks;
      CREATE TRIGGER tasks_staff_profile_link BEFORE INSERT OR UPDATE OF pic_id ON tasks FOR EACH ROW EXECUTE FUNCTION sync_staff_profile_link();
      DROP TRIGGER IF EXISTS medical_records_staff_profile_link ON medical_records;
      CREATE TRIGGER medical_records_staff_profile_link BEFORE INSERT OR UPDATE OF doctor_id ON medical_records FOR EACH ROW EXECUTE FUNCTION sync_staff_profile_link();
      DROP TRIGGER IF EXISTS observations_staff_profile_link ON observations;
      CREATE TRIGGER observations_staff_profile_link BEFORE INSERT OR UPDATE OF nurse_id ON observations FOR EACH ROW EXECUTE FUNCTION sync_staff_profile_link();
    `);
  }
  async down(): Promise<void> {
    throw new Error(
      "Rebuild delta is intentionally irreversible; restore from a verified backup.",
    );
  }
}
