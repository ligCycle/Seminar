# เว็บลงทะเบียนงานสัมมนา

เว็บลงทะเบียนงานสัมมนา เก็บข้อมูลผู้เข้าร่วมลง PostgreSQL พร้อมหน้า **Admin** ดู/export รายชื่อ

## ฟีเจอร์
- ฟอร์มลงทะเบียน (ชื่อ อีเมล เบอร์ องค์กร ตำแหน่ง รอบสัมมนา อาหาร ฯลฯ) + ยินยอม PDPA
- หน้ายืนยันการลงทะเบียน พร้อมรหัสอ้างอิง
- หน้า Admin: ดูรายชื่อ ค้นหา และ export เป็น CSV (เปิดใน Excel ภาษาไทยได้)

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
4. Railway จะ build ด้วย Nixpacks และรัน `npm start` ให้เอง (ตาม`railway.json`)
5. เปิด domain ที่ Railway ให้มา แล้วทดสอบทั้ง 3 หน้า

## หมายเหตุด้านความปลอดภัย / PDPA
- ต้องแทน "ลิงก์นโยบายความเป็นส่วนตัว" ในฟอร์ม (`public/index.html`) ด้วยลิงก์จริงของผู้จัด
- ระบบเก็บข้อมูลเฉพาะที่จำเป็นต่อการจัดงาน และบันทึกการยินยอม PDPA ทุกครั้ง
- หน้า Admin ป้องกันด้วยรหัสผ่านเดียว — เหมาะกับงานทั่วไป หากต้องการหลายผู้ใช้ค่อยขยายภายหลัง
