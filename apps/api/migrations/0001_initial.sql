CREATE TABLE users (
 id varchar(36) PRIMARY KEY, username text UNIQUE NOT NULL, name text NOT NULL,
 role text NOT NULL CHECK(role IN ('DOKTER','PERAWAT','ADMISI')),
 coordinator boolean NOT NULL DEFAULT false CHECK (NOT coordinator OR role = 'PERAWAT'),
 password_hash text NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE doctors (id varchar(36) PRIMARY KEY, user_id varchar(36) NOT NULL UNIQUE REFERENCES users(id), specialty text NOT NULL);
CREATE TABLE nurses (id varchar(36) PRIMARY KEY, user_id varchar(36) NOT NULL UNIQUE REFERENCES users(id), active boolean NOT NULL DEFAULT true);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id varchar(36) NOT NULL REFERENCES users(id), csrf_token text NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE patients (
 id varchar(36) PRIMARY KEY, medical_record_no text NOT NULL UNIQUE, name text NOT NULL,
 birth_date date NOT NULL, gender text NOT NULL CHECK(gender IN ('L','P')),
 bpjs boolean NOT NULL DEFAULT false, bpjs_number text
);
CREATE TABLE rooms (
 id varchar(36) PRIMARY KEY, name text UNIQUE NOT NULL, room_class text NOT NULL,
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 20),
 status text NOT NULL CHECK(status IN ('available','maintenance')) DEFAULT 'available',
 pic_id varchar(36) REFERENCES users(id), daily_rate numeric(15,2) NOT NULL DEFAULT 0 CHECK(daily_rate>=0),
 version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE room_items (
 id varchar(36) PRIMARY KEY, room_id varchar(36) NOT NULL REFERENCES rooms(id), name text NOT NULL,
 category text NOT NULL, quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
 unit_price numeric(15,2) NOT NULL CHECK(unit_price>=0)
);
CREATE INDEX room_items_room ON room_items(room_id);
CREATE TABLE placements (
 id varchar(36) PRIMARY KEY, patient_id varchar(36) NOT NULL REFERENCES patients(id),
 room_id varchar(36) NOT NULL REFERENCES rooms(id), starts_on date NOT NULL, ends_on date NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
 version integer NOT NULL DEFAULT 1, created_by varchar(36) NOT NULL REFERENCES users(id),
 CHECK(ends_on>=starts_on)
);
CREATE INDEX placements_room_dates ON placements(room_id, starts_on, ends_on) WHERE status='active';
CREATE INDEX placements_patient_dates ON placements(patient_id, starts_on, ends_on) WHERE status='active';
CREATE TABLE cycles (
 id varchar(36) PRIMARY KEY, patient_id varchar(36) NOT NULL REFERENCES patients(id),
 placement_id varchar(36) REFERENCES placements(id), doctor_id varchar(36) NOT NULL REFERENCES users(id),
 nurse_id varchar(36) NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','assigned','in_care','extend','released')),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cycles_active_patient ON cycles(patient_id) WHERE status <> 'released';
CREATE INDEX cycles_doctor ON cycles(doctor_id, created_at DESC);
CREATE TABLE cycle_requests (
 id varchar(36) PRIMARY KEY, cycle_id varchar(36) NOT NULL REFERENCES cycles(id),
 kind text NOT NULL CHECK(kind IN ('extend','release')), requested_end date, reason text NOT NULL,
 requested_by varchar(36) NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 decided_by varchar(36) REFERENCES users(id), decision_note text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz
);
CREATE UNIQUE INDEX cycle_one_pending ON cycle_requests(cycle_id) WHERE status='pending';
CREATE TABLE notifications (
 id varchar(36) PRIMARY KEY, user_id varchar(36) NOT NULL REFERENCES users(id),
 cycle_id varchar(36) REFERENCES cycles(id), message text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON notifications(user_id, created_at DESC);
CREATE TABLE tasks (
 id varchar(36) PRIMARY KEY, patient_id varchar(36) NOT NULL REFERENCES patients(id), room_id varchar(36) NOT NULL REFERENCES rooms(id),
 placement_id varchar(36) NOT NULL REFERENCES placements(id), pic_id varchar(36) NOT NULL REFERENCES users(id), created_by varchar(36) NOT NULL REFERENCES users(id),
 title text NOT NULL, description text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 priority text NOT NULL CHECK(priority IN ('low','normal','high')), status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done','cancelled')),
 version integer NOT NULL DEFAULT 1, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>=starts_at)
);
CREATE INDEX tasks_board ON tasks(pic_id, status, starts_at) WHERE deleted_at IS NULL;
CREATE INDEX tasks_placement ON tasks(placement_id, ends_at) WHERE deleted_at IS NULL;
CREATE TABLE task_history (
 id varchar(36) PRIMARY KEY, task_id varchar(36) NOT NULL REFERENCES tasks(id), actor_id varchar(36) NOT NULL REFERENCES users(id),
 action text NOT NULL, reason text, before_data jsonb, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_history_task ON task_history(task_id, created_at, id);
CREATE TABLE medical_records (
 id varchar(36) PRIMARY KEY, patient_id varchar(36) NOT NULL REFERENCES patients(id), doctor_id varchar(36) NOT NULL REFERENCES users(id),
 complaint text NOT NULL, diagnosis text NOT NULL, treatment text NOT NULL, notes text NOT NULL DEFAULT '',
 record_date date NOT NULL DEFAULT CURRENT_DATE, deleted_at timestamptz,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX medical_records_patient ON medical_records(patient_id, created_at DESC);
CREATE TABLE observations (
 id varchar(36) PRIMARY KEY, record_id varchar(36) NOT NULL REFERENCES medical_records(id), nurse_id varchar(36) NOT NULL REFERENCES users(id),
 symptoms text NOT NULL, nursing_note text NOT NULL DEFAULT '', observed_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX observations_record ON observations(record_id, observed_at DESC);
CREATE TABLE vital_signs (
 id varchar(36) PRIMARY KEY, observation_id varchar(36) NOT NULL UNIQUE REFERENCES observations(id),
 temperature numeric(5,2), systolic integer, diastolic integer, pulse integer, respiratory_rate integer,
 spo2 numeric(5,2)
);
CREATE TABLE invoices (
 id varchar(36) PRIMARY KEY, patient_id varchar(36) NOT NULL REFERENCES patients(id), placement_id varchar(36) REFERENCES placements(id),
 bpjs_snapshot boolean NOT NULL, total_amount numeric(15,2) NOT NULL CHECK(total_amount>=0),
 covered_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK(covered_amount>=0), payable_amount numeric(15,2) NOT NULL CHECK(payable_amount>=0),
 status text NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','paid')), version integer NOT NULL DEFAULT 1,
 created_by varchar(36) NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(total_amount = covered_amount + payable_amount), CHECK(bpjs_snapshot OR covered_amount = 0)
);
CREATE INDEX invoices_patient_status ON invoices(patient_id, status, created_at DESC);
CREATE TABLE invoice_lines (
 id varchar(36) PRIMARY KEY, invoice_id varchar(36) NOT NULL REFERENCES invoices(id), description text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10000), unit_price numeric(15,2) NOT NULL CHECK(unit_price>=0),
 line_total numeric(15,2) NOT NULL CHECK(line_total = quantity * unit_price)
);
CREATE INDEX invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE TABLE invoice_history (
 id varchar(36) PRIMARY KEY, invoice_id varchar(36) NOT NULL REFERENCES invoices(id), actor_id varchar(36) NOT NULL REFERENCES users(id),
 action text NOT NULL, reason text NOT NULL, before_data jsonb, after_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_history_invoice ON invoice_history(invoice_id, created_at, id);
