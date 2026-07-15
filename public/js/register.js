const form = document.getElementById('regForm');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');

// ขั้นตอน
const verifyStep = document.getElementById('verifyStep');
const formStep = document.getElementById('formStep');
const verifiedPhoneDisplay = document.getElementById('verifiedPhoneDisplay');
const changePhoneLink = document.getElementById('changePhoneLink');

function showMsg(text, type) {
  msg.textContent = text;
  msg.className = 'msg show ' + type;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailInput = form.querySelector('[name="email"]');
const phoneInput = document.getElementById('phoneInput');
const emailHint = document.getElementById('emailHint');
const phoneHint = document.getElementById('phoneHint');

// OTP
const otpSendBtn = document.getElementById('otpSendBtn');
const otpVerifyBtn = document.getElementById('otpVerifyBtn');
const otpGroup = document.getElementById('otpGroup');
const otpInput = document.getElementById('otpInput');
const otpHint = document.getElementById('otpHint');

let phoneToken = null;    // ได้จาก /api/otp/verify
let verifiedPhone = '';   // เบอร์ที่ยืนยันแล้ว
let cooldownTimer = null;

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function setHint(hintEl, inputEl, text, type) {
  hintEl.textContent = text;
  hintEl.className = 'field-hint' + (type ? ' ' + type : '');
  inputEl.classList.remove('invalid', 'valid');
  if (type === 'error') inputEl.classList.add('invalid');
  else if (type === 'ok') inputEl.classList.add('valid');
}

async function checkAvailability(params) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch('/api/check?' + q);
  return res.json();
}

// ---------- อีเมล: ตรวจรูปแบบ + เช็คซ้ำ (ในขั้นที่ 2) ----------
const checkEmail = debounce(async () => {
  const v = emailInput.value.trim();
  if (!v) return setHint(emailHint, emailInput, '', '');
  if (!EMAIL_RE.test(v)) return setHint(emailHint, emailInput, 'รูปแบบอีเมลไม่ถูกต้อง', 'error');
  setHint(emailHint, emailInput, 'กำลังตรวจสอบ...', 'checking');
  try {
    const { emailTaken } = await checkAvailability({ email: v });
    if (emailTaken) setHint(emailHint, emailInput, 'อีเมลนี้ถูกใช้ลงทะเบียนไปแล้ว', 'error');
    else setHint(emailHint, emailInput, 'ใช้อีเมลนี้ได้', 'ok');
  } catch {
    setHint(emailHint, emailInput, '', '');
  }
}, 450);
emailInput.addEventListener('input', checkEmail);

// ---------- เบอร์โทร: ตัวเลข 10 หลัก + เช็คซ้ำ (ในขั้นที่ 1) ----------
const checkPhone = debounce(async () => {
  const v = phoneInput.value.replace(/\D/g, '');
  if (!v) return setHint(phoneHint, phoneInput, '', '');
  if (v.length < 10) return setHint(phoneHint, phoneInput, `ต้องเป็นตัวเลข 10 หลัก (ตอนนี้ ${v.length} หลัก)`, 'error');
  setHint(phoneHint, phoneInput, 'กำลังตรวจสอบ...', 'checking');
  try {
    const { phoneTaken } = await checkAvailability({ phone: v });
    if (phoneTaken) setHint(phoneHint, phoneInput, 'เบอร์โทรนี้ถูกใช้ลงทะเบียนไปแล้ว', 'error');
    else setHint(phoneHint, phoneInput, 'ใช้เบอร์นี้ได้ กด "ส่ง OTP" เพื่อยืนยัน', 'ok');
  } catch {
    setHint(phoneHint, phoneInput, '', '');
  }
}, 450);
phoneInput.addEventListener('input', () => {
  phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
  resetOtpState();
  checkPhone();
});

function resetOtpState() {
  phoneToken = null;
  otpGroup.style.display = 'none';
  otpInput.value = '';
  otpInput.disabled = false;
  otpVerifyBtn.disabled = false;
  otpVerifyBtn.textContent = 'ยืนยัน';
  setHint(otpHint, otpInput, '', '');
  if (!cooldownTimer) { otpSendBtn.disabled = false; otpSendBtn.textContent = 'ส่ง OTP'; }
}

function startCooldown(sec) {
  otpSendBtn.disabled = true;
  let left = sec;
  otpSendBtn.textContent = `ส่งใหม่ (${left})`;
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      otpSendBtn.disabled = !!phoneToken;
      otpSendBtn.textContent = phoneToken ? 'ยืนยันแล้ว ✓' : 'ส่ง OTP อีกครั้ง';
    } else {
      otpSendBtn.textContent = `ส่งใหม่ (${left})`;
    }
  }, 1000);
}

otpSendBtn.addEventListener('click', async () => {
  const phone = phoneInput.value.replace(/\D/g, '');
  if (!/^\d{10}$/.test(phone)) {
    return setHint(phoneHint, phoneInput, 'กรอกเบอร์ 10 หลักก่อนขอ OTP', 'error');
  }
  otpSendBtn.disabled = true;
  otpSendBtn.textContent = 'กำลังส่ง...';
  try {
    const res = await fetch('/api/otp/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const r = await res.json();
    if (!res.ok) {
      // โชว์ที่ phoneHint (เห็นได้เสมอ) เพราะ otpGroup ยังซ่อนอยู่
      setHint(phoneHint, phoneInput, r.error || 'ส่ง OTP ไม่สำเร็จ', 'error');
      otpSendBtn.disabled = false;
      otpSendBtn.textContent = 'ส่ง OTP';
      return;
    }
    otpGroup.style.display = 'block';
    otpInput.focus();
    if (r.devCode) {
      setHint(otpHint, otpInput, `โหมดทดสอบ: รหัสคือ ${r.devCode} (ยังไม่ได้ส่ง SMS จริง)`, 'ok');
    } else {
      setHint(otpHint, otpInput, 'ส่งรหัสไปที่เบอร์ของคุณแล้ว กรุณากรอกรหัส', 'ok');
    }
    startCooldown(60);
  } catch {
    setHint(phoneHint, phoneInput, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
    otpSendBtn.disabled = false;
    otpSendBtn.textContent = 'ส่ง OTP';
  }
});

otpInput.addEventListener('input', () => {
  otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6);
});

otpVerifyBtn.addEventListener('click', async () => {
  const phone = phoneInput.value.replace(/\D/g, '');
  const code = otpInput.value.replace(/\D/g, '');
  if (code.length !== 6) return setHint(otpHint, otpInput, 'กรอกรหัส 6 หลัก', 'error');
  otpVerifyBtn.disabled = true;
  otpVerifyBtn.textContent = '...';
  try {
    const res = await fetch('/api/otp/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    const r = await res.json();
    if (!res.ok) {
      setHint(otpHint, otpInput, r.error || 'ยืนยันไม่สำเร็จ', 'error');
      otpVerifyBtn.disabled = false;
      otpVerifyBtn.textContent = 'ยืนยัน';
      return;
    }
    // ยืนยันสำเร็จ → ไปขั้นที่ 2
    phoneToken = r.token;
    verifiedPhone = phone;
    clearInterval(cooldownTimer);
    cooldownTimer = null;
    verifiedPhoneDisplay.textContent = phone;
    verifyStep.style.display = 'none';
    formStep.style.display = 'block';
    form.querySelector('[name="full_name"]').focus();
  } catch {
    setHint(otpHint, otpInput, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
    otpVerifyBtn.disabled = false;
    otpVerifyBtn.textContent = 'ยืนยัน';
  }
});

// เปลี่ยนเบอร์ → กลับไปขั้นที่ 1
changePhoneLink.addEventListener('click', (e) => {
  e.preventDefault();
  formStep.style.display = 'none';
  verifyStep.style.display = 'block';
  resetOtpState();
  otpSendBtn.disabled = false;
  otpSendBtn.textContent = 'ส่ง OTP';
  clearInterval(cooldownTimer);
  cooldownTimer = null;
  phoneInput.focus();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'msg';

  const fd = new FormData(form);
  const data = {
    full_name: fd.get('full_name'),
    email: fd.get('email'),
    phone: verifiedPhone,
    phone_token: phoneToken,
    organization: fd.get('organization'),
    job_title: fd.get('job_title'),
    session_choice: fd.get('session_choice'),
    heard_from: fd.get('heard_from'),
    dietary: fd.get('dietary'),
    special_needs: fd.get('special_needs'),
    pdpa_consent: fd.get('pdpa_consent') === 'on',
  };

  if (!phoneToken || !verifiedPhone) {
    return showMsg('กรุณายืนยันเบอร์โทรด้วย OTP ก่อน', 'error');
  }
  if (!data.full_name || !data.email) {
    return showMsg('กรุณากรอกชื่อและอีเมลให้ครบ', 'error');
  }
  if (!data.pdpa_consent) {
    return showMsg('กรุณายินยอมนโยบายความเป็นส่วนตัว (PDPA) ก่อนลงทะเบียน', 'error');
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังลงทะเบียน...';

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();

    if (!res.ok) {
      showMsg(result.error || 'เกิดข้อผิดพลาด', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'REGISTER NOW';
      return;
    }

    sessionStorage.setItem('regResult', JSON.stringify(result));
    window.location.href = '/confirm.html';
  } catch (err) {
    showMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'REGISTER NOW';
  }
});
