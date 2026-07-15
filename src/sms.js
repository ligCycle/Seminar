const dns = require('dns');

// Render/แพลตฟอร์มคลาวด์มักต่อ IPv6 ค้าง — บังคับ IPv4 ก่อน
try { dns.setDefaultResultOrder('ipv4first'); } catch { /* Node เก่าไม่มีเมธอดนี้ */ }

// Twilio (ถ้าตั้ง env ครบ จะส่ง SMS จริง; ไม่งั้นเป็น dev-mode โชว์รหัสทาง log)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || '';

function twilioReady() {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM);
}

// dev-mode = ยังไม่ตั้งค่า Twilio → ไม่ส่ง SMS จริง แค่โชว์รหัสไว้ทดสอบ
function smsDevMode() {
  return !twilioReady();
}

// ระบบ SMS พร้อมใช้เสมอ (dev-mode ก็ถือว่าพร้อม)
function isSmsConfigured() {
  return true;
}

// แปลงเบอร์ไทย 10 หลัก (0xxxxxxxxx) → E.164 (+66xxxxxxxxx)
function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return '+66' + digits.slice(1);
  if (digits.startsWith('66')) return '+' + digits;
  return '+' + digits;
}

// ส่ง OTP — คืน { dev: true } ถ้าเป็น dev-mode (ไม่ได้ส่งจริง)
async function sendOtpSms(phone, code) {
  const body = `รหัส OTP งานสัมมนา Siam University ของคุณคือ ${code} (หมดอายุใน 5 นาที)`;

  if (!twilioReady()) {
    console.log(`[sms] (dev-mode) OTP สำหรับ ${phone} = ${code}`);
    return { dev: true };
  }

  const to = toE164(phone);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const form = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.message || JSON.stringify(j);
    } catch { /* body ไม่ใช่ JSON */ }
    throw new Error('Twilio: ' + msg);
  }
  return { dev: false };
}

module.exports = { isSmsConfigured, smsDevMode, sendOtpSms, toE164 };
