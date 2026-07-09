const form = document.getElementById('regForm');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');

function showMsg(text, type) {
  msg.textContent = text;
  msg.className = 'msg show ' + type;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- real-time validation (บอกทันทีตอนกรอก ไม่ต้องกดปุ่ม) ----------
const emailInput = form.querySelector('[name="email"]');
const phoneInput = form.querySelector('[name="phone"]');
const emailHint = document.getElementById('emailHint');
const phoneHint = document.getElementById('phoneHint');

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

// อีเมล: ตรวจรูปแบบ แล้วเช็คซ้ำ
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

// เบอร์โทร: พิมพ์ได้เฉพาะตัวเลข 10 หลัก + บอกสถานะ + เช็คซ้ำ
const checkPhone = debounce(async () => {
  const v = phoneInput.value.replace(/\D/g, '');
  if (!v) return setHint(phoneHint, phoneInput, '', '');
  if (v.length < 10) return setHint(phoneHint, phoneInput, `ต้องเป็นตัวเลข 10 หลัก (ตอนนี้ ${v.length} หลัก)`, 'error');
  setHint(phoneHint, phoneInput, 'กำลังตรวจสอบ...', 'checking');
  try {
    const { phoneTaken } = await checkAvailability({ phone: v });
    if (phoneTaken) setHint(phoneHint, phoneInput, 'เบอร์โทรนี้ถูกใช้ลงทะเบียนไปแล้ว', 'error');
    else setHint(phoneHint, phoneInput, 'ใช้เบอร์นี้ได้', 'ok');
  } catch {
    setHint(phoneHint, phoneInput, '', '');
  }
}, 450);
phoneInput.addEventListener('input', () => {
  phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
  checkPhone();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'msg';

  const fd = new FormData(form);
  const data = {
    full_name: fd.get('full_name'),
    email: fd.get('email'),
    phone: fd.get('phone'),
    organization: fd.get('organization'),
    job_title: fd.get('job_title'),
    session_choice: fd.get('session_choice'),
    heard_from: fd.get('heard_from'),
    dietary: fd.get('dietary'),
    special_needs: fd.get('special_needs'),
    pdpa_consent: fd.get('pdpa_consent') === 'on',
  };

  if (!data.full_name || !data.email || !data.phone) {
    return showMsg('กรุณากรอกชื่อ อีเมล และเบอร์โทรให้ครบ', 'error');
  }
  const phoneDigits = String(data.phone || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(phoneDigits)) {
    return showMsg('เบอร์โทรต้องเป็นตัวเลข 10 หลักพอดี', 'error');
  }
  data.phone = phoneDigits;
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
      submitBtn.textContent = 'ลงทะเบียน';
      return;
    }

    // เก็บผลไว้ใน sessionStorage แล้วไปหน้ายืนยัน
    sessionStorage.setItem('regResult', JSON.stringify(result));
    window.location.href = '/confirm.html';
  } catch (err) {
    showMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'REGISTER NOW';
  }
});
