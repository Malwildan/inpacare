use crate::db;
use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHasher,
};
use chrono::{Duration, FixedOffset, TimeZone};
use rust_decimal::Decimal;
use serde_json::json;
use sqlx::PgPool;

pub async fn run(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(7231901)")
        .execute(&mut *tx)
        .await?;
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users)")
        .fetch_one(&mut *tx)
        .await?;
    if exists {
        return Ok(());
    }
    let hash = Argon2::default()
        .hash_password(b"InpaCareDemo!2026", &SaltString::generate(&mut OsRng))
        .map_err(|error| std::io::Error::other(error.to_string()))?
        .to_string();
    let users = [
        ("USR-COORD", "rina", "Rina Saputra", "PERAWAT", true),
        ("USR-NURSE-1", "dina", "Dina Putri", "PERAWAT", false),
        ("USR-NURSE-2", "bima", "Bima Pratama", "PERAWAT", false),
        (
            "USR-DOCTOR-1",
            "hendra",
            "dr. Hendra Wijaya",
            "DOKTER",
            false,
        ),
        ("USR-DOCTOR-2", "maya", "dr. Maya Kirana", "DOKTER", false),
        ("USR-ADMISI", "admisi", "Alya Putri", "ADMISI", false),
    ];
    for (i, (id, username, name, role, coordinator)) in users.iter().enumerate() {
        sqlx::query("INSERT INTO users(id,username,name,role,coordinator,password_hash) VALUES($1,$2,$3,$4,$5,$6)").bind(id).bind(username).bind(name).bind(role).bind(coordinator).bind(&hash).execute(&mut *tx).await?;
        if *role == "PERAWAT" {
            sqlx::query("INSERT INTO nurses(id,user_id) VALUES($1,$2)")
                .bind(format!("NRS-{i}"))
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
        if *role == "DOKTER" {
            sqlx::query("INSERT INTO doctors(id,user_id,specialty) VALUES($1,$2,'Penyakit Dalam')")
                .bind(format!("DOC-{i}"))
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
    }
    let names = [
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
    let today = db::today();
    let start = today - Duration::days(4);
    let end = today + Duration::days(14);
    for (i, name) in names.iter().enumerate() {
        let id = format!("PT-{:03}", i + 1);
        sqlx::query("INSERT INTO patients(id,medical_record_no,name,birth_date,gender,bpjs,bpjs_number) VALUES($1,$2,$3,$4,$5,$6,$7)")
   .bind(&id).bind(format!("RM-{:05}",4218+i)).bind(name).bind(today-Duration::days((25+i as i64*3)*365)).bind(if i%2==0{"P"}else{"L"}).bind(i%3!=1).bind(if i%3!=1{Some(format!("00012345{:05}",i))}else{None}).execute(&mut *tx).await?;
    }
    for (i, name) in [
        "Melati 01",
        "Melati 02",
        "Anggrek 05",
        "Anggrek 06",
        "Mawar 01",
    ]
    .iter()
    .enumerate()
    {
        let room = format!("RG-{:03}", i + 1);
        sqlx::query("INSERT INTO rooms(id,name,room_class,capacity,pic_id,daily_rate,status) VALUES($1,$2,$3,$4,'USR-NURSE-1',$5,$6)")
   .bind(&room).bind(name).bind(if i<2{"Kelas I"}else{"Kelas II"}).bind(if i==4{1}else{4}).bind(Decimal::from(if i<2{450000}else{300000})).bind(if i==4{"maintenance"}else{"available"}).execute(&mut *tx).await?;
        for (j, (item, category, price)) in [
            ("Tempat tidur pasien", "Fasilitas", 150000),
            ("Monitor pasien", "Peralatan", 75000),
            ("Meja pasien", "Fasilitas", 25000),
        ]
        .iter()
        .enumerate()
        {
            sqlx::query("INSERT INTO room_items(id,room_id,name,category,quantity,unit_price) VALUES($1,$2,$3,$4,1,$5)").bind(format!("IT-{i}-{j}")).bind(&room).bind(item).bind(category).bind(Decimal::from(*price)).execute(&mut *tx).await?;
        }
    }
    for i in 0..8 {
        let patient = format!("PT-{:03}", i + 1);
        let placement = format!("PL-{:03}", i + 1);
        let room = format!("RG-{:03}", i % 4 + 1);
        let doctor = if i % 2 == 0 {
            "USR-DOCTOR-1"
        } else {
            "USR-DOCTOR-2"
        };
        sqlx::query("INSERT INTO placements(id,patient_id,room_id,starts_on,ends_on,created_by) VALUES($1,$2,$3,$4,$5,'USR-COORD')").bind(&placement).bind(&patient).bind(&room).bind(start).bind(end).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO cycles(id,patient_id,placement_id,doctor_id,nurse_id,status) VALUES($1,$2,$3,$4,'USR-NURSE-1',$5)").bind(format!("CY-{:03}",i+1)).bind(&patient).bind(&placement).bind(doctor).bind(if i==0{"pending"}else if i==1{"assigned"}else{"in_care"}).execute(&mut *tx).await?;
        let record = format!("MR-{:03}", i + 1);
        sqlx::query("INSERT INTO medical_records(id,patient_id,doctor_id,complaint,diagnosis,treatment,notes) VALUES($1,$2,$3,$4,$5,$6,'Data sintetis untuk demonstrasi aplikasi.')").bind(&record).bind(&patient).bind(doctor).bind("Keluhan yang dicatat untuk demonstrasi").bind("Diagnosis contoh — bukan data klinis nyata").bind("Rencana perawatan contoh").execute(&mut *tx).await?;
        let observation = format!("OB-{:03}", i + 1);
        sqlx::query("INSERT INTO observations(id,record_id,nurse_id,symptoms,nursing_note,observed_at) VALUES($1,$2,'USR-NURSE-1','Keluhan berkurang','Observasi sintetis.',now())").bind(&observation).bind(&record).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO vital_signs(id,observation_id,temperature,systolic,diastolic,pulse,respiratory_rate,spo2) VALUES($1,$2,36.5,120,80,78,18,98)").bind(format!("VT-{:03}",i+1)).bind(&observation).execute(&mut *tx).await?;
    }
    let zone = FixedOffset::east_opt(7 * 3600).unwrap();
    let titles = [
        "Pemeriksaan tanda vital",
        "Pemantauan kondisi pasien",
        "Pencatatan hasil observasi",
        "Pemantauan asupan cairan",
        "Pemeriksaan lanjutan",
    ];
    for i in 0..200 {
        let patient = format!("PT-{:03}", i % 8 + 1);
        let placement = format!("PL-{:03}", i % 8 + 1);
        let room = format!("RG-{:03}", i % 4 + 1);
        let at = zone
            .from_local_datetime(
                &(today + Duration::days(i / 32))
                    .and_hms_opt(7 + (i % 10) as u32, 0, 0)
                    .unwrap(),
            )
            .single()
            .unwrap();
        let id = format!("TK-{:03}", i + 1);
        let status = ["todo", "todo", "in_progress", "done", "cancelled"][(i % 5) as usize];
        let pic = if i % 3 == 0 {
            "USR-NURSE-2"
        } else {
            "USR-NURSE-1"
        };
        sqlx::query("INSERT INTO tasks(id,patient_id,room_id,placement_id,pic_id,created_by,title,description,starts_at,ends_at,priority,status) VALUES($1,$2,$3,$4,$5,'USR-COORD',$6,'Ikuti instruksi dokter yang bertanggung jawab. Data demonstrasi.',$7,$8,$9,$10)")
   .bind(&id).bind(&patient).bind(&room).bind(&placement).bind(pic).bind(titles[(i%5)as usize]).bind(at).bind(at+Duration::minutes(45)).bind(if i%4==0{"high"}else{"normal"}).bind(status).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO task_history(id,task_id,actor_id,action,reason,after_data) VALUES($1,$2,'USR-COORD','created','Seed demonstrasi',$3)").bind(format!("TH-{:03}",i+1)).bind(&id).bind(json!({"title":titles[(i%5)as usize],"status":status,"picId":pic,"version":1})).execute(&mut *tx).await?;
    }
    for i in 0..4 {
        let invoice = format!("INV-{:03}", i + 1);
        let insured = i % 3 != 1;
        let gross = Decimal::from(900000);
        let covered = if insured {
            Decimal::from(600000)
        } else {
            Decimal::ZERO
        };
        sqlx::query("INSERT INTO invoices(id,patient_id,placement_id,bpjs_snapshot,total_amount,covered_amount,payable_amount,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'USR-ADMISI')")
   .bind(&invoice).bind(format!("PT-{:03}",i+1)).bind(format!("PL-{:03}",i+1)).bind(insured).bind(gross).bind(covered).bind(gross-covered).bind(if i==2{"paid"}else{"unpaid"}).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO invoice_lines(id,invoice_id,description,quantity,unit_price,line_total) VALUES($1,$2,'Rawat inap — tarif contoh',2,450000,900000)").bind(format!("IL-{:03}",i+1)).bind(&invoice).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO invoice_history(id,invoice_id,actor_id,action,reason,after_data) VALUES($1,$2,'USR-ADMISI','created','Seed demonstrasi',$3)").bind(format!("IH-{:03}",i+1)).bind(&invoice).bind(json!({"totalAmount":"900000.00","coveredAmount":covered.to_string(),"status":if i==2{"paid"}else{"unpaid"}})).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    tracing::info!("Synthetic demo seed applied: 6 staff, 12 patients, 5 rooms, 200 tasks");
    Ok(())
}
