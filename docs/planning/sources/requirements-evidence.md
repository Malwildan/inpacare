# InpaCare Modul 2 — live requirements evidence

## Source and retrieval

- **Document title:** `Kelompok 2_RSI - Google Dokumen` (visible title in the live Docs page).
- **Canonical document:** `https://docs.google.com/document/d/1MDNjrTaaqyml-3hnH4L3X_hsodEB5lYt0HRwzQCMRjs/edit?tab=t.35pzydmpv5ma#heading=h.30j0zll`
- **Document ID:** `1MDNjrTaaqyml-3hnH4L3X_hsodEB5lYt0HRwzQCMRjs`.
- **Requested tab:** `Modul 2`, tab ID `t.35pzydmpv5ma`; browser showed tabs Modul 1, Modul 2, Kelas, and “jangan otak atik ya KtemanL”; Modul 2 was selected.
- **Retrieval:** 2026-10-29 10:04:44.990 UTC (17:04:44.990 Asia/Bangkok), via browser download of the read-only `export?format=txt&tab=t.35pzydmpv5ma` URL. No Docs edit/comment/share actions were taken. The connected document-session tool reported no connected sessions. Anonymous/public access was visible (the page showed a Login link and link-access sharing text); no account credentials were used.
- **Captured text:** `modul-2-live.txt` (private capture; omitted from public source), 284,087 bytes, 15,041 lines. SHA-256: `9A1023BBE4C391D5BAF20AA865DA0923FE5FB2462C9C7D01EBD8656A963716AD`.
- **Tab scope/access limit:** The export request included the selected tab ID and its text has the Modul Praktikum cover/TOC plus the complete 2.1–2.7 “Requirement Engineering” body. The export itself does not embed a tab-ID marker; the association of the body with Modul 2 is established by the live selected-tab UI plus the tab-specific export request and section contents. I found no content headed Modul 1 or Kelas in the captured text. Figma URLs are references in the document; the linked Figma designs were not opened or verified.
- **Evidence convention:** All line anchors below are 1-based line numbers in `modul-2-live.txt`. “Source fact” means the document says this. “Inference” is explicitly labeled.

## Coverage and contributors

The table of contents puts 2.1–2.7 at lines 57–63; the body starts at line 128 and ends after 2.7. Five author groups appear: GAM (Ghiffary Ahmad Muzakky), DBP (Davina Berlianne Putri; some specs shorten this to “Davina Berlianne”), MARR (Mohammad Alvin R Ramadhan), MIAA (Maulana Ilham Al Amin), and MAW (Muhammad Akmal Wildannov). Cover roster and aliases: lines 23–27.

| Module | Source coverage and author evidence |
|---|---|
| 2.1 Use-case model and scenarios | Five author sections: MAW task management (lines 215–360); DBP inpatient cycle and doctor approval (434–663); MIAA medical records/condition (728–969); MARR admission/billing (1034–1220); GAM rooms/occupancy (1297–1618). The overview UC table is lines 137–172. |
| 2.2 Activity diagrams | Diagrams/flows attributed across DBP, GAM, MAW, MIAA, MARR, from lines 1619–3299; examples include patient intake, assignment, medical record, billing, room, and nursing-task paths. |
| 2.3 Sequence diagrams | Detailed interaction sequences by the same five groups, lines 3300–6702; includes login, patient-cycle approval, rooms/placement, medical records, billing, and nursing-task sequences. |
| 2.4 Class model | Five labeled author sections: DBP line 6707; MAW 7955; GAM 8032; MIAA 9157; MARR 9794. Includes boundary/control/model class attributes and methods. |
| 2.5 Data model | Entity attributes, DB constraints/sample values, and relationships at lines 10586–11493. No author marker in this section; do not attribute it to a particular person. |
| 2.6 Pseudocode | All five groups appear: MIAA starts line 11500; MARR 11783; DBP 12215; GAM 12476; MAW 12959. |
| 2.7 UI sketches/specifications | MARR starts line 13186, MIAA line 13476, MAW line 14856; room UI records individually name GAM as creator (e.g. lines 14593–14610). The section ends at line 15041. |

## Requirements by functional module

### Authentication and role access

- **Source facts:** Perawat/Dokter login validates username/password, issues a session token, then directs to a role dashboard; rejected credentials return an error (UC-01, lines 435–465). Admisi login similarly gates billing; its role is read-only for medical records/equipment and full access to billing (lines 1035–1067, 1138–1143). The overall model says role-based access control (RBAC) (line 454).
- **Actors/permissions:** Dokter, Perawat, Admisi, Koordinator Perawat, and Perawat PIC appear in workflows; Admin appears in overview UC-08 (lines 169–172). Task board/detail access and update/delete rights are explicitly checked and may vary by user (lines 252–360; 13022–13178).
- **Unspecified:** No standalone session/token entity or password/credential lifecycle requirements appear in the data model; detailed permission matrices are not supplied.

### Inpatient cycle and doctor approvals

- **Source facts:** Perawat creates a RekapPasien for an already registered patient, initially `pending`; can list/filter by patient name, room, and status; update cycle status; and remove erroneous/duplicate recap (UC-02–05, lines 468–597). Doctor monitors assigned patients (UC-06, lines 600–628). Perawat may request `pelepasan` or `extend`; Dokter approves/rejects a record waiting for approval, and rejection restores prior status and notifies the nurse (UC-07, lines 631–661).
- **Status flow evidence:** One overview says `pending → assigned → in care → extend` (lines 416–419, 551). Sequence inputs list `pending, assigned, in care, pelepasan, extend` (lines 4713–4740); a class attribute additionally includes `menunggu acc` (line 7782). Pseudocode’s transition map only permits pending→assigned, assigned→in care, and in care→extend/pelepasan (lines 12330–12345 and duplicated at 12365–12380).
- **Entity:** RekapPasien stores patient, room, optional doctor/nurse, date, status, previous/proposed status, and deleted_at (lines 10845–10904). Notifikasi stores recipient, optional rekap, message, and time (10905–10934).

### Medical records and nursing observations

- **Source facts:** Doctor and nurse can view records; doctor creates, updates, and deletes; nurse updates patient condition through symptoms, vital signs, and nursing notes (overview lines 141–152; MIAA use cases lines 664–727 and 729–969). Record viewing is role-scoped and non-mutating; update/create paths validate input (lines 746–768, 792–869, 919–969).
- **Entities/fields:** RekamMedis: patient, doctor, date, diagnosis, action, medical note, deleted_at (11067–11114). KondisiPasien: record, optional nurse, exam timestamp, symptoms, nursing note (11115–11150). TandaVital: condition, temperature, blood pressure, pulse, respiratory rate, oxygen saturation, with nonnegative/range constraints for numeric values where supplied (11151–11192).

### Rooms, equipment, occupancy calendar, and placement

- **Source facts:** Perawat manages rooms, reads list/detail, updates/removes a room, sees occupancy calendar, places pending patients in available rooms for a date range, and cancels a placement (UC-08–16, lines 1221–1285; detailed scenarios lines 1298–1614). Room total cost is automatically calculated as the sum of quantity × unit cost across bedside/patient equipment, medical equipment, and facilities (UC-13, lines 1475–1505).
- **Placement rules:** Room and patient must be available/pending; selected start/end dates are required; end cannot precede start; the interval must not conflict with another room booking. Successful assignment creates patient–room relation, marks room occupied, and displays it on the calendar; cancellation removes the relation and sets room and patient to pending (UC-15/16, lines 1541–1614). Calendar has week/month navigation, inclusive-date note, filters, occupancy blocks, and Available/Occupied/Pending legend (UI lines 14593–14644).
- **Entities/fields:** RuangInap has room ID/name/type, PIC, creation date, status, and total cost (10731–10772). ItemRuangan has room FK, category, name, positive quantity, nonnegative unit cost (10773–10808). PenempatanPasien has patient/room FKs, admission/discharge dates, and status; discharge date must be ≥ admission date (10809–10844). Room-to-item and room/patient-to-placement relations are specified at lines 11354–11383.

### Admission, billing, BPJS, payments, and claims

- **Source facts:** Admisi logs in, creates bills using patient/BPJS, equipment and services, views patient records/equipment/bills, edits service/payment/claim-verification data, and removes bills with confirmation and a log (UC-ADM-01–05, lines 970–1031, 1035–1220). Medical records and room equipment are read-only to Admisi (lines 1065, 1138–1143).
- **Entities/fields:** Tagihan has patient, optional placement, admission user, BPJS status snapshot, nonnegative total, payment status, claim verification result, date, deleted_at (11193–11252). DetailTagihan has bill, optional room item, kind, description, positive quantity, nonnegative unit price (11253–11294). RiwayatTagihan has bill, admission user, add/update/delete action, before/after values, and timestamp (11295–11335). Links/cardinalities are at lines 11459–11493.
- **Gap:** The workflows mention payments and insurance claims, but this schema models them only as fields on Tagihan; there are no separate payment/claim entities in the data section.

### Nursing tasks

- **Source facts:** Koordinator Perawat creates and delegates tasks to one active Perawat PIC; board/detail supports access-scoped search/filter on patient, room, PIC, status, priority, and dates. Authorized users can edit/reassign; delete requires authorization, confirmation, and a reason, is logical, and retains audit history (UC-01/UC-KPR-TM-02–04, lines 216–360). New task status is `Belum Dikerjakan`; board columns are Belum Dikerjakan, Sedang Dikerjakan, Selesai, Dibatalkan (lines 242, 274–278).
- **Validation/concurrency/audit:** Required task fields and end ≥ start; patient must be placed in selected room for the whole task interval; PIC must be active. Cancel requires a reason. Version compare prevents overwriting a newer edit; stale versions require reload. Reassignment removes task from old PIC’s active list and places it under new PIC. Update/delete plus audit are transactional; failure rolls back and must not leave partial data (lines 232–250, 299–360, 12959–13178).
- **Entities/fields:** TugasPerawatan stores title/description, patient, room, PIC, priority, start/end, note, status, creator, positive version, deleted_at (10935–11018). RiwayatTugas stores task, actor, action, timestamp, before/after JSON, and optional reason (11019–11065).

## Data model inventory

The explicit entity tables are: Pengguna, Dokter, Perawat, Pasien, RuangInap, ItemRuangan, PenempatanPasien, RekapPasien, Notifikasi, TugasPerawatan, RiwayatTugas, RekamMedis, KondisiPasien, TandaVital, Tagihan, DetailTagihan, RiwayatTagihan (lines 10599–11335).

- **Pengguna:** id, username (unique), password_hash, name, role constrained to DOKTER/PERAWAT/ADMISI (10605–10634).
- **Dokter:** id, optional unique user link, name, specialization (10635–10658). **Perawat:** id, optional unique user link, name, unit, active flag (10659–10688).
- **Pasien:** id, name, birth date, sex, address, status (default aktif), BPJS flag (10689–10730).
- Room, item, placement, recap, notification, task, medical record, condition/vitals, billing, billing detail, and audit fields are enumerated above with their source ranges.
- Relationship/cardinality/optionality definitions occupy lines 11338–11493. Most parent-to-child links are 1 to 0..N; optionality is specified on doctor/nurse assignment, placement-to-bill, and item-to-bill-detail.

## Recovered identifier inventory

No explicit `UR-*`, `SRS-*`, or `NFR-*` identifiers were found in this tab. That means no such IDs were recoverable from the source text; it does not imply none exist elsewhere.

- **UC:** `UC-01`–`UC-16` (including skipped/overloaded meanings), `UC-ADM-01`–`UC-ADM-05`, `UC-DR-01`–`UC-DR-04`, `UC-PR-01`–`UC-PR-02`, `UC-KPR-TM-01`–`UC-KPR-TM-04`. Explicit recovered IDs include `UC-DR-01 dan UC-PR-01` as a combined spec (line 729).
- **AD:** `AD-02`–`AD-22`, `AD-ADM-02`–`AD-ADM-05`, `AD-KPR-TM-01`–`AD-KPR-TM-04`.
- **SD:** `SD-01`–`SD-16`, `SD-8`, `SD-ADM-02`–`SD-ADM-05`, `SD-DR-01`–`SD-DR-04`, `SD-PR-01`–`SD-PR-02`, `SD-KPR-TM-01`–`SD-KPR-TM-04`.
- **UI:** `UI-ADM-01`–`UI-ADM-05`, `UI-DR-01`–`UI-DR-05`, `UI-GAM-02`–`UI-GAM-10`, `UI-PR-01`–`UI-PR-03`, `UI-KPR-TM-01`–`UI-KPR-TM-04`; the generic label `UI-ID` also occurs.
- **PC:** `PC-01`, `PC-ADM-01`–`PC-ADM-12`, `PC-DR-01`–`PC-DR-06`, `PC-PR-01`–`PC-PR-05`, `PC-PR-10`–`PC-PR-21`, `PC-KPR-TM-01`–`PC-KPR-TM-05`.

These are literal IDs recoverable by scanning the captured tab, not a claim that every family is contiguous or uniquely assigned. Examples of gaps/collisions are noted below.

## Contradictions, ambiguities, and missing decisions

1. **Global UC uniqueness is broken.** The overview labels doctor record management UC-01 and nurse condition management UC-03 (lines 141–152); DBP uses UC-01 for login (435–465); MAW uses UC-01 for creating/delegating tasks (216–250). Other author sections reuse bare UC-01/02 for unrelated flows. Namespaced IDs partly help but are not consistently applied.
2. **Approval flow and allowed transition disagree.** The narrative requires doctor approval for `pelepasan`/`extend`, temporary `menunggu acc`, and rollback/notification when rejected (lines 631–661). Pseudocode directly allows `in care → extend/pelepasan` and writes the status without an approval step (12330–12345). The overview omits `pelepasan` from its status sequence (416–419); class/schema stores `status`, `status_sebelumnya`, `status_diajukan` but has no explicit approval actor/time/decision field (10881–10898).
3. **Status vocabulary conflicts.** Room scenarios mix `tersedia` (data default, 10762–10766), `available` (placement precondition, 1561–1566), `occupied`, and `pending` (cancellation, 1610–1614; calendar UI 14621–14644). Task scenario uses human labels `Belum Dikerjakan`/`Sedang Dikerjakan`/`Selesai`/`Dibatalkan` (274), but table default is `baru` (10996–11000). Inpatient and room use of `pending` also differs by entity.
4. **Actor/role naming is inconsistent.** Overview calls billing actor Admin (169–172), detailed workflows use Admisi (970–989). Task role Koordinator Perawat is used in permissions, while Pengguna.peran allows only DOKTER/PERAWAT/ADMISI (10630–10633); no mapping from coordinator role to a stored permission is given.
5. **Room assignment versus recap relationship is unclear.** Placement has its own patient-room/date link, while RekapPasien also requires a room FK (10809–10861); cancellation removes placement and says patient/room return to pending, but does not define what happens to recap’s room FK/status or an existing invoice link.
6. **Billing domain is incomplete at entity level.** User stories require payment and BPJS claim handling, but no Payment or Claim entity, amount/date/reference/claim lifecycle fields are described (11193–11335).
7. **Delete semantics vary.** RekapPasien has `deleted_at` in schema (10899–10904), but UC-05 says physically delete from database (589–597). Medical records likewise have deleted_at (11109–11114), while doctor delete says delete; room removal also says delete related patient relations (lines 1439–1472). Retention/cascade policy is unstated.
8. **Identifier coverage has gaps and drift.** `SD-8` and `SD-08` both occur; `UC-DR-01` and `UC-PR-01` share a combined specification; UC identifiers collide; AD has no recovered AD-01; UI has a generic `UI-ID`; pseudocode IDs have gaps such as PC-PR-06–09 (identifier scans listed above). These may be omissions or intentional legacy labels; the source does not resolve them.
9. **Nonfunctional requirements are absent.** No explicit SRS/NFR IDs or measurable security, availability, performance, privacy, backup, accessibility, or retention targets were recovered from this tab.
10. **Other underspecified rules:** complete permission matrix; exact task status transition table; inclusive/exclusive collision boundaries in the validator (calendar note says inclusive, lines 14641–14642); billing total recalculation and adjustment rules; what “remove patient recap” does to records/placement/billing; authentication session expiry and credential security.

## Validation performed

- Opened the exact canonical URL in a new owned tab; confirmed visible document title and selected Modul 2 tab.
- Downloaded the tab-specific plain-text export; verified the saved capture has 15,041 lines and SHA-256 above.
- Confirmed the text includes each of sections 2.1–2.7 and author markers/creator metadata spanning GAM, DBP, MARR, MIAA, and MAW.
- Searched captured text for `UR-*`, `SRS-*`, and `NFR-*`; none found. Extracted the literal UC/AD/SD/UI/PC identifier families listed above.
- No source edits, comments, sharing, or implementation were performed. Historical local text was not used as current evidence; findings above come from the fresh export.

