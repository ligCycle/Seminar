const form = document.getElementById('regForm');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');

function showMsg(text, type) {
  msg.textContent = text;
  msg.className = 'msg show ' + type;
}

// เบอร์โทร: พิมพ์ได้เฉพาะตัวเลข สูงสุด 10 หลัก
const phoneInput = form.querySelector('[name="phone"]');
phoneInput.addEventListener('input', () => {
  phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
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
