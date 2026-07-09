const { Pool } = require('pg');

// Railway ตั้งค่า DATABASE_URL ให้อัตโนมัติเมื่อเพิ่ม PostgreSQL plugin
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[db] ไม่พบ DATABASE_URL — ตั้งค่าใน .env หรือ Railway ก่อนใช้งาน');
}

// Railway/Cloud Postgres ส่วนใหญ่ต้องใช้ SSL แต่ Postgres local ไม่ต้อง
const useSSL = /railway|render|heroku|amazonaws|supabase/i.test(connectionString || '')
  || process.env.PGSSL === 'true';

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

// สร้างตารางอัตโนมัติตอน start (idempotent)
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registrants (
      id             SERIAL PRIMARY KEY,
      reg_code       TEXT UNIQUE NOT NULL,
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
      checked_in_at  TIMESTAMPTZ
    );
  `);
  console.log('[db] ตาราง registrants พร้อมใช้งาน');
}

module.exports = { pool, initDb };
