require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
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

function genRegCode() {
  // hex สั้นๆ อ่านง่าย เช่น "A1B2C3D4"
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

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
    const email = (b.email || '').trim();
    const phone = (b.phone || '').trim();
    const pdpa_consent = b.pdpa_consent === true || b.pdpa_consent === 'true' || b.pdpa_consent === 'on';

    if (!full_name || !email || !phone) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อ อีเมล และเบอร์โทรให้ครบ' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }
    if (!pdpa_consent) {
      return res.status(400).json({ error: 'กรุณายินยอมนโยบายความเป็นส่วนตัว (PDPA) ก่อนลงทะเบียน' });
    }

    // สุ่ม reg_code ให้ไม่ซ้ำ (retry สูงสุด 5 ครั้ง)
    let reg_code;
    let row;
    for (let i = 0; i < 5; i++) {
      reg_code = genRegCode();
      try {
        const result = await pool.query(
          `INSERT INTO registrants
             (reg_code, full_name, email, phone, organization, job_title,
              session_choice, heard_from, dietary, special_needs, pdpa_consent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id, reg_code, full_name`,
          [
            reg_code, full_name, email, phone,
            (b.organization || '').trim() || null,
            (b.job_title || '').trim() || null,
            (b.session_choice || '').trim() || null,
            (b.heard_from || '').trim() || null,
            (b.dietary || '').trim() || null,
            (b.special_needs || '').trim() || null,
            true,
          ]
        );
        row = result.rows[0];
        break;
      } catch (err) {
        if (err.code === '23505') continue; // unique violation → สุ่มใหม่
        throw err;
      }
    }

    if (!row) {
      return res.status(500).json({ error: 'ไม่สามารถสร้างรหัสลงทะเบียนได้ กรุณาลองใหม่' });
    }

    return res.json({
      ok: true,
      reg_code: row.reg_code,
      full_name: row.full_name,
    });
  } catch (err) {
    console.error('[register] error', err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่' });
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
      `SELECT id, reg_code, full_name, email, phone, organization, job_title,
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
      `SELECT reg_code, full_name, email, phone, organization, job_title,
              session_choice, heard_from, dietary, special_needs, created_at
       FROM registrants
       ORDER BY created_at DESC`
    );
    const headers = [
      'reg_code', 'full_name', 'email', 'phone', 'organization', 'job_title',
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
