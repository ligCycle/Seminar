const dns = require('dns');

// Render/แพลตฟอร์มคลาวด์มักต่อ IPv6 ค้าง — บังคับ IPv4 ก่อน
try { dns.setDefaultResultOrder('ipv4first'); } catch { /* Node เก่าไม่มีเมธอดนี้ */ }

// ---------- ThaiBulkSMS (แนะนำสำหรับเบอร์ไทย) ----------
const THAIBULK_API_KEY = process.env.THAIBULK_API_KEY || '';
const THAIBULK_API_SECRET = process.env.THAIBULK_API_SECRET || '';
const THAIBULK_SENDER = process.env.THAIBULK_SENDER || '';

// ---------- Twilio (ทางเลือก — มักส่งไทยไม่ได้บน trial) ----------
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || '';

function thaibulkReady() {
  return !!(THAIBULK_API_KEY && THAIBULK_API_SECRET && THAIBULK_SENDER);
}
function twilioReady() {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM);
}

// dev-mode = ยังไม่ตั้ง provider ไหนเลย → ไม่ส่ง SMS จริง แค่โชว์รหัสไว้ทดสอบ
function smsDevMode() {
  return !thaibulkReady() && !twilioReady();
}

// ระบบ SMS พร้อมใช้เสมอ (dev-mode ก็ถือว่าพร้อม)
function isSmsConfigured() {
  return true;
}

// แปลงเบอร์ไทย 10 หลัก (0xxxxxxxxx) → E.164 (+66xxxxxxxxx) — ใช้กับ Twilio
function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return '+66' + digits.slice(1);
  if (digits.startsWith('66')) return '+' + digits;
  return '+' + digits;
}

function otpText(code) {
  return `รหัส OTP งานสัมมนา Siam University ของคุณคือ ${code} (หมดอายุใน 5 นาที)`;
}

// ส่งผ่าน ThaiBulkSMS API v2 (Basic auth: key:secret) — เบอร์ไทยรูปแบบ 0xxxxxxxxx ได้เลย
async function sendViaThaiBulk(phone, code) {
  const msisdn = String(phone).replace(/\D/g, '');
  const auth = Buffer.from(`${THAIBULK_API_KEY}:${THAIBULK_API_SECRET}`).toString('base64');
  const form = new URLSearchParams({ msisdn, message: otpText(code), sender: THAIBULK_SENDER });

  const res = await fetch('https://api-v2.thaibulksms.com/sms', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: form.toString(),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = (j.error && (j.error.description || j.error.message)) || j.message || JSON.stringify(j);
    } catch { /* body ไม่ใช่ JSON */ }
    throw new Error('ThaiBulkSMS: ' + msg);
  }
  return { dev: false };
}

// ส่งผ่าน Twilio (ทางเลือก)
async function sendViaTwilio(phone, code) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const form = new URLSearchParams({ To: toE164(phone), From: TWILIO_FROM, Body: otpText(code) });
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.message || JSON.stringify(j); } catch { /* not json */ }
    throw new Error('Twilio: ' + msg);
  }
  return { dev: false };
}

// ส่ง OTP — เลือก provider ตามที่ตั้งค่า; คืน { dev:true } ถ้าเป็น dev-mode (ไม่ได้ส่งจริง)
async function sendOtpSms(phone, code) {
  if (thaibulkReady()) return sendViaThaiBulk(phone, code);
  if (twilioReady()) return sendViaTwilio(phone, code);
  console.log(`[sms] (dev-mode) OTP สำหรับ ${phone} = ${code}`);
  return { dev: true };
}

module.exports = { isSmsConfigured, smsDevMode, sendOtpSms, toE164 };
