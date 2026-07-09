require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { pool, initDb } = require('./db');
const { issueToken, checkPassword, requireAdmin, COOKIE_NAME } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------- helpers ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ---------- API: ลงทะเบียน ----------
app.post('/api/register', async (req, res) => {
  try {
    const b = req.body || {};
    const full_name = (b.full_name || '').trim();
    const email = (b.email || '').trim().toLowerCase();
    // เก็บเฉพาะตัวเลข แล้วบังคับให้เป็น 10 หลักพอดี
    const phone = (b.phone || '').replace(/\D/g, '');
    const pdpa_consent = b.pdpa_consent === true || b.pdpa_consent === 'true' || b.pdpa_consent === 'on';

    if (!full_name || !email || !phone) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อ อีเมล และเบอร์โทรให้ครบ' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'เบอร์โทรต้องเป็นตัวเลข 10 หลักพอดี' });
    }
    if (!pdpa_consent) {
      return res.status(400).json({ error: 'กรุณายินยอมนโยบายความเป็นส่วนตัว (PDPA) ก่อนลงทะเบียน' });
    }

    // ตรวจซ้ำก่อน เพื่อแจ้งได้ชัดว่าซ้ำที่อีเมลหรือเบอร์
    const dup = await pool.query(
      'SELECT email, phone FROM registrants WHERE email = $1 OR phone = $2 LIMIT 1',
      [email, phone]
    );
    if (dup.rows.length > 0) {
      if (dup.rows[0].email === email) {
        return res.status(409).json({ error: 'อีเมลนี้ถูกใช้ลงทะเบียนไปแล้ว' });
      }
      return res.status(409).json({ error: 'เบอร์โทรนี้ถูกใช้ลงทะเบียนไปแล้ว' });
    }

    let result;
    try {
      result = await pool.query(
        `INSERT INTO registrants
           (full_name, email, phone, organization, job_title,
            session_choice, heard_from, dietary, special_needs, pdpa_consent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, full_name`,
        [
          full_name, email, phone,
          (b.organization || '').trim() || null,
          (b.job_title || '').trim() || null,
          (b.session_choice || '').trim() || null,
          (b.heard_from || '').trim() || null,
          (b.dietary || '').trim() || null,
          (b.special_needs || '').trim() || null,
          true,
        ]
      );
    } catch (err) {
      // 23505 = unique violation → แจ้งว่าอีเมลหรือเบอร์ซ้ำ
      if (err.code === '23505') {
        const c = err.constraint || '';
        if (c.includes('email')) {
          return res.status(409).json({ error: 'อีเมลนี้ถูกใช้ลงทะเบียนไปแล้ว' });
        }
        if (c.includes('phone')) {
          return res.status(409).json({ error: 'เบอร์โทรนี้ถูกใช้ลงทะเบียนไปแล้ว' });
        }
        return res.status(409).json({ error: 'ข้อมูลนี้ถูกใช้ลงทะเบียนไปแล้ว' });
      }
      throw err;
    }

    return res.json({
      ok: true,
      full_name: result.rows[0].full_name,
    });
  } catch (err) {
    console.error('[register] error', err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่' });
  }
});

// ---------- API: เช็คอีเมล/เบอร์ซ้ำ (ใช้ตอนกรอกฟอร์ม เรียลไทม์) ----------
app.get('/api/check', async (req, res) => {
  try {
    const email = (req.query.email || '').trim().toLowerCase();
    const phone = (req.query.phone || '').replace(/\D/g, '');
    const out = { emailTaken: false, phoneTaken: false };
    if (email) {
      const r = await pool.query('SELECT 1 FROM registrants WHERE email = $1 LIMIT 1', [email]);
      out.emailTaken = r.rows.length > 0;
    }
    if (phone) {
      const r = await pool.query('SELECT 1 FROM registrants WHERE phone = $1 LIMIT 1', [phone]);
      out.phoneTaken = r.rows.length > 0;
    }
    return res.json(out);
  } catch (err) {
    console.error('[check] error', err);
    return res.status(500).json({ error: 'ตรวจสอบไม่สำเร็จ' });
  }
});

// ---------- API: Admin login / logout ----------
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!checkPassword(password)) {
    return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  }
  const token = issueToken();
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8,
  });
  return res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  return res.json({ ok: true });
});

// ---------- API: รายชื่อ (admin) ----------
app.get('/api/registrants', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name, email, phone, organization, job_title,
              session_choice, heard_from, dietary, special_needs, created_at
       FROM registrants
       ORDER BY created_at DESC`
    );
    return res.json({ ok: true, total: rows.length, registrants: rows });
  } catch (err) {
    console.error('[registrants] error', err);
    return res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ' });
  }
});

// ---------- API: export CSV (admin) ----------
app.get('/api/export', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT full_name, email, phone, organization, job_title,
              session_choice, heard_from, dietary, special_needs, created_at
       FROM registrants
       ORDER BY created_at DESC`
    );
    const headers = [
      'full_name', 'email', 'phone', 'organization', 'job_title',
      'session_choice', 'heard_from', 'dietary', 'special_needs', 'created_at',
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map((h) => csvEscape(r[h])).join(','));
    }
    // BOM เพื่อให้ Excel เปิดภาษาไทยได้ถูกต้อง
    const csv = '﻿' + lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="registrants.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('[export] error', err);
    return res.status(500).json({ error: 'export ไม่สำเร็จ' });
  }
});

// ---------- static frontend ----------
app.use(express.static(path.join(__dirname, '..', 'public')));

// health check สำหรับ Railway
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- start ----------
// เปิด HTTP server ก่อน เพื่อให้ healthcheck (/healthz) ผ่านทันที
// แล้วค่อยต่อ DB + สร้างตารางแบบ retry เบื้องหลัง — ไม่ crash วนซ้ำถ้า DB ยังไม่พร้อม
app.listen(PORT, () => console.log(`[server] ทำงานที่ port ${PORT}`));

async function initWithRetry(attempt = 1) {
  try {
    await initDb();
    console.log('[db] เชื่อมต่อฐานข้อมูลสำเร็จ');
  } catch (err) {
    const wait = Math.min(30000, attempt * 3000);
    console.error(
      `[db] ต่อฐานข้อมูล/สร้างตารางไม่สำเร็จ (ครั้งที่ ${attempt}) — ลองใหม่ใน ${wait / 1000}s:`,
      err.message
    );
    console.error('[db] ตรวจว่าได้เพิ่ม PostgreSQL และตั้งค่า DATABASE_URL แล้วหรือยัง');
    setTimeout(() => initWithRetry(attempt + 1), wait);
  }
}
initWithRetry();
