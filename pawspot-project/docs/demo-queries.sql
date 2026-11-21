-- PawSpot: SQL สำหรับสาธิตใน pgAdmin (Query Tool บนฐานข้อมูล pawspot)
-- เลือกคำสั่งที่ต้องการ (ลากคลุม) แล้วกด F5 เพื่อรันเฉพาะคำสั่งนั้น
-- ทุกคำสั่งเป็น SELECT (อ่านอย่างเดียว) ไม่แก้ข้อมูล

-- 1) ดูผู้ใช้ทั้งหมด (รหัสผ่านเป็น hash อ่านไม่ออก)
SELECT id, username, name, email, role, banned, left(password_hash, 20) || '...' AS password_hash, created_at
FROM users
ORDER BY id;

-- 2) ประกาศล่าสุด พร้อมชื่อคนลง (JOIN 2 ตาราง)
SELECT i.id, i.type, i.name, i.category, i.status, i.review_status, u.username AS reporter, i.created_at
FROM items i
JOIN users u ON u.id = i.reporter_id
ORDER BY i.created_at DESC;

-- 3) ประกาศที่รอผู้ดูแลอนุมัติ
SELECT id, name, review_status, created_at
FROM items
WHERE review_status = 'pending';

-- 4) นับประกาศแยกตามประเภทและสถานะ (GROUP BY)
SELECT type, status, count(*) AS total
FROM items
GROUP BY type, status
ORDER BY type, status;

-- 5) ประกาศแต่ละอันมีเบาะแสกี่รายการ (LEFT JOIN + COUNT)
SELECT i.id, i.name, count(s.id) AS sightings
FROM items i
LEFT JOIN sightings s ON s.item_id = i.id
GROUP BY i.id, i.name
ORDER BY sightings DESC, i.id;

-- 6) เบาะแสทั้งหมด: ใครแจ้ง ในประกาศไหน (JOIN 3 ตาราง)
SELECT s.id, i.name AS item, u.username AS sent_by, s.text, s.created_at
FROM sightings s
JOIN items i ON i.id = s.item_id
JOIN users u ON u.id = s.user_id
ORDER BY s.created_at DESC;

-- 7) การแจ้งเตือนล่าสุด และส่งถึงใคร
SELECT n.id, u.username AS to_user, n.type, n.message, n.read_at IS NOT NULL AS is_read, n.created_at
FROM notifications n
JOIN users u ON u.id = n.user_id
ORDER BY n.created_at DESC
LIMIT 20;

-- 8) ประวัติเข้าสู่ระบบ 20 ครั้งล่าสุด (ทั้งสำเร็จและไม่สำเร็จ)
SELECT created_at, username, email, method, success, ip
FROM login_history
ORDER BY created_at DESC
LIMIT 20;

-- 9) View: อีเมลที่เคยล็อกอินสำเร็จ
SELECT * FROM login_emails ORDER BY last_login DESC;

-- 10) จับคู่ประกาศ "หาย" กับ "พบ" ที่ใกล้กันไม่เกิน 5 กม. (สูตร Haversine แบบเดียวกับใน backend/models/items.js)
SELECT lost.name AS lost_pet, found.name AS found_pet, lost.category,
       round((6371 * 2 * asin(sqrt(
           power(sin(radians(found.lat - lost.lat) / 2), 2) +
           cos(radians(lost.lat)) * cos(radians(found.lat)) * power(sin(radians(found.lng - lost.lng) / 2), 2))))::numeric, 2) AS km
FROM items lost
JOIN items found ON found.type = 'found' AND found.category = lost.category
WHERE lost.type = 'lost'
  AND lost.lat IS NOT NULL AND found.lat IS NOT NULL
  AND (6371 * 2 * asin(sqrt(
           power(sin(radians(found.lat - lost.lat) / 2), 2) +
           cos(radians(lost.lat)) * cos(radians(found.lat)) * power(sin(radians(found.lng - lost.lng) / 2), 2)))) <= 5
ORDER BY km;

-- 11) โครงสร้างตาราง items: คอลัมน์และชนิดข้อมูล
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'items'
ORDER BY ordinal_position;

-- 12) Foreign key ทั้งหมด: ตารางไหนอ้างถึงตารางไหน และลบแล้วเกิดอะไรขึ้น
SELECT tc.table_name, kcu.column_name, ccu.table_name AS references_table, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, kcu.column_name;
