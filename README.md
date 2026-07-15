# เว็บลงทะเบียนงานสัมมนา

เว็บลงทะเบียนงานสัมมนา เก็บข้อมูลผู้เข้าร่วมลง PostgreSQL พร้อมหน้า **Admin** ดู/export รายชื่อ

## ฟีเจอร์
- ฟอร์มลงทะเบียน (ชื่อ อีเมล เบอร์ องค์กร ตำแหน่ง รอบสัมมนา อาหาร ฯลฯ) + ยินยอม PDPA (กันอีเมล/เบอร์ซ้ำ)
- ยืนยันเบอร์โทรด้วย **OTP** ก่อนลงทะเบียน (Twilio ถ้าตั้งค่า / dev-mode โชว์รหัสบนจอถ้าไม่ตั้ง)
- หน้ายืนยันการลงทะเบียน พร้อม QR code ประจำตัว
- เช็คอินหน้างานด้วยการสแกน QR (หรือกรอกรหัส) — บันทึกว่าใครมางาน
- ส่งอีเมลถามการเข้าร่วม (RSVP) ผ่าน Gmail — ผู้รับกดยืนยัน มา/ไม่มา ได้จากอีเมล
- แบบประเมินความพึงพอใจ (ไม่ระบุตัวตน) + สรุปผลในหน้า Admin
- หน้า Admin: ดูรายชื่อ/สถานะเช็คอิน/การตอบรับ ค้นหา export CSV และล้างข้อมูล

## เทคโนโลยี
HTML/CSS/JS ธรรมดา + Node.js/Express + PostgreSQL (พร้อม deploy บน Railway)

## รันบนเครื่อง (local)
1. ติดตั้ง dependencies
   ```bash
   npm install
   ```
2. คัดลอก `.env.example` เป็น `.env` แล้วตั้งค่า `DATABASE_URL` ให้ชี้ PostgreSQL ของคุณ และตั้ง `ADMIN_PASSWORD`
3. รัน
   ```bash
   npm start
   ```
4. เปิดเบราว์เซอร์
   - ฟอร์มลงทะเบียน: <http://localhost:3000/>
   - หน้า Admin: <http://localhost:3000/admin.html>

> ตารางฐานข้อมูลจะถูกสร้างอัตโนมัติตอนเริ่มระบบ (ไม่ต้องรัน migration เอง)

## Deploy บน Railway
1. Push โค้ดขึ้น GitHub แล้วสร้าง project ใหม่บน [Railway](https://railway.app) จาก repo นี้
2. กด **+ New → Database → PostgreSQL** — Railway จะตั้ง `DATABASE_URL` ให้บริการ web อัตโนมัติ
3. ที่ service ของเว็บ ไปที่ **Variables** เพิ่ม
   - `ADMIN_PASSWORD` = รหัสผ่าน admin ที่ต้องการ
   - `TOKEN_SECRET` = สตริงสุ่มยาวๆ (แนะนำให้ตั้ง เพื่อให้ session ไม่หลุดตอน restart)
   - `NODE_ENV` = `production`
   - (ถ้าจะใช้ส่งอีเมล RSVP) `GMAIL_USER`, `GMAIL_APP_PASSWORD` — ดูหัวข้อ "ตั้งค่าอีเมล" ด้านล่าง
4. Railway จะ build ด้วย Nixpacks และรัน `npm start` ให้เอง (ตาม`railway.json`)
5. เปิด domain ที่ Railway ให้มา แล้วทดสอบทุกหน้า

## ตั้งค่าอีเมล (ระบบส่งถามการมา RSVP)
> ⚠️ Railway บล็อกพอร์ต SMTP — **Gmail SMTP ใช้ไม่ได้บน Railway** จึงแนะนำให้ใช้ **Brevo** (ส่งผ่าน HTTPS)

### วิธีที่แนะนำ: Brevo (ฟรี 300 อีเมล/วัน)
1. สมัครที่ <https://www.brevo.com> (ฟรี)
2. ยืนยันอีเมลผู้ส่ง: **Senders, Domains & Dedicated IPs → Senders → Add a Sender** แล้วยืนยันจากลิงก์ในอีเมล
3. สร้าง API key: **SMTP & API → API Keys → Generate a new API key**
4. ตั้ง Variables บน Railway:
   - `BREVO_API_KEY` = API key ที่ได้
   - `BREVO_SENDER` = อีเมลผู้ส่งที่ยืนยันในข้อ 2
5. เข้าหน้า Admin → กด **📧 ส่งอีเมลถามการมา** — ผู้รับกดยืนยัน มา/ไม่มา จากอีเมลได้เลย

### ทางเลือก: Gmail SMTP (ใช้ได้เฉพาะตอนรัน local — Railway บล็อก)
เปิด 2FA → สร้าง App Password ที่ <https://myaccount.google.com/apppasswords> แล้วตั้ง `GMAIL_USER` + `GMAIL_APP_PASSWORD`

> ตั้ง `MAIL_DRYRUN=true` เพื่อทดสอบโดยไม่ส่งจริง (ระบบจะ log แทน)
> ถ้ามีทั้ง Brevo และ Gmail ระบบจะใช้ Brevo ก่อน

## ตั้งค่า SMS OTP ยืนยันเบอร์ (Twilio)
ผู้ลงทะเบียนต้องยืนยันเบอร์ด้วย OTP ก่อนลงทะเบียน
- **ไม่ตั้งค่า** → dev-mode: ระบบโชว์รหัส OTP บนจอ/log (ไม่ส่ง SMS จริง) — ใช้ทดสอบฟรี
- **ตั้งค่า Twilio** → ส่ง SMS จริง:
  1. สมัคร <https://www.twilio.com> (trial ฟรี) → ยืนยันเบอร์ปลายทางใน console (trial ส่งได้เฉพาะเบอร์ที่ verify)
  2. เอา **Account SID**, **Auth Token**, และเบอร์ Twilio (**From**) มาตั้ง Variables:
     - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`

> Twilio trial ส่งได้เฉพาะเบอร์ที่ยืนยันไว้ (เหมาะ demo หาเบอร์ตัวเอง) — ใช้งานจริงทุกเบอร์ต้องอัปเกรด/หรือใช้ SMS gateway ไทย

## หมายเหตุด้านความปลอดภัย / PDPA
- ต้องแทน "ลิงก์นโยบายความเป็นส่วนตัว" ในฟอร์ม (`public/index.html`) ด้วยลิงก์จริงของผู้จัด
- ระบบเก็บข้อมูลเฉพาะที่จำเป็นต่อการจัดงาน และบันทึกการยินยอม PDPA ทุกครั้ง
- หน้า Admin ป้องกันด้วยรหัสผ่านเดียว — เหมาะกับงานทั่วไป หากต้องการหลายผู้ใช้ค่อยขยายภายหลัง
