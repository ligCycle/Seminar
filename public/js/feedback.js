const form = document.getElementById('feedbackForm');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');

function showMsg(text, type) {
  msg.textContent = text;
  msg.className = 'msg show ' + type;
}

// ---------- star rating widgets ----------
const ratings = {}; // { overall_rating: 5, speaker1_rating: 4, ... }

document.querySelectorAll('.stars').forEach((group) => {
  const name = group.dataset.name;
  const stars = [...group.querySelectorAll('.star')];

  function paint(value) {
    stars.forEach((s) => s.classList.toggle('on', Number(s.dataset.value) <= value));
  }

  stars.forEach((star) => {
    star.addEventListener('click', () => {
      ratings[name] = Number(star.dataset.value);
      paint(ratings[name]);
    });
    // แสดงตัวอย่างตอนชี้เมาส์
    star.addEventListener('mouseenter', () => paint(Number(star.dataset.value)));
  });
  group.addEventListener('mouseleave', () => paint(ratings[name] || 0));
});

// ---------- recommend toggle ----------
let recommend = null;
document.querySelectorAll('.toggle-group').forEach((group) => {
  const btns = [...group.querySelectorAll('.toggle-btn')];
  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      recommend = btn.dataset.value; // 'yes' | 'no'
      btns.forEach((b) => b.classList.toggle('on', b === btn));
    });
  });
});

// ---------- submit ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'msg';

  if (!ratings.overall_rating) {
    return showMsg('กรุณาให้คะแนนความพึงพอใจโดยรวมก่อนส่ง', 'error');
  }

  const data = {
    overall_rating: ratings.overall_rating,
    speaker1_rating: ratings.speaker1_rating || null,
    speaker2_rating: ratings.speaker2_rating || null,
    recommend: recommend, // 'yes' | 'no' | null
    comment: form.querySelector('[name="comment"]').value,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'กำลังส่ง...';

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();

    if (!res.ok) {
      showMsg(result.error || 'ส่งไม่สำเร็จ', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'ส่งแบบประเมิน';
      return;
    }

    // แสดงหน้าขอบคุณแทนฟอร์ม
    document.querySelector('.card').innerHTML = `
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:3rem">🙏</div>
        <h2 style="margin:12px 0">ขอบคุณสำหรับความคิดเห็น</h2>
        <p style="color:var(--muted)">เราได้รับแบบประเมินของคุณเรียบร้อยแล้ว<br />ขอบคุณที่ร่วมงานสัมมนากับเรานะครับ/ค่ะ</p>
      </div>
    `;
  } catch (err) {
    showMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'ส่งแบบประเมิน';
  }
});
