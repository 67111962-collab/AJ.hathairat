# คำอธิบาย API และฐานข้อมูล PawSpot

เอกสารนี้อธิบายว่า API ทำงานอย่างไร ทีละบรรทัด พร้อมเลขบรรทัดในโค้ด (เปิดไฟล์ใน VS Code แล้วกด `Ctrl+G` ใส่เลขบรรทัดได้เลย)

---

## 1. ภาพรวม: 1 request เดินทางอย่างไร

ตัวอย่าง: ผู้ใช้กด "เข้าสู่ระบบ"

```
เบราว์เซอร์ (frontend/js/script.js)
   │  api('/auth/login', { method:'POST', body:{ username, password } })
   │  → fetch('/api/auth/login')  ส่ง JSON + header Authorization: Bearer <token> (ถ้ามี)
   ▼
backend/server.js
   │  express.json()          แปลง body ที่เป็น JSON → req.body
   │  app.use('/api/auth', routes/auth.js)   เลือกไฟล์ route ตาม path
   ▼
backend/routes/auth.js         router.post('/login', ...)   ← "ฟังก์ชัน API"
   │  ตรวจข้อมูล → เรียก model
   ▼
backend/models/users.js        เขียนคำสั่ง SQL
   ▼
backend/db.js  query()         ส่ง SQL ไป PostgreSQL ผ่าน pg (Pool)
   ▼
PostgreSQL  ตาราง users        ← ดูได้ใน pgAdmin
   ▲
   └── ผลลัพธ์ย้อนกลับ → res.json({ token, user }) → เบราว์เซอร์เก็บ token
```

| ชั้น | ไฟล์ | หน้าที่ |
|---|---|---|
| Frontend | `frontend/js/script.js` ฟังก์ชัน `api()` บรรทัด 49–66 | เรียก API ทุกตัวผ่านฟังก์ชันเดียว แนบ token ให้อัตโนมัติ |
| เส้นทาง | `backend/server.js` บรรทัด 26–33 | จับคู่ URL `/api/...` กับไฟล์ใน `routes/` |
| Middleware | `backend/middleware/auth.js` | ตรวจ token ก่อนเข้าฟังก์ชัน (`requireAuth`, `requireAdmin`) |
| Route | `backend/routes/*.js` | รับ request, ตรวจข้อมูล, ตอบกลับ JSON |
| Model | `backend/models/*.js` | คำสั่ง SQL ของแต่ละตาราง |
| DB | `backend/db.js` | เชื่อมต่อ PostgreSQL, `query()`, `transaction()` |

---

## 2. ฟังก์ชันที่แนะนำให้เลือกอธิบาย

### ฟังก์ชัน A: เข้าสู่ระบบ `POST /api/auth/login`  (แนะนำ: สั้นและครบทุกเรื่อง)

ไฟล์ `backend/routes/auth.js` บรรทัด 38–61

```js
router.post('/login', async (req, res) => {
    const identifier = String(req.body?.username ?? '').trim().toLowerCase();   // ① รับค่า
    const password = String(req.body?.password ?? '');
    const key = `${req.ip}|${identifier}`;

    if (!identifier || !password) return res.status(400).json({ message: 'กรุณากรอก...' });   // ② ตรวจว่ากรอกครบ
    if (tooManyAttempts(key)) return res.status(429).json({ message: '...รอ 15 นาที' });      // ③ กันเดารหัส

    const user = identifier.includes('@')                                                     // ④ หา user
        ? await users.findByEmail(identifier)
        : await users.findByUsername(identifier);

    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) { // ⑤ เทียบรหัส
        recordFailure(key);
        await logins.record(req, { user, identifier, method: 'password', success: false });
        return res.status(401).json({ message: 'ชื่อผู้ใช้ อีเมล หรือรหัสผ่านไม่ถูกต้อง' });
    }
    if (user.banned) return res.status(403)...                                              // ⑥ ถูกระงับ?
    await logins.record(req, { user, method: 'password', success: true });                 // ⑦ บันทึกประวัติ
    res.json({ token: signToken(user), user: users.toPublic(user) });                       // ⑧ ส่ง token กลับ
});
```

อธิบาย:
1. **รับค่า** จาก `req.body` (JSON ที่ส่งมา) ช่อง username ใส่ได้ทั้งชื่อผู้ใช้และอีเมล แปลงเป็นตัวเล็กก่อน
2. **ตรวจว่ากรอกครบ** ไม่ครบ → ตอบ **400 Bad Request**
3. **กันเดารหัส** ผิดเกิน 10 ครั้งใน 15 นาที (นับต่อ IP + ชื่อผู้ใช้) → **429 Too Many Requests**
4. **หาผู้ใช้** ถ้ามี `@` ค้นด้วยอีเมล ไม่งั้นค้นด้วย username (`SELECT * FROM users WHERE username = $1`)
5. **เทียบรหัสผ่าน** ด้วย `bcrypt.compare` เพราะในฐานข้อมูลเก็บแค่ **hash** ไม่ได้เก็บรหัสจริง ผิด → **401 Unauthorized** และข้อความเหมือนกันทั้ง "ไม่มีผู้ใช้" และ "รหัสผิด" เพื่อไม่ให้คนเดาได้ว่ามีบัญชีนี้ไหม
6. **บัญชีถูกระงับ** → **403 Forbidden**
7. **บันทึกประวัติ** ลงตาราง `login_history` ทั้งกรณีสำเร็จและไม่สำเร็จ
8. **สร้าง JWT token** (`signToken` ใน `middleware/auth.js` บรรทัด 5–7) อายุ 7 วัน ส่งกลับพร้อมข้อมูลผู้ใช้ (ไม่รวม password_hash) ฝั่งเว็บเก็บ token ไว้ใน localStorage แล้วแนบไปกับทุก request ต่อไป

ผลลัพธ์ที่ได้:
```json
{ "token": "eyJhbGciOiJIUzI1NiIs...", "user": { "id": "1", "username": "admin", "name": "Admin PawSpot", "email": "admin@pawspot.test", "role": "admin", ... } }
```

---

### ฟังก์ชัน B: ลงประกาศ `POST /api/items`

ไฟล์ `backend/routes/items.js` บรรทัด 83–102

```js
router.post('/', requireAuth, async (req, res) => {                          // ① ต้องล็อกอินก่อน
    const data = validateItem(req.body);                                     // ② ตรวจข้อมูล
    const image = req.body.image ? images.parseDataUrl(req.body.image) : null;

    const reviewStatus = isAdmin(req.user) ? 'approved' : 'pending';         // ③ สมาชิกต้องรออนุมัติ
    const id = await transaction(async db => {                               // ④ บันทึกรูป + ประกาศพร้อมกัน
        const imageId = image ? await images.create(db, image, req.user.id) : null;
        return items.create(db, data, req.user.id, imageId, reviewStatus);
    });
    if (reviewStatus === 'approved') {
        await notifications.notifyMatches(await items.findById(id));        // ⑤a หาประกาศที่ตรงกัน
    } else {
        await notifications.notifyAdmins({ type: 'review', ... });          // ⑤b แจ้งผู้ดูแล
    }
    await sendDetail(req, res, id, 201);                                     // ⑥ ตอบ 201 Created
});
```

1. **`requireAuth`** เป็น middleware ทำงานก่อน ถ้าไม่มี token หรือ token หมดอายุ → **401** ไม่เข้าฟังก์ชันเลย ถ้าผ่านจะได้ `req.user`
2. **`validateItem`** (`backend/validation.js` บรรทัด 22) ตรวจทุกช่อง เช่น type ต้องเป็น `lost`/`found` ช่องบังคับต้องไม่ว่าง ความยาวไม่เกินกำหนด พิกัดอยู่ในช่วงที่ถูกต้อง ผิด → **400**
3. **สถานะการอนุมัติ** ผู้ดูแลโพสต์แล้วขึ้นทันที สมาชิกเป็น `pending` รออนุมัติ
4. **Transaction** (`backend/db.js` บรรทัด 80–93) = `BEGIN` → บันทึกรูปลงตาราง `images` → บันทึกประกาศลงตาราง `items` → `COMMIT` ถ้าขั้นไหนพัง จะ `ROLLBACK` ทั้งหมด จึงไม่มีรูปค้างที่ไม่มีประกาศ
5. **แจ้งเตือน** ถ้าอนุมัติแล้วให้หาประกาศที่อาจเป็นตัวเดียวกัน ถ้ายังรออนุมัติให้แจ้งผู้ดูแลทุกคน
6. ตอบ **201 Created** พร้อมข้อมูลประกาศ

SQL ที่ทำงานจริง (`backend/models/items.js` บรรทัด 160–169):
```sql
INSERT INTO items (type, name, category, ..., lat, lng, image_id, reporter_id, review_status)
VALUES ($1, $2, $3, ..., $11, $12, $13, $14, $15) RETURNING id
```
ใช้ `$1, $2, ...` (parameterized query) แทนการต่อ string → **กัน SQL Injection** เพราะ PostgreSQL ถือว่าค่าที่ส่งมาเป็นข้อมูล ไม่ใช่คำสั่ง

---

### ฟังก์ชัน C: Middleware ตรวจ token `requireAuth`

ไฟล์ `backend/middleware/auth.js` บรรทัด 9–39

```js
async function userFromRequest(req) {
    const match = (req.get('authorization') || '').match(/^Bearer (.+)$/);   // อ่าน header
    if (!match) return { user: null, hadToken: false };
    try {
        const payload = jwt.verify(match[1], config.jwtSecret);               // ตรวจลายเซ็น + วันหมดอายุ
        const user = await users.findById(Number(payload.sub));               // sub = id ของผู้ใช้
        if (user?.banned) return { user: null, hadToken: true, banned: true };
        return { user, hadToken: true };
    } catch { return { user: null, hadToken: true }; }                        // token ปลอม / หมดอายุ
}

async function requireAuth(req, res, next) {
    const { user } = await userFromRequest(req);
    if (!user) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' });
    req.user = user;    // ฟังก์ชันถัดไปรู้ว่าใครเรียก
    next();             // ไปทำงานต่อ
}
```

- **Middleware** = ฟังก์ชันที่ทำงาน "คั่นกลาง" ก่อนถึงฟังก์ชันหลัก เรียก `next()` เพื่อไปต่อ หรือ `res.status(...)` เพื่อหยุด
- **JWT** = token ที่มีข้อมูล `{ sub: id ผู้ใช้ }` และลายเซ็นจาก `JWT_SECRET` ถ้าใครแก้ token ลายเซ็นจะไม่ตรง → `jwt.verify` ล้มเหลว
- `requireAdmin` (บรรทัด 41–44) ตรวจต่อว่า `req.user.role === 'admin'` ไม่ใช่ → **403**

---

### ฟังก์ชัน D: จับคู่อัตโนมัติ `findMatches`

ไฟล์ `backend/models/items.js` บรรทัด 214–229 เรียกผ่าน `GET /api/items/:id/matches`

```sql
SELECT i.id, i.name, <ระยะทาง Haversine> AS km
FROM items i
WHERE i.type <> $3                          -- ประเภทตรงข้าม (หาย ↔ พบ)
  AND i.category = $4                       -- สัตว์ชนิดเดียวกัน
  AND i.status = 'pending'                  -- ยังไม่กลับบ้าน
  AND NOT i.hidden AND i.review_status = 'approved'
  AND i.id <> $5 AND i.reporter_id <> $6    -- ไม่ใช่ประกาศตัวเอง
  AND abs(i.event_date - $7::date) <= $8    -- วันที่ห่างกันไม่เกิน 21 วัน
  AND <ระยะทาง> <= $9                       -- ห่างไม่เกิน 5 กม.
ORDER BY km ASC LIMIT $10
```

สูตร Haversine (บรรทัด 22–24) คำนวณระยะทางบนผิวโลกจาก lat/lng: `6371 × 2 × asin(√(sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlng/2)))` โดย 6371 คือรัศมีโลก (กม.)

---

### ฟังก์ชัน E: ผู้ดูแลอนุมัติประกาศ `PATCH /api/admin/items/:id/review`

ไฟล์ `backend/routes/admin.js` บรรทัด 132–156 (ทุก route ในไฟล์นี้ผ่าน `router.use(requireAuth, requireAdmin)` บรรทัด 11)

1. ตรวจ id → หาประกาศ ไม่เจอ → **404**
2. body `{ "decision": "approve" }` → `UPDATE items SET review_status = 'approved'` → แจ้งเจ้าของ → หาประกาศที่ตรงกัน
3. body `{ "decision": "reject", "reason": "..." }` → `review_status = 'rejected'` + เก็บเหตุผลใน `review_note` → แจ้งเจ้าของพร้อมเหตุผล
4. ค่าอื่น → **400**

---

## 3. คำถามที่น่าจะถูกถาม

| คำถาม | ตอบ |
|---|---|
| API คืออะไร | ช่องทางให้ Frontend ขอ/ส่งข้อมูลกับ Backend ผ่าน HTTP โดยรับ-ส่งเป็น JSON |
| REST API คือ | ใช้ URL แทน "สิ่งของ" (`/api/items`) และใช้ HTTP method แทน "การกระทำ" |
| GET / POST / PUT / PATCH / DELETE | ดึงข้อมูล / สร้างใหม่ / แก้ทั้งก้อน / แก้บางส่วน / ลบ — เช่น `PUT /api/items/5` แก้ประกาศ, `PATCH /api/items/5/status` เปลี่ยนแค่สถานะ |
| `:id` ใน URL คือ | ตัวแปรใน path เช่น `/api/items/5` → `req.params.id = "5"` |
| `req.query` กับ `req.body` | query = ค่าหลัง `?` ใน URL (ใช้กับ GET เช่น `?type=lost&page=2`) / body = JSON ที่ส่งมากับ POST/PUT |
| Status code ที่ใช้ | 200 OK · 201 สร้างแล้ว · 204 ลบแล้ว ไม่มีเนื้อหา · 400 ข้อมูลผิด · 401 ยังไม่ล็อกอิน · 403 ไม่มีสิทธิ์ · 404 ไม่พบ · 409 ซ้ำ (เช่น username ซ้ำ) · 429 ส่งถี่เกิน |
| เก็บรหัสผ่านยังไง | เก็บเป็น bcrypt hash (`bcrypt.hash(password, 10)`) ย้อนกลับเป็นรหัสจริงไม่ได้ ตอนล็อกอินใช้ `bcrypt.compare` |
| ทำไมใช้ JWT | Server ไม่ต้องจำ session แค่ตรวจลายเซ็นของ token ก็รู้ว่าใคร |
| กัน SQL Injection ยังไง | ใช้ parameterized query `$1, $2` ไม่เอาข้อความผู้ใช้มาต่อเป็น SQL |
| กัน XSS ยังไง | ฝั่งเว็บใช้ฟังก์ชัน `esc()` แปลง `< > & " '` ก่อนแสดงผล |
| `async/await` คือ | รอผลจากฐานข้อมูลโดยไม่บล็อก server ทั้งตัว |
| Transaction คือ | ทำหลายคำสั่ง SQL แบบ "สำเร็จทั้งหมดหรือไม่เกิดเลย" (BEGIN/COMMIT/ROLLBACK) |
| ถ้า error ตรงไหนจัดการยังไง | `throw badRequest(...)` แล้ว error handler ใน `server.js` บรรทัด 43 แปลงเป็น JSON + status code ให้ |
| รูปภาพเก็บที่ไหน | ย่อรูปในเบราว์เซอร์ → ส่งเป็น base64 → เก็บเป็น `bytea` ในตาราง `images` → ดูผ่าน `GET /api/images/:id` |

---

## 4. ฐานข้อมูล

### ความสัมพันธ์ระหว่างตาราง

```
users (id PK)
  ├──< items.reporter_id         1 คน ลงได้หลายประกาศ        ON DELETE CASCADE
  ├──< sightings.user_id         1 คน แจ้งได้หลายเบาะแส
  ├──< notifications.user_id     1 คน มีหลายการแจ้งเตือน
  ├──< reports.user_id
  └──< login_history.user_id                                  ON DELETE SET NULL

items (id PK)
  ├──< sightings.item_id         1 ประกาศ มีหลายเบาะแส       ON DELETE CASCADE
  ├──< reports.item_id           UNIQUE(item_id, user_id) = 1 คนรายงานได้ 1 ครั้ง
  ├──< notifications.item_id
  └──> images.id (image_id)      1 ประกาศ มีรูป 1 รูป
```

- **PK (Primary Key)** = `id SERIAL` เลขรันอัตโนมัติ ไม่ซ้ำ
- **FK (Foreign Key)** = `REFERENCES users(id)` ทำให้ใส่ id ที่ไม่มีอยู่จริงไม่ได้
- **ON DELETE CASCADE** = ลบประกาศ → เบาะแส รายงาน การแจ้งเตือนของประกาศนั้นถูกลบตาม
- **ON DELETE SET NULL** = ลบผู้ใช้ → ประวัติล็อกอินยังอยู่ แต่ user_id เป็นค่าว่าง
- **CHECK** = จำกัดค่า เช่น `type IN ('lost','found')`, `role IN ('user','admin')`
- **INDEX** = ทำให้ค้นหา/เรียงเร็วขึ้น เช่น `items_created_at_idx` สำหรับเรียงประกาศล่าสุด
- **VIEW** `login_emails` = ตารางเสมือนที่สรุปจาก `login_history` (ไม่ได้เก็บข้อมูลซ้ำ)
- ตารางทั้งหมดสร้างจาก `backend/schema.sql` อัตโนมัติตอนเปิดเซิร์ฟเวอร์ (`db.js` บรรทัด 64)

### เปิดดูใน pgAdmin
1. เปิด pgAdmin 4 → **Servers → PostgreSQL → Databases → pawspot → Schemas → public → Tables**
2. คลิกขวาที่ตาราง → **View/Edit Data → All Rows**
3. ดูโครงสร้างตาราง: คลิกขวา → **Properties → Columns / Constraints**
4. รัน SQL เอง: คลิกที่ฐานข้อมูล `pawspot` → **Tools → Query Tool** → เปิดไฟล์ [`docs/demo-queries.sql`](demo-queries.sql) แล้วเลือกคำสั่งที่จะรัน กด **F5**
5. ดูแผนภาพความสัมพันธ์: คลิกขวาที่ `pawspot` → **ERD For Database**

### สาธิตสด: ข้อมูลไหลจากเว็บลงฐานข้อมูล
1. เปิดเว็บ ลงประกาศใหม่ด้วยบัญชี `user`
2. ใน pgAdmin รัน `SELECT id, name, review_status FROM items ORDER BY id DESC LIMIT 3;` → เห็นประกาศใหม่ สถานะ `pending`
3. ล็อกอิน `admin` กดอนุมัติ → รันคำสั่งเดิมอีกครั้ง → เปลี่ยนเป็น `approved`
4. รัน `SELECT * FROM notifications ORDER BY id DESC LIMIT 5;` → เห็นการแจ้งเตือนที่เกิดขึ้น
