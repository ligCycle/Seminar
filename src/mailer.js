const dns = require('dns');
const nodemailer = require('nodemailer');
const { rsvpSig } = require('./auth');

// Railway มักต่อ IPv6 แล้วค้าง (connection timeout) — บังคับให้ resolve เป็น IPv4 ก่อน
try { dns.setDefaultResultOrder('ipv4first'); } catch { /* Node เก่าไม่มีเมธอดนี้ */ }

// ---------- ค่าตั้งจาก env ----------
// Brevo (แนะนำ — ส่งผ่าน HTTPS ทำงานได้บน Railway): BREVO_API_KEY + BREVO_SENDER (อีเมลผู้ส่งที่ยืนยันใน Brevo)
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
// Gmail SMTP (สำรอง — มักถูกบล็อกบน Railway): GMAIL_USER + GMAIL_APP_PASSWORD
const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
// อีเมลผู้ส่ง (ใช้ BREVO_SENDER ก่อน ไม่งั้น fallback เป็น GMAIL_USER)
const SENDER_EMAIL = process.env.BREVO_SENDER || GMAIL_USER || '';
const SENDER_NAME = 'งานสัมมนา Siam University';
const DRYRUN = process.env.MAIL_DRYRUN === 'true';

// ตั้งค่าอีเมลครบหรือยัง (dry-run ถือว่าพร้อมเพื่อใช้ทดสอบ)
function isConfigured() {
  if (DRYRUN) return true;
  if (BREVO_API_KEY && SENDER_EMAIL) return true;
  if (GMAIL_USER && GMAIL_APP_PASSWORD) return true;
  return false;
}

let transporter = null;
function getTransporter() {
  if (DRYRUN) return null;
  if (!transporter) {
    // ใช้พอร์ต 587 (STARTTLS) เพราะ Railway มักบล็อกพอร์ต 465 (ที่ service:'gmail' ใช้)
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      family: 4, // บังคับ IPv4
      // App Password มักถูกคัดลอกมาพร้อมเว้นวรรค — ตัดออกให้กันพลาด
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.replace(/\s+/g, '') },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildHtml(reg, baseUrl) {
  const sig = rsvpSig(reg.reg_code);
  const yesUrl = `${baseUrl}/api/rsvp?code=${encodeURIComponent(reg.reg_code)}&sig=${sig}&a=yes`;
  const noUrl = `${baseUrl}/api/rsvp?code=${encodeURIComponent(reg.reg_code)}&sig=${sig}&a=no`;
  const name = esc(reg.full_name);
  return `
  <div style="background:#0a0908;color:#f5f0e6;font-family:'Segoe UI',Tahoma,sans-serif;padding:28px;border-radius:14px;max-width:520px;margin:0 auto">
    <h2 style="color:#e6b325;margin:0 0 8px">Think With Data, Decide With AI</h2>
    <p style="margin:0 0 18px;color:#a79e8b">งานสัมมนา · Siam University</p>
    <p>สวัสดีคุณ <b>${name}</b></p>
    <p>คุณได้ลงทะเบียนงานสัมมนาไว้ ทางผู้จัดขอสอบถามว่าคุณจะเข้าร่วมงานหรือไม่ เพื่อเตรียมที่นั่งและของว่างให้พอดีครับ</p>
    <div style="background:#17130c;border:1px solid #3a3222;border-radius:10px;padding:16px;margin:18px 0">
      <p style="margin:0 0 4px">📅 <b>พฤหัสบดี 9 ก.ค. 2569</b> · 13:00–16:00 น.</p>
      <p style="margin:0">📍 Hall of Frame ชั้น 1 อาคาร 19</p>
    </div>
    <p style="margin:0 0 14px">กรุณากดเลือกคำตอบ:</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px">
        <a href="${yesUrl}" style="display:inline-block;background:#e6b325;color:#1a1205;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px">✅ ยืนยันว่าจะมา</a>
      </td>
      <td>
        <a href="${noUrl}" style="display:inline-block;background:#201a10;color:#f5f0e6;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;border:1px solid #3a3222">❌ ไม่สะดวกมา</a>
      </td>
    </tr></table>
    <p style="color:#6b6350;font-size:12px;margin:22px 0 0">หากปุ่มกดไม่ได้ คัดลอกลิงก์นี้เพื่อยืนยันว่าจะมา:<br>${yesUrl}</p>
  </div>`;
}

// ส่งผ่าน Brevo HTTP API (พอร์ต 443/HTTPS — ไม่โดน Railway บล็อก)
async function sendViaBrevo(reg, subject, html) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: reg.email, name: reg.full_name || undefined }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.message || j.code || JSON.stringify(j);
    } catch { /* body ไม่ใช่ JSON */ }
    throw new Error('Brevo: ' + msg);
  }
  return true;
}

// ส่งอีเมล RSVP หนึ่งฉบับ — คืน true ถ้าสำเร็จ, throw ถ้าไม่สำเร็จ
async function sendRsvpEmail(reg, baseUrl) {
  const html = buildHtml(reg, baseUrl);
  const subject = 'ยืนยันการเข้าร่วมงานสัมมนา — Think With Data, Decide With AI';

  if (DRYRUN) {
    console.log(`[mailer] (dry-run) จะส่งถึง ${reg.email} — ${reg.reg_code}`);
    return true;
  }

  // ใช้ Brevo ก่อนถ้ามี API key (ทำงานบน Railway), ไม่งั้นค่อยลอง Gmail SMTP
  if (BREVO_API_KEY) {
    return sendViaBrevo(reg, subject, html);
  }

  await getTransporter().sendMail({
    from: `"${SENDER_NAME}" <${GMAIL_USER}>`,
    to: reg.email,
    subject,
    html,
  });
  return true;
}

module.exports = { isConfigured, sendRsvpEmail };
