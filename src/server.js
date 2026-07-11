require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const QRCode = require('qrcode');

const { pool, initDb, genRegCode } = require('./db');
const { issueToken, checkPassword, requireAdmin, COOKIE_NAME, verifyRsvp } = require('./auth');
const { isConfigured, sendRsvpEmail } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;

// อยู่หลัง proxy ของ Railway — ให้ req.protocol อ่านค่า https จาก x-forwarded-proto ได้ถูกต้อง
app.set('trust proxy', true);

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

    // สุ่ม reg_code ให้ไม่ซ้ำ (retry สูงสุด 5 ครั้ง) — email/phone กันซ้ำด้วย pre-check ข้างบนแล้ว
    // ดังนั้น 23505 ที่หลุดมาถึงตรงนี้ถือเป็น reg_code ชน → สุ่มใหม่
    let row;
    for (let i = 0; i < 5; i++) {
      const reg_code = genRegCode();
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
        if (err.code === '23505') {
          const c = err.constraint || '';
          // เผื่อกรณี race: มีคนแทรกอีเมล/เบอร์เดียวกันระหว่าง pre-check กับ insert
          if (c.includes('email')) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้ลงทะเบียนไปแล้ว' });
          if (c.includes('phone')) return res.status(409).json({ error: 'เบอร์โทรนี้ถูกใช้ลงทะเบียนไปแล้ว' });
          continue; // reg_code ชน → สุ่มใหม่
        }
        throw err;
      }
    }

    if (!row) {
      return res.status(500).json({ error: 'ไม่สามารถสร้างรหัสลงทะเบียนได้ กรุณาลองใหม่' });
    }

    // สร้าง QR code (encode reg_code) เป็น data URL ให้ผู้ใช้บันทึกไว้เช็คอินหน้างาน
    const qrDataUrl = await QRCode.toDataURL(row.reg_code, { width: 320, margin: 2 });

    return res.json({
      ok: true,
      reg_code: row.reg_code,
      full_name: row.full_name,
      qr: qrDataUrl,
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

// ---------- API: ล้างข้อมูลทั้งหมด (admin) — ลบผู้ลงทะเบียน + แบบประเมิน ----------
app.post('/api/admin/reset', requireAdmin, async (req, res) => {
  try {
    const r1 = await pool.query('SELECT COUNT(*)::int AS c FROM registrants');
    const r2 = await pool.query('SELECT COUNT(*)::int AS c FROM feedback');
    await pool.query('DELETE FROM registrants');
    await pool.query('DELETE FROM feedback');
    console.log(`[reset] ลบผู้ลงทะเบียน ${r1.rows[0].c} + แบบประเมิน ${r2.rows[0].c}`);
    return res.json({ ok: true, registrants: r1.rows[0].c, feedback: r2.rows[0].c });
  } catch (err) {
    console.error('[reset] error', err);
    return res.status(500).json({ error: 'ล้างข้อมูลไม่สำเร็จ' });
  }
});

// ---------- API: ส่งอีเมลถามการมา RSVP ให้ทุกคนที่ยังไม่ตอบ (admin) ----------
app.post('/api/admin/send-rsvp', requireAdmin, async (req, res) => {
  if (!isConfigured()) {
    return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่าอีเมล — ตั้ง BREVO_API_KEY และ BREVO_SENDER ก่อน (ดูวิธีใน README)' });
  }
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const { rows } = await pool.query(
      `SELECT reg_code, full_name, email FROM registrants WHERE rsvp_status IS NULL ORDER BY created_at`
    );
    // คนที่ตอบแล้ว (ถูกข้าม ไม่ส่งซ้ำ)
    const skip = await pool.query('SELECT COUNT(*)::int AS c FROM registrants WHERE rsvp_status IS NOT NULL');
    let sent = 0;
    let failed = 0;
    let lastError = null;
    for (const reg of rows) {
      try {
        await sendRsvpEmail(reg, baseUrl);
        sent++;
      } catch (e) {
        failed++;
        lastError = e.message;
        console.error(`[send-rsvp] ส่งถึง ${reg.email} ไม่สำเร็จ:`, e.message);
      }
    }
    return res.json({ ok: true, sent, failed, skipped: skip.rows[0].c, error: lastError });
  } catch (err) {
    console.error('[send-rsvp] error', err);
    return res.status(500).json({ error: 'ส่งอีเมลไม่สำเร็จ' });
  }
});

// ---------- API: ส่งอีเมล RSVP ซ้ำรายคน (admin) ----------
app.post('/api/admin/send-rsvp/:id', requireAdmin, async (req, res) => {
  if (!isConfigured()) {
    return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่าอีเมล — ตั้ง BREVO_API_KEY และ BREVO_SENDER ก่อน (ดูวิธีใน README)' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT reg_code, full_name, email FROM registrants WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ลงทะเบียน' });
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await sendRsvpEmail(rows[0], baseUrl);
    return res.json({ ok: true, email: rows[0].email });
  } catch (err) {
    console.error('[send-rsvp/:id] error', err);
    return res.status(500).json({ error: 'ส่งอีเมลไม่สำเร็จ: ' + err.message });
  }
});

// ---------- API: รายชื่อ (admin) ----------
app.get('/api/registrants', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, reg_code, full_name, email, phone, organization, job_title,
              session_choice, heard_from, dietary, special_needs,
              status, created_at, checked_in_at, rsvp_status, rsvp_at
       FROM registrants
       ORDER BY created_at DESC`
    );
    const checkedIn = rows.filter((r) => r.status === 'checked_in').length;
    const rsvpYes = rows.filter((r) => r.rsvp_status === 'yes').length;
    return res.json({ ok: true, total: rows.length, checkedIn, rsvpYes, registrants: rows });
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
              session_choice, heard_from, dietary, special_needs,
              status, created_at, checked_in_at, rsvp_status, rsvp_at
       FROM registrants
       ORDER BY created_at DESC`
    );
    const headers = [
      'reg_code', 'full_name', 'email', 'phone', 'organization', 'job_title',
      'session_choice', 'heard_from', 'dietary', 'special_needs',
      'status', 'created_at', 'checked_in_at', 'rsvp_status', 'rsvp_at',
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

// ---------- API: เช็คอิน (admin) — สแกน QR หรือกรอกรหัสหน้างาน ----------
app.post('/api/checkin', requireAdmin, async (req, res) => {
  try {
    const reg_code = (req.body && req.body.reg_code ? String(req.body.reg_code) : '').trim().toUpperCase();
    if (!reg_code) {
      return res.status(400).json({ error: 'ไม่พบรหัสลงทะเบียน' });
    }

    const { rows } = await pool.query(
      'SELECT id, full_name, status, checked_in_at FROM registrants WHERE reg_code = $1',
      [reg_code]
    );
    if (rows.length === 0) {
      return res.status(404).json({ status: 'not_found', error: 'ไม่พบผู้ลงทะเบียนรหัสนี้' });
    }

    const person = rows[0];
    if (person.status === 'checked_in') {
      return res.json({
        status: 'already',
        full_name: person.full_name,
        checked_in_at: person.checked_in_at,
      });
    }

    const upd = await pool.query(
      `UPDATE registrants
       SET status = 'checked_in', checked_in_at = now()
       WHERE id = $1
       RETURNING full_name, checked_in_at`,
      [person.id]
    );
    return res.json({
      status: 'success',
      full_name: upd.rows[0].full_name,
      checked_in_at: upd.rows[0].checked_in_at,
    });
  } catch (err) {
    console.error('[checkin] error', err);
    return res.status(500).json({ error: 'เช็คอินไม่สำเร็จ' });
  }
});

// ---------- API: ตอบรับการมา (RSVP) — public ----------
// ใช้ POST (ไม่ใช่ GET) เพื่อไม่ให้ตัวสแกน/พรีวิวลิงก์ในอีเมลกดตอบอัตโนมัติ
// ผู้รับกดลิงก์ในอีเมล → เปิดหน้า /rsvp.html → กดปุ่มยืนยัน → หน้าเว็บค่อยยิง POST นี้
app.post('/api/rsvp', async (req, res) => {
  try {
    const b = req.body || {};
    const code = (b.code || '').toString().trim().toUpperCase();
    const sig = (b.sig || '').toString().trim();
    const a = (b.a || '').toString().trim();
    if (!verifyRsvp(code, sig) || (a !== 'yes' && a !== 'no')) {
      return res.status(400).json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุ' });
    }
    const upd = await pool.query(
      `UPDATE registrants SET rsvp_status = $1, rsvp_at = now() WHERE reg_code = $2`,
      [a, code]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'ไม่พบข้อมูลการลงทะเบียน' });
    return res.json({ ok: true, a });
  } catch (err) {
    console.error('[rsvp] error', err);
    return res.status(500).json({ error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' });
  }
});

// ---------- helper: แปลงคะแนนดาวให้เป็น 1-5 หรือ null ----------
function parseRating(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

// ---------- API: ส่งแบบประเมินความพึงพอใจ (public, anonymous) ----------
app.post('/api/feedback', async (req, res) => {
  try {
    const b = req.body || {};
    const overall = parseRating(b.overall_rating);
    if (overall === null) {
      return res.status(400).json({ error: 'กรุณาให้คะแนนความพึงพอใจโดยรวม (1-5 ดาว)' });
    }
    const speaker1 = parseRating(b.speaker1_rating);
    const speaker2 = parseRating(b.speaker2_rating);
    let recommend = null;
    if (b.recommend === true || b.recommend === 'true' || b.recommend === 'yes') recommend = true;
    else if (b.recommend === false || b.recommend === 'false' || b.recommend === 'no') recommend = false;
    const comment = (b.comment || '').toString().trim() || null;

    await pool.query(
      `INSERT INTO feedback (overall_rating, speaker1_rating, speaker2_rating, recommend, comment)
       VALUES ($1,$2,$3,$4,$5)`,
      [overall, speaker1, speaker2, recommend, comment]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[feedback] error', err);
    return res.status(500).json({ error: 'ส่งแบบประเมินไม่สำเร็จ กรุณาลองใหม่' });
  }
});

// ---------- API: สรุปผลประเมิน (admin) ----------
app.get('/api/feedback/summary', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT overall_rating, speaker1_rating, speaker2_rating, recommend, comment, created_at
       FROM feedback
       ORDER BY created_at DESC`
    );
    const avg = (key) => {
      const nums = rows.map((r) => r[key]).filter((v) => typeof v === 'number');
      if (nums.length === 0) return null;
      return Math.round((nums.reduce((a, c) => a + c, 0) / nums.length) * 10) / 10;
    };
    const recommendYes = rows.filter((r) => r.recommend === true).length;
    const recommendNo = rows.filter((r) => r.recommend === false).length;
    return res.json({
      ok: true,
      count: rows.length,
      avgOverall: avg('overall_rating'),
      avgSpeaker1: avg('speaker1_rating'),
      avgSpeaker2: avg('speaker2_rating'),
      recommendYes,
      recommendNo,
      items: rows,
    });
  } catch (err) {
    console.error('[feedback/summary] error', err);
    return res.status(500).json({ error: 'ดึงผลประเมินไม่สำเร็จ' });
  }
});

// ---------- API: export ผลประเมิน CSV (admin) ----------
app.get('/api/feedback/export', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT overall_rating, speaker1_rating, speaker2_rating, recommend, comment, created_at
       FROM feedback
       ORDER BY created_at DESC`
    );
    const headers = ['overall_rating', 'speaker1_rating', 'speaker2_rating', 'recommend', 'comment', 'created_at'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map((h) => csvEscape(r[h])).join(','));
    }
    const csv = '﻿' + lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="feedback.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('[feedback/export] error', err);
    return res.status(500).json({ error: 'export ไม่สำเร็จ' });
  }
});

// ---------- API: QR ชี้ไปหน้าแบบสอบถาม (admin) — เอาไว้ฉาย/พิมพ์หน้างานตอนจบ ----------
app.get('/api/feedback-qr', requireAdmin, async (req, res) => {
  try {
    const url = `${req.protocol}://${req.get('host')}/feedback.html`;
    const qr = await QRCode.toDataURL(url, { width: 480, margin: 2 });
    return res.json({ ok: true, url, qr });
  } catch (err) {
    console.error('[feedback-qr] error', err);
    return res.status(500).json({ error: 'สร้าง QR ไม่สำเร็จ' });
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
