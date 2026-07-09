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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted)">ไม่พบข้อมูล</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    return `<tr>
      <td>${esc(r.full_name)}</td>
      <td>${esc(r.email)}</td>
      <td>${esc(r.phone)}</td>
      <td>${esc(r.organization)}</td>
      <td>${esc(r.job_title)}</td>
      <td>${esc(r.session_choice)}</td>
      <td>${esc(r.dietary)}</td>
      <td>${fmtDate(r.created_at)}</td>
    </tr>`;
  }).join('');
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
document.getElementById('refreshBtn').addEventListener('click', loadData);
document.getElementById('exportBtn').addEventListener('click', () => {
  window.location.href = '/api/export';
});
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.reload();
});

// เผื่อมี cookie อยู่แล้ว ลองเข้า dashboard เลย
(async function tryAuto() {
  try {
    const res = await fetch('/api/registrants');
    if (res.ok) openDashboard();
  } catch { /* ยังไม่ login */ }
})();
