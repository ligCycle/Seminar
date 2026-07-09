const loginView = document.getElementById('loginView');
const dashView = document.getElementById('dashView');
const loginMsg = document.getElementById('loginMsg');
const dashMsg = document.getElementById('dashMsg');
const tbody = document.getElementById('tbody');
const search = document.getElementById('search');

let allRows = [];

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = 'msg show ' + type;
}

// ---------- login ----------
document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login();
});

async function login() {
  const password = document.getElementById('password').value;
  loginMsg.className = 'msg';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const r = await res.json();
      return showMsg(loginMsg, r.error || 'เข้าสู่ระบบไม่สำเร็จ', 'error');
    }
    openDashboard();
  } catch {
    showMsg(loginMsg, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
  }
}

function openDashboard() {
  loginView.style.display = 'none';
  dashView.style.display = 'block';
  loadData();
  loadFeedback();
}

// ---------- data ----------
async function loadData() {
  dashMsg.className = 'msg';
  try {
    const res = await fetch('/api/registrants');
    if (res.status === 401) {
      // token หมดอายุ → กลับไปหน้า login
      dashView.style.display = 'none';
      loginView.style.display = 'block';
      return;
    }
    const r = await res.json();
    allRows = r.registrants || [];
    document.getElementById('statTotal').textContent = r.total || 0;
    document.getElementById('statCheckedIn').textContent = r.checkedIn || 0;
    document.getElementById('statRsvpYes').textContent = r.rsvpYes || 0;
    render();
  } catch {
    showMsg(dashMsg, 'ดึงข้อมูลไม่สำเร็จ', 'error');
  }
}

function render() {
  const q = search.value.trim().toLowerCase();
  const rows = q
    ? allRows.filter((r) =>
        [r.full_name, r.email, r.organization]
          .some((v) => (v || '').toLowerCase().includes(q)))
    : allRows;

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--muted)">ไม่พบข้อมูล</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const checkedIn = r.status === 'checked_in';
    const badge = checkedIn
      ? '<span class="badge checked_in">มาแล้ว</span>'
      : '<span class="badge registered">ลงทะเบียน</span>';
    let rsvp;
    if (r.rsvp_status === 'yes') rsvp = '<span class="badge checked_in">มา</span>';
    else if (r.rsvp_status === 'no') rsvp = '<span class="badge declined">ไม่มา</span>';
    else rsvp = '<span class="badge registered">ยังไม่ตอบ</span>';
    return `<tr>
      <td>${badge}</td>
      <td>${rsvp}</td>
      <td>${esc(r.full_name)}</td>
      <td>${esc(r.email)}</td>
      <td>${esc(r.phone)}</td>
      <td>${esc(r.organization)}</td>
      <td>${esc(r.job_title)}</td>
      <td>${esc(r.session_choice)}</td>
      <td>${esc(r.dietary)}</td>
      <td>${fmtDate(r.created_at)}</td>
      <td>${checkedIn ? fmtDate(r.checked_in_at) : '–'}</td>
      <td><button class="btn secondary auto resend-btn" data-id="${r.id}" style="padding:5px 10px;font-size:0.8rem">ส่งซ้ำ</button></td>
    </tr>`;
  }).join('');
}

// ---------- feedback (ผลประเมินความพึงพอใจ) ----------
async function loadFeedback() {
  try {
    const res = await fetch('/api/feedback/summary');
    if (!res.ok) return;
    const r = await res.json();
    document.getElementById('fbCount').textContent = r.count || 0;
    document.getElementById('fbOverall').textContent = r.avgOverall != null ? r.avgOverall : '–';
    document.getElementById('fbSpeaker1').textContent = r.avgSpeaker1 != null ? r.avgSpeaker1 : '–';
    document.getElementById('fbSpeaker2').textContent = r.avgSpeaker2 != null ? r.avgSpeaker2 : '–';
    const totalRec = r.recommendYes + r.recommendNo;
    document.getElementById('fbRecommend').textContent =
      totalRec > 0 ? Math.round((r.recommendYes / totalRec) * 100) + '%' : '–';

    const comments = (r.items || []).filter((it) => it.comment);
    const box = document.getElementById('fbComments');
    if (comments.length === 0) {
      box.innerHTML = '<p style="color:var(--muted)">ยังไม่มีความคิดเห็น</p>';
    } else {
      box.innerHTML = comments.map((it) => `
        <div class="card" style="padding:12px 14px;margin-bottom:10px">
          <div style="color:var(--gold)">${'★'.repeat(it.overall_rating)}<span style="color:#3a3222">${'★'.repeat(5 - it.overall_rating)}</span></div>
          <div style="margin-top:4px">${esc(it.comment)}</div>
          <div style="color:var(--muted);font-size:0.8rem;margin-top:4px">${fmtDate(it.created_at)}</div>
        </div>
      `).join('');
    }
  } catch { /* เงียบไว้ */ }

  // โหลด QR แบบสอบถาม
  try {
    const res = await fetch('/api/feedback-qr');
    if (res.ok) {
      const r = await res.json();
      document.getElementById('fbQrBox').innerHTML = `
        <img src="${r.qr}" alt="QR แบบสอบถาม" style="width:220px;height:220px" />
        <div style="margin-top:10px"><a href="${esc(r.url)}" target="_blank" style="color:var(--gold);font-size:0.85rem">${esc(r.url)}</a></div>
        <button class="btn secondary auto" style="margin-top:10px" onclick="downloadFbQr('${r.qr}')">บันทึกรูป QR</button>
      `;
    }
  } catch { /* เงียบไว้ */ }
}

function downloadFbQr(dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'qr-feedback.png';
  a.click();
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

// ---------- toolbar ----------
search.addEventListener('input', render);
document.getElementById('refreshBtn').addEventListener('click', () => { loadData(); loadFeedback(); });
document.getElementById('exportBtn').addEventListener('click', () => {
  window.location.href = '/api/export';
});
document.getElementById('fbExportBtn').addEventListener('click', () => {
  window.location.href = '/api/feedback/export';
});
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.reload();
});
// ---------- reset ผ่าน modal สวยๆ (ยืนยันด้วยการพิมพ์ "ลบ") ----------
const resetModal = document.getElementById('resetModal');
const resetInput = document.getElementById('resetConfirmInput');
const resetConfirm = document.getElementById('resetConfirm');

function openResetModal() {
  resetInput.value = '';
  resetConfirm.disabled = true;
  resetModal.hidden = false;
  resetInput.focus();
}
function closeResetModal() {
  resetModal.hidden = true;
}

document.getElementById('resetBtn').addEventListener('click', openResetModal);
document.getElementById('resetCancel').addEventListener('click', closeResetModal);
// คลิกพื้นหลังนอกกล่อง = ปิด
resetModal.addEventListener('click', (e) => { if (e.target === resetModal) closeResetModal(); });
// กด Escape = ปิด
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !resetModal.hidden) closeResetModal(); });
// เปิดปุ่มยืนยันเฉพาะเมื่อพิมพ์ "ลบ" ถูกต้อง
resetInput.addEventListener('input', () => {
  resetConfirm.disabled = resetInput.value.trim() !== 'ลบ';
});
resetInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !resetConfirm.disabled) resetConfirm.click();
});

resetConfirm.addEventListener('click', async () => {
  resetConfirm.disabled = true;
  resetConfirm.textContent = 'กำลังล้าง...';
  try {
    const res = await fetch('/api/admin/reset', { method: 'POST' });
    if (!res.ok) {
      closeResetModal();
      return showMsg(dashMsg, 'ล้างข้อมูลไม่สำเร็จ', 'error');
    }
    const r = await res.json();
    closeResetModal();
    showMsg(dashMsg, `ล้างข้อมูลแล้ว: ผู้ลงทะเบียน ${r.registrants} รายการ, แบบประเมิน ${r.feedback} รายการ`, 'success');
    loadData();
    loadFeedback();
  } catch {
    closeResetModal();
    showMsg(dashMsg, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
  } finally {
    resetConfirm.textContent = 'ล้างข้อมูล';
  }
});

// ---------- ส่งอีเมล RSVP ----------
const rsvpModal = document.getElementById('rsvpModal');
document.getElementById('sendRsvpBtn').addEventListener('click', () => { rsvpModal.hidden = false; });
document.getElementById('rsvpCancel').addEventListener('click', () => { rsvpModal.hidden = true; });
rsvpModal.addEventListener('click', (e) => { if (e.target === rsvpModal) rsvpModal.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !rsvpModal.hidden) rsvpModal.hidden = true; });

const rsvpConfirm = document.getElementById('rsvpConfirm');
rsvpConfirm.addEventListener('click', async () => {
  rsvpConfirm.disabled = true;
  rsvpConfirm.textContent = 'กำลังส่ง...';
  try {
    const res = await fetch('/api/admin/send-rsvp', { method: 'POST' });
    const r = await res.json();
    rsvpModal.hidden = true;
    if (!res.ok) return showMsg(dashMsg, r.error || 'ส่งอีเมลไม่สำเร็จ', 'error');
    if (r.failed > 0) {
      showMsg(dashMsg, `ส่งไม่สำเร็จ ${r.failed} ฉบับ (สำเร็จ ${r.sent}) — สาเหตุ: ${r.error || 'ไม่ทราบ'}`, 'error');
    } else {
      showMsg(dashMsg, `ส่งอีเมลสำเร็จ ${r.sent} ฉบับ 🎉`, 'success');
    }
    loadData();
  } catch {
    rsvpModal.hidden = true;
    showMsg(dashMsg, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
  } finally {
    rsvpConfirm.disabled = false;
    rsvpConfirm.textContent = 'ส่งอีเมล';
  }
});

// ปุ่ม "ส่งซ้ำ" รายคน (event delegation เพราะแถวถูก render ใหม่)
tbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('.resend-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const res = await fetch('/api/admin/send-rsvp/' + btn.dataset.id, { method: 'POST' });
    const r = await res.json();
    if (!res.ok) showMsg(dashMsg, r.error || 'ส่งไม่สำเร็จ', 'error');
    else showMsg(dashMsg, `ส่งอีเมลถึง ${r.email} แล้ว`, 'success');
  } catch {
    showMsg(dashMsg, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'ส่งซ้ำ';
  }
});

// เผื่อมี cookie อยู่แล้ว ลองเข้า dashboard เลย
(async function tryAuto() {
  try {
    const res = await fetch('/api/registrants');
    if (res.ok) openDashboard();
  } catch { /* ยังไม่ login */ }
})();
