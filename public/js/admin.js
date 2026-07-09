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
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted)">ไม่พบข้อมูล</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const checkedIn = r.status === 'checked_in';
    const badge = checkedIn
      ? '<span class="badge checked_in">มาแล้ว</span>'
      : '<span class="badge registered">ลงทะเบียน</span>';
    return `<tr>
      <td>${badge}</td>
      <td>${esc(r.full_name)}</td>
      <td>${esc(r.email)}</td>
      <td>${esc(r.phone)}</td>
      <td>${esc(r.organization)}</td>
      <td>${esc(r.job_title)}</td>
      <td>${esc(r.session_choice)}</td>
      <td>${esc(r.dietary)}</td>
      <td>${fmtDate(r.created_at)}</td>
      <td>${checkedIn ? fmtDate(r.checked_in_at) : '–'}</td>
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
document.getElementById('resetBtn').addEventListener('click', async () => {
  // ยืนยัน 2 ชั้น กันกดพลาด — ลบถาวรกู้คืนไม่ได้
  if (!confirm('⚠️ ล้างข้อมูลทั้งหมด?\n\nจะลบผู้ลงทะเบียนและแบบประเมินทั้งหมดถาวร กู้คืนไม่ได้')) return;
  const typed = prompt('พิมพ์  ลบ  เพื่อยืนยันการล้างข้อมูลทั้งหมด');
  if ((typed || '').trim() !== 'ลบ') return showMsg(dashMsg, 'ยกเลิกการล้างข้อมูล', 'error');
  try {
    const res = await fetch('/api/admin/reset', { method: 'POST' });
    if (!res.ok) return showMsg(dashMsg, 'ล้างข้อมูลไม่สำเร็จ', 'error');
    const r = await res.json();
    showMsg(dashMsg, `ล้างข้อมูลแล้ว: ผู้ลงทะเบียน ${r.registrants} รายการ, แบบประเมิน ${r.feedback} รายการ`, 'success');
    loadData();
    loadFeedback();
  } catch {
    showMsg(dashMsg, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
  }
});

// เผื่อมี cookie อยู่แล้ว ลองเข้า dashboard เลย
(async function tryAuto() {
  try {
    const res = await fetch('/api/registrants');
    if (res.ok) openDashboard();
  } catch { /* ยังไม่ login */ }
})();
