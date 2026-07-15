const resultBox = document.getElementById('result');
const authWarn = document.getElementById('authWarn');
const manualBtn = document.getElementById('manualBtn');
const manualCode = document.getElementById('manualCode');

let busy = false;
let lastCode = '';
let lastTime = 0;
let hideTimer = null;

// เสียงบี๊บแจ้งผล (ไม่ต้องมีไฟล์เสียง — ใช้ Web Audio)
let audioCtx = null;
function beep(status) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const tones = status === 'success' ? [880, 1245] : status === 'already' ? [620] : [200];
    tones.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = status === 'not_found' ? 'square' : 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  } catch { /* เบราว์เซอร์ไม่อนุญาตเสียง — ข้ามไป */ }
}

function showResult(status, name, extra) {
  const map = {
    success: { icon: '✅', title: 'เช็คอินสำเร็จ' },
    already: { icon: '⚠️', title: 'เช็คอินไปแล้ว' },
    not_found: { icon: '❌', title: 'ไม่พบข้อมูล' },
  };
  const m = map[status] || map.not_found;
  resultBox.className = 'scan-overlay show ' + status;
  resultBox.innerHTML = `
    <div class="icon">${m.icon}</div>
    <div class="name">${name ? escapeHtml(name) : ''}</div>
    <div>${m.title}${extra ? ' • ' + extra : ''}</div>
  `;
  beep(status);
  // ซ่อนอัตโนมัติหลัง 2.6 วิ เพื่อให้พร้อมสแกนคนต่อไป
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { resultBox.className = 'scan-overlay'; }, 2600);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function doCheckin(code) {
  code = (code || '').trim().toUpperCase();
  if (!code || busy) return;

  // กันสแกนรหัสเดิมซ้ำรัวๆ ภายใน 3 วินาที
  const now = Date.now();
  if (code === lastCode && now - lastTime < 3000) return;
  lastCode = code;
  lastTime = now;

  busy = true;
  try {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reg_code: code }),
    });

    if (res.status === 401) {
      authWarn.style.display = 'block';
      return;
    }

    const r = await res.json();
    if (r.status === 'success') {
      showResult('success', r.full_name);
    } else if (r.status === 'already') {
      const t = r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString('th-TH') : '';
      showResult('already', r.full_name, t ? 'เมื่อ ' + t : '');
    } else {
      showResult('not_found', '', code);
    }
  } catch {
    showResult('not_found', '', 'เชื่อมต่อไม่ได้');
  } finally {
    busy = false;
  }
}

// ---------- manual input ----------
manualBtn.addEventListener('click', () => {
  doCheckin(manualCode.value);
  manualCode.value = '';
});
manualCode.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { doCheckin(manualCode.value); manualCode.value = ''; }
});

// ---------- QR scanner ----------
function startScanner() {
  if (typeof Html5Qrcode === 'undefined') return; // โหลด CDN ไม่ได้ ใช้ manual แทน
  const scanner = new Html5Qrcode('reader');
  scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 240, height: 240 } },
    (decodedText) => doCheckin(decodedText),
    () => { /* ไม่เจอ QR ในเฟรมนี้ — เงียบไว้ */ }
  ).catch((err) => {
    document.getElementById('reader').innerHTML =
      '<p style="color:var(--muted);text-align:center">ไม่สามารถเปิดกล้องได้ — ใช้การกรอกรหัสด้านล่างแทน</p>';
    console.warn('camera error', err);
  });
}

startScanner();
