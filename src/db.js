const crypto = require('crypto');
const { Pool } = require('pg');

// สุ่มรหัสลงทะเบียนสั้นๆ อ่านง่าย เช่น "A1B2C3D4" (ใช้ทำ QR + เช็คอิน)
function genRegCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Railway ตั้งค่า DATABASE_URL ให้อัตโนมัติเมื่อเพิ่ม PostgreSQL plugin
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[db] ไม่พบ DATABASE_URL — ตั้งค่าใน .env หรือ Railway ก่อนใช้งาน');
}

// log host ที่จะต่อ (ซ่อนรหัสผ่าน) เพื่อยืนยันว่าต่อถูกที่ — ควรเป็น postgres.railway.internal ไม่ใช่ localhost
function describeHost(cs) {
  try {
    const u = new URL(cs);
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(อ่าน DATABASE_URL ไม่ได้)';
  }
}
if (connectionString) {
  console.log('[db] จะเชื่อมต่อไปที่:', describeHost(connectionString));
}

// การเชื่อมต่อภายในของ Railway (postgres.railway.internal) ไม่ใช้ SSL
// เปิด SSL เฉพาะเมื่อสั่งชัดเจน: PGSSL=true หรือใน connection string มี sslmode=require
// (เช่น เวลาต่อผ่าน public proxy หรือ managed DB เจ้าอื่น)
const useSSL = process.env.PGSSL === 'true'
  || /sslmode=require/i.test(connectionString || '');

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

// สร้างตารางอัตโนมัติตอน start (idempotent)
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registrants (
      id             SERIAL PRIMARY KEY,
      reg_code       TEXT,
      full_name      TEXT NOT NULL,
      email          TEXT NOT NULL,
      phone          TEXT NOT NULL,
      organization   TEXT,
      job_title      TEXT,
      session_choice TEXT,
      heard_from     TEXT,
      dietary        TEXT,
      special_needs  TEXT,
      pdpa_consent   BOOLEAN NOT NULL DEFAULT FALSE,
      status         TEXT NOT NULL DEFAULT 'registered',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      checked_in_at  TIMESTAMPTZ,
      rsvp_status    TEXT,
      rsvp_at        TIMESTAMPTZ
    );
  `);

  // migration: เพิ่มคอลัมน์เช็คอินกลับเข้าไป (สำหรับตารางเดิมบน Railway ที่เคยลบออก)
  // no-op กับตารางที่มีคอลัมน์อยู่แล้ว
  const addColumns = [
    `ALTER TABLE registrants ADD COLUMN IF NOT EXISTS reg_code TEXT;`,
    `ALTER TABLE registrants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'registered';`,
    `ALTER TABLE registrants ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;`,
    `ALTER TABLE registrants ADD COLUMN IF NOT EXISTS rsvp_status TEXT;`,
    `ALTER TABLE registrants ADD COLUMN IF NOT EXISTS rsvp_at TIMESTAMPTZ;`,
  ];
  for (const sql of addColumns) {
    try {
      await pool.query(sql);
    } catch (e) {
      console.warn('[db] ข้ามการเพิ่มคอลัมน์:', e.message);
    }
  }

  // backfill reg_code ให้แถวเดิมที่ยังไม่มี (ทำใน JS เพื่อให้ทำงานได้ทั้ง pg-mem และ Postgres จริง)
  try {
    const { rows } = await pool.query('SELECT id FROM registrants WHERE reg_code IS NULL');
    for (const r of rows) {
      await pool.query('UPDATE registrants SET reg_code = $1 WHERE id = $2', [genRegCode(), r.id]);
    }
    if (rows.length > 0) console.log(`[db] backfill reg_code ให้ ${rows.length} แถว`);
  } catch (e) {
    console.warn('[db] ข้าม backfill reg_code:', e.message);
  }

  // ทำอีเมลเดิมให้เป็นตัวพิมพ์เล็ก แล้วลบแถวซ้ำ (เก็บ id น้อยสุด) ก่อนสร้าง unique index
  // จำเป็นเพราะถ้ามีข้อมูลซ้ำอยู่ การสร้าง unique index จะล้มเหลว
  const migrations = [
    `UPDATE registrants SET email = lower(email) WHERE email <> lower(email);`,
    `DELETE FROM registrants WHERE id NOT IN (SELECT MIN(id) FROM registrants GROUP BY email);`,
    `DELETE FROM registrants WHERE id NOT IN (SELECT MIN(id) FROM registrants GROUP BY phone);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS registrants_email_uidx ON registrants (email);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS registrants_phone_uidx ON registrants (phone);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS registrants_regcode_uidx ON registrants (reg_code);`,
  ];
  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (e) {
      console.warn('[db] ข้าม migration:', e.message);
    }
  }

  // ตารางแบบประเมินความพึงพอใจ (anonymous — ไม่ผูกกับผู้ลงทะเบียน)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id              SERIAL PRIMARY KEY,
      overall_rating  INT NOT NULL,
      speaker1_rating INT,
      speaker2_rating INT,
      recommend       BOOLEAN,
      comment         TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // ตาราง OTP ยืนยันเบอร์โทร (1 แถวต่อเบอร์ — แทนที่เมื่อขอใหม่)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS phone_otp (
      phone        TEXT PRIMARY KEY,
      code_hash    TEXT NOT NULL,
      expires_at   TIMESTAMPTZ NOT NULL,
      attempts     INT NOT NULL DEFAULT 0,
      last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  console.log('[db] ตาราง registrants + feedback + phone_otp พร้อมใช้งาน');
}

module.exports = { pool, initDb, genRegCode };
