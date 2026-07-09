const { Pool } = require('pg');

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
