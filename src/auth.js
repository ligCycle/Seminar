const crypto = require('crypto');

// รหัส Admin ตัวเดียว อ่านจาก env (ตั้งค่าบน Railway)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

// secret สำหรับเซ็น token — ถ้าไม่ตั้งจะสุ่มตอน start (session หลุดเมื่อ restart แต่ยังปลอดภัย)
const TOKEN_SECRET = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

const COOKIE_NAME = 'admin_token';

// สร้าง token แบบ HMAC ง่ายๆ (payload = คำว่า admin + วันหมดอายุ)
function issueToken() {
  const expires = Date.now() + 1000 * 60 * 60 * 8; // 8 ชั่วโมง
  const payload = `admin:${expires}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

function verifyToken(token) {
  if (!token) return false;
  const parts = token.split(':');
  if (parts.length !== 3) return false;
  const [role, expires, sig] = parts;
  const payload = `${role}:${expires}`;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  // เทียบแบบ constant-time กัน timing attack
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  if (Date.now() > Number(expires)) return false;
  return true;
}

function checkPassword(password) {
  if (typeof password !== 'string') return false;
  const a = Buffer.from(password);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// middleware ป้องกัน endpoint ของ admin
function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (verifyToken(token)) return next();
  return res.status(401).json({ error: 'ต้องเข้าสู่ระบบ Admin ก่อน' });
}

// ---------- ลิงก์ RSVP (ยืนยันการมา) เซ็นด้วย HMAC กันปลอม ----------
// ใช้ reg_code เป็น payload แล้วเซ็น เพื่อไม่ต้องเก็บ token เพิ่มในฐานข้อมูล
function rsvpSig(regCode) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(`rsvp:${regCode}`).digest('hex');
}

function verifyRsvp(regCode, sig) {
  if (!regCode || !sig) return false;
  const expected = rsvpSig(regCode);
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------- โทเคนยืนยันเบอร์ (หลังผ่าน OTP) เซ็นด้วย HMAC ----------
// รูปแบบ: "<expiry>.<sig>" โดย sig = HMAC(phone:<phone>:<expiry>)
// พิสูจน์ว่าเบอร์นี้ยืนยันแล้ว โดยไม่ต้องเก็บ session ฝั่ง server
function phoneToken(phone, ttlMs = 30 * 60 * 1000) {
  const expires = Date.now() + ttlMs;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(`phone:${phone}:${expires}`).digest('hex');
  return `${expires}.${sig}`;
}

function verifyPhoneToken(phone, token) {
  if (!phone || !token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const expires = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(expires) || Date.now() > Number(expires)) return false;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(`phone:${phone}:${expires}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  issueToken, verifyToken, checkPassword, requireAdmin, COOKIE_NAME,
  rsvpSig, verifyRsvp, phoneToken, verifyPhoneToken,
};
