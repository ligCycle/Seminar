# เว็บลงทะเบียนงานสัมมนา

เว็บลงทะเบียนงานสัมมนา เก็บข้อมูลผู้เข้าร่วมลง PostgreSQL พร้อมหน้า **Admin** ดู/export รายชื่อ

## ฟีเจอร์
- ฟอร์มลงทะเบียน (ชื่อ อีเมล เบอร์ องค์กร ตำแหน่ง รอบสัมมนา อาหาร ฯลฯ) + ยินยอม PDPA (กันอีเมล/เบอร์ซ้ำ)
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
ระบบส่งอีเมลผ่าน Gmail — ต้องมี App Password:
1. เปิด **2-Step Verification** ในบัญชี Google ก่อน
2. ไปที่ <https://myaccount.google.com/apppasswords> สร้าง App Password ใหม่ (16 ตัว)
3. ตั้ง Variables บน Railway:
   - `GMAIL_USER` = อีเมล Gmail ผู้ส่ง
   - `GMAIL_APP_PASSWORD` = App Password ที่ได้ (ไม่ใช่รหัสผ่าน Gmail ปกติ)
4. เข้าหน้า Admin → กด **📧 ส่งอีเมลถามการมา** ระบบจะส่งไปยังผู้ที่ยังไม่ตอบ ผู้รับกดยืนยันจากอีเมลได้เลย

> ตั้ง `MAIL_DRYRUN=true` เพื่อทดสอบโดยไม่ส่งจริง (ระบบจะ log แทน)

## หมายเหตุด้านความปลอดภัย / PDPA
- ต้องแทน "ลิงก์นโยบายความเป็นส่วนตัว" ในฟอร์ม (`public/index.html`) ด้วยลิงก์จริงของผู้จัด
- ระบบเก็บข้อมูลเฉพาะที่จำเป็นต่อการจัดงาน และบันทึกการยินยอม PDPA ทุกครั้ง
- หน้า Admin ป้องกันด้วยรหัสผ่านเดียว — เหมาะกับงานทั่วไป หากต้องการหลายผู้ใช้ค่อยขยายภายหลัง
