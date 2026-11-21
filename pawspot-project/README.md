# PawSpot 🐾

เว็บกลางสำหรับแจ้งสัตว์เลี้ยงหายและพบสัตว์หลง — Express + PostgreSQL + HTML/Tailwind

## ฟีเจอร์

- **ประกาศ** ตามหาสัตว์หาย / พบสัตว์หลง พร้อมรูป ค้นหา กรองหมวด/สถานะ เรียงลำดับ
- **แผนที่** ปักหมุดตำแหน่งตอนลงประกาศ ดูทุกประกาศบนแผนที่ (สลับ "รายการ / แผนที่") และแผนที่เล็กในหน้ารายละเอียด (Leaflet + OpenStreetMap)
- **จับคู่อัตโนมัติ** ถ้าประกาศ "หาย" กับ "พบ" เป็นสัตว์ประเภทเดียวกัน ห่างกันไม่เกิน 5 กม. และวันที่ห่างกันไม่เกิน 21 วัน ระบบจะแจ้งเตือนเจ้าของทั้งสองฝั่ง และแสดงในหน้ารายละเอียด
- **การแจ้งเตือน** (กระดิ่ง) เมื่อมีคนแจ้งเบาะแส มีประกาศที่อาจตรงกัน ประกาศถูกซ่อน หรือ (สำหรับผู้ดูแล) มีคนแจ้งประกาศไม่เหมาะสม
- **โปรไฟล์** แก้ชื่อ อีเมล รูปโปรไฟล์ เปลี่ยน/ตั้งรหัสผ่าน ดูประกาศของฉันและเบาะแสที่เคยส่ง
- **แจ้งประกาศไม่เหมาะสม** กันมิจฉาชีพ
- **แดชบอร์ดผู้ดูแล** ภาพรวม + กราฟ 30 วัน, ตรวจรายงาน, ซ่อน/ลบประกาศ, ตั้งผู้ดูแล/ระงับผู้ใช้, ประวัติการเข้าสู่ระบบ
- **เข้าสู่ระบบ** ด้วยชื่อผู้ใช้/อีเมล + รหัสผ่าน, Google หรือ LINE และเก็บประวัติการล็อกอินทุกครั้ง

## เริ่มใช้งาน

1. ติดตั้ง [PostgreSQL](https://www.postgresql.org/download/) (มี pgAdmin มาด้วย)
2. เปิดไฟล์ `.env` (คัดลอกจาก `.env.example`) แล้วใส่รหัสผ่าน PostgreSQL ที่ตั้งไว้ตอนติดตั้ง

   ```
   PGPASSWORD=รหัสผ่านของคุณ
   ```

3. รัน

   ```bash
   npm install
   npm run dev
   ```

4. เปิด http://localhost:3000 — บัญชีทดสอบ: `admin / 123`, `user / 1234`

ตอนเปิดเซิร์ฟเวอร์ครั้งแรก ระบบจะ**สร้างฐานข้อมูล `pawspot` และตารางให้อัตโนมัติ** พร้อมข้อมูลตัวอย่าง
(โครงสร้างตารางอยู่ใน [backend/schema.sql](backend/schema.sql))

## ดูข้อมูลใน pgAdmin

เปิด pgAdmin 4 → **Servers → PostgreSQL 18 → Databases → pawspot → Schemas → public → Tables**

| ตาราง | เก็บอะไร |
|---|---|
| `users` | สมาชิก (รหัสผ่านเก็บแบบ bcrypt hash) |
| `items` | ประกาศสัตว์หาย / พบสัตว์หลง |
| `sightings` | เบาะแสจากผู้พบเห็น |
| `images` | รูปภาพที่อัปโหลด (bytea) |
| `login_history` | ประวัติการเข้าสู่ระบบทุกครั้ง (อีเมล, ชื่อผู้ใช้, วิธีล็อกอิน, สำเร็จหรือไม่, IP, เวลา) |
| `notifications` | การแจ้งเตือนของแต่ละคน (เบาะแส, จับคู่, ถูกซ่อน, รายงาน) |
| `reports` | การแจ้งประกาศไม่เหมาะสม |
| `login_emails` (View) | สรุปอีเมลทุกอีเมลที่เคยล็อกอินสำเร็จ — จำนวนครั้ง, ครั้งแรก, ครั้งล่าสุด อยู่ใน **Schemas → public → Views** |

คลิกขวาที่ตาราง → **View/Edit Data → All Rows** เพื่อดูข้อมูล หรือเปิด **Query Tool** แล้วลอง

```sql
SELECT i.id, i.name, i.type, i.status, u.username AS reporter
FROM items i JOIN users u ON u.id = i.reporter_id
ORDER BY i.created_at DESC;
```

**รีเซ็ตข้อมูล**: ใน pgAdmin คลิกขวาที่ฐานข้อมูล `pawspot` → Delete แล้วรันเซิร์ฟเวอร์ใหม่ ระบบจะสร้างให้ใหม่พร้อมข้อมูลตัวอย่าง

**ตอนใช้งานจริง**: ตั้ง `JWT_SECRET` เป็นข้อความสุ่มยาวๆ และ `SEED_DEMO=false` เพื่อไม่ให้สร้างบัญชีทดสอบ
ถ้าใช้ฐานข้อมูลบนคลาวด์ ใส่ `DATABASE_URL=postgres://user:password@host:5432/pawspot` แทนค่า `PG*`

## ขึ้นเว็บจริง (Render + Neon)

ไฟล์ [`render.yaml`](../render.yaml) ที่ root ของ repo ตั้งค่าไว้แล้ว (deploy เฉพาะโฟลเดอร์ `pawspot-project/`)

1. **Neon** (ฐานข้อมูล): สมัครที่ [neon.tech](https://neon.tech) → สร้างโปรเจกต์ region **Singapore** → คัดลอก *connection string* (แบบ pooled)
2. **Render** (เซิร์ฟเวอร์): สมัครที่ [render.com](https://render.com) ด้วย GitHub → **New → Blueprint** → เลือก repo นี้ แล้วกรอก
   - `DATABASE_URL` = connection string จาก Neon
   - `PUBLIC_URL` = URL ของเว็บ เช่น `https://pawspot.onrender.com`
   - `ADMIN_EMAILS` = อีเมล Google ของเจ้าของเว็บ (ล็อกอินด้วย Google ครั้งแรกจะได้สิทธิ์ผู้ดูแล)
   - `GOOGLE_CLIENT_ID/SECRET`, `LINE_CHANNEL_ID/SECRET` (ค่าเดียวกับใน `.env`)
   - `NODE_ENV=production`, `SEED_DEMO=false` และ `JWT_SECRET` (สุ่มให้อัตโนมัติ) ตั้งไว้ใน `render.yaml` แล้ว
3. เพิ่ม Callback URL ของเว็บจริงใน Google Cloud และ LINE Developers:
   `https://<ชื่อเว็บ>.onrender.com/api/auth/oauth/google/callback` และ `.../line/callback`
4. ดูข้อมูลบน Neon ใน pgAdmin: **Register → Server** ใส่ Host / Database / Username / Password จากหน้า Neon และแท็บ Parameters ตั้ง **SSL mode = require**

ข้อจำกัดแบบฟรี: Render หลับเมื่อไม่มีคนใช้ 15 นาที (เข้าครั้งแรกรอ ~30–50 วินาที), Neon เก็บได้ 0.5 GB (รวมรูปภาพ)

## เข้าสู่ระบบด้วย Google / LINE

โค้ดพร้อมแล้ว เหลือแค่สร้างแอปที่ผู้ให้บริการแต่ละเจ้าเพื่อเอา ID / Secret มาใส่ใน `.env` แล้วรีสตาร์ทเซิร์ฟเวอร์
ปุ่มของเจ้าที่ยังไม่ได้ตั้งค่าจะเป็นสีจาง และกดแล้วจะแจ้งว่ายังไม่เปิดใช้งาน

**Callback URL** ที่ต้องกรอกในแต่ละเจ้า (ถ้าขึ้นเว็บจริง เปลี่ยน `http://localhost:3000` เป็นโดเมนจริง และตั้ง `PUBLIC_URL` ให้ตรงกัน)

| เจ้า | Callback URL |
|---|---|
| Google | `http://localhost:3000/api/auth/oauth/google/callback` |
| LINE | `http://localhost:3000/api/auth/oauth/line/callback` |

### Google
1. เข้า [Google Cloud Console](https://console.cloud.google.com/) → สร้างโปรเจกต์
2. **APIs & Services → OAuth consent screen** → เลือก External กรอกชื่อแอปและอีเมล (ระหว่างทดสอบ เพิ่มอีเมลตัวเองใน Test users)
3. **Credentials → Create credentials → OAuth client ID** → ประเภท *Web application*
4. ใส่ Callback URL ด้านบนในช่อง **Authorized redirect URIs**
5. คัดลอกค่าไปใส่ `GOOGLE_CLIENT_ID` และ `GOOGLE_CLIENT_SECRET`

### LINE
1. เข้า [LINE Developers Console](https://developers.line.biz/console/) → สร้าง Provider → สร้าง channel ประเภท **LINE Login** (เลือก App type: Web app)
2. แท็บ **LINE Login** ใส่ Callback URL
3. แท็บ **Basic settings** คัดลอก Channel ID / Channel secret ไปใส่ `LINE_CHANNEL_ID` และ `LINE_CHANNEL_SECRET`
4. กด **Publish** channel (ถ้ายังเป็น Developing จะใช้ได้เฉพาะ admin/tester ของ channel)
5. (ไม่บังคับ) ถ้าต้องการอีเมลจาก LINE ให้ขอ *Email address permission* ในแท็บ Basic settings แล้วตั้ง `LINE_SCOPE=profile openid email`

**การทำงาน**: ล็อกอินครั้งแรกจะสร้างบัญชีใหม่ให้อัตโนมัติ ถ้าอีเมลจาก Google (ที่ยืนยันแล้ว) ตรงกับบัญชีเดิม จะผูกเข้ากับบัญชีนั้น
LINE จะไม่ผูกด้วยอีเมลอัตโนมัติ เพื่อกันคนอื่นสวมรอยบัญชี

## โครงสร้าง

```
pawspot-project/
├── frontend/                 หน้าเว็บ (เปิดผ่านเซิร์ฟเวอร์ที่ http://localhost:3000)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── script.js         หลัก: รายการประกาศ, รายละเอียด, ลงประกาศ, ล็อกอิน
│       ├── map.js            แผนที่ (Leaflet)
│       ├── account.js        โปรไฟล์ + การแจ้งเตือน
│       └── admin.js          แดชบอร์ดผู้ดูแล
├── backend/                  เซิร์ฟเวอร์ Express + PostgreSQL
│   ├── server.js             จุดเริ่มโปรแกรม (npm start / npm run dev)
│   ├── config.js             อ่านค่าจาก .env
│   ├── db.js                 เชื่อม PostgreSQL + สร้างฐานข้อมูล/ตารางอัตโนมัติ
│   ├── schema.sql            โครงสร้างตาราง
│   ├── seed.js               ข้อมูลตัวอย่าง
│   ├── validation.js         ตรวจข้อมูลที่ส่งมา
│   ├── oauth-providers.js    Google / LINE
│   ├── models/               users, items, images, logins, notifications — คำสั่ง SQL
│   ├── routes/               auth, oauth, items, images, me, notifications, admin
│   └── middleware/           JWT auth, request logger
├── .env                      ค่าลับ (ไม่อยู่ใน git)
├── .env.example              ตัวอย่างค่าที่ต้องตั้ง
└── package.json
```

## API

| Method | Path | สิทธิ์ | คำอธิบาย |
|---|---|---|---|
| POST | `/api/auth/register` | - | สมัครสมาชิก → `{ token, user }` |
| POST | `/api/auth/login` | - | เข้าสู่ระบบ → `{ token, user }` |
| GET | `/api/auth/me` | login | ข้อมูลผู้ใช้ปัจจุบัน |
| GET | `/api/auth/providers` | - | เจ้าที่เปิดใช้ social login แล้ว |
| GET | `/api/auth/oauth/:provider` | - | เริ่มล็อกอินด้วย `google` / `line` |
| POST | `/api/auth/oauth/exchange` | - | แลกรหัสใช้ครั้งเดียวหลังล็อกอินเป็น `{ token, user }` |
| GET | `/api/items` | - | รายการประกาศ (`type`, `category`, `status`, `q`, `sort`, `mine=1`, `page`, `limit`) |
| GET | `/api/items/stats` | - | สถิติ |
| GET | `/api/items/:id` | - | รายละเอียด + เบาะแส |
| POST | `/api/items` | login | ลงประกาศ (`image` เป็น data URL ได้) |
| PUT | `/api/items/:id` | เจ้าของ/admin | แก้ไข |
| PATCH | `/api/items/:id/status` | เจ้าของ/admin | `{ status: "pending" \| "returned" }` |
| DELETE | `/api/items/:id` | เจ้าของ/admin | ลบ |
| POST | `/api/items/:id/sightings` | login | แจ้งเบาะแส |
| DELETE | `/api/items/:id/sightings/:sid` | ผู้แจ้ง/เจ้าของ/admin | ลบเบาะแส |
| GET | `/api/images/:id` | - | ไฟล์รูป |
| GET | `/api/items/map` | - | หมุดบนแผนที่ (ใช้ตัวกรองเดียวกับรายการ) |
| GET | `/api/items/:id/matches` | - | ประกาศที่อาจเป็นสัตว์ตัวเดียวกัน |
| POST | `/api/items/:id/report` | login | แจ้งประกาศไม่เหมาะสม `{ reason }` |
| GET / PATCH | `/api/me` | login | ดู / แก้โปรไฟล์ `{ name, email, avatar }` |
| POST | `/api/me/password` | login | เปลี่ยน/ตั้งรหัสผ่าน |
| GET | `/api/me/sightings` | login | เบาะแสที่ฉันส่ง |
| GET | `/api/notifications` | login | การแจ้งเตือน + จำนวนที่ยังไม่อ่าน |
| POST | `/api/notifications/read` | login | ทำเครื่องหมายว่าอ่านแล้ว `{ ids? }` |
| GET | `/api/admin/stats` | admin | ตัวเลขภาพรวม + ข้อมูลรายวัน 30 วัน |
| GET | `/api/admin/users` · `/items` · `/reports` · `/logins` | admin | รายการสำหรับจัดการ |
| PATCH | `/api/admin/users/:id` | admin | `{ role, banned }` |
| PATCH | `/api/admin/items/:id/hidden` | admin | ซ่อน/เลิกซ่อนประกาศ `{ hidden, reason }` |
| POST | `/api/admin/reports/:id/resolve` | admin | ปิดรายงาน |

ส่ง token ใน header: `Authorization: Bearer <token>`
