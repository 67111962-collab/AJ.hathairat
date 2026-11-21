const bcrypt = require('bcryptjs');
const { transaction } = require('./db');
const users = require('./models/users');

const DAY = 86400000;
const ago = ms => new Date(Date.now() - ms);
const day = ms => {
    const d = ago(ms);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const img = id => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

// Fills an empty database with demo accounts and posts.
async function seedDemoData() {
    if (await users.count() > 0) return;

    await transaction(async db => {
        const insertUser = async (username, name, role, password) => (await db.query(
            'INSERT INTO users (username, name, email, role, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [username, name, `${username}@pawspot.test`, role, await bcrypt.hash(password, 10)],
        )).rows[0].id;
        const adminId = await insertUser('admin', 'Admin PawSpot', 'admin', '123');
        const userId = await insertUser('user', 'คุณนภา รักสัตว์', 'user', '1234');

        const posts = [
            {
                type: 'lost', name: 'น้องโมจิ (Moji)', lat: 13.903, lng: 100.528, category: 'สุนัข', breed: 'โกลเด้น รีทรีฟเวอร์', genderAge: 'ผู้ / 2 ปี',
                reward: '5,000 บาท', location: 'หมู่บ้านพฤกษา ซอย 12 (ถ.แจ้งวัฒนะ)', eventDate: day(DAY),
                desc: 'ขนสีน้ำตาลทอง ใส่ปลอกคอสีแดง มีรอยแผลเป็นเล็กๆ ที่หูขวา ตกใจเสียงประทัดแล้ววิ่งหลุดไป',
                contact: '081-999-xxxx (นภา)', reporter: userId, image: img('photo-1552053831-71594a27632d'), createdAt: ago(DAY / 2),
                sighting: { user: adminId, text: 'เห็นสุนัขสีทองคล้ายๆ น้อง เดินอยู่แถวหน้าเซเว่น ปากซอย 14 ช่วงประมาณ 2 ทุ่ม', location: 'ปากซอย 14', createdAt: ago(DAY / 4) },
            },
            {
                type: 'found', name: 'พบแมวส้มหลุดเข้ามาในบ้าน', lat: 13.756, lng: 100.565, category: 'แมว', breed: 'ไทย (แมวส้ม)', genderAge: 'เพศเมีย',
                location: 'ลานจอดรถ คอนโดลุมพินี พระราม 9', eventDate: day(DAY),
                desc: 'น้องเชื่องมาก เดินเข้ามาขออาหาร ใส่ปลอกคอสีฟ้าไม่มีป้ายชื่อ ตัวอ้วนสมบูรณ์',
                contact: 'Line: @pet_finder_admin', reporter: adminId, image: img('photo-1514888286974-6c03e2ca1dba'), createdAt: ago(DAY),
            },
            {
                type: 'lost', name: 'น้องคุกกี้ (นกค็อกคาเทล)', lat: 13.662, lng: 100.65, category: 'นก', breed: 'ค็อกคาเทล (Cockatiel)', genderAge: 'ผู้ / 1 ปี',
                reward: 'มีสินน้ำใจให้ครับ', location: 'โซนบางนา กม.4', eventDate: day(3 * DAY), status: 'returned',
                desc: 'ตัวสีแก้มส้ม ห่วงขาเบอร์ 042 บินหลุดจากกรง ร้องเสียงตามจังหวะได้',
                contact: '089-123-xxxx', reporter: adminId, image: img('photo-1522858547137-f1dcec554f55'), createdAt: ago(2 * DAY),
            },
            {
                type: 'lost', name: 'น้องถั่วแดง', lat: 13.7999, lng: 100.5502, category: 'สุนัข', breed: 'ปั๊ก (Pug)', genderAge: 'เมีย / 4 ปี',
                reward: '2,000 บาท', location: 'ตลาดนัดจตุจักร โครงการ 8', eventDate: day(3 * DAY),
                desc: 'หน้าดำ ตัวสีครีม ใส่เสื้อลายทางสีเหลือง หายใจเสียงดัง ไม่ค่อยกลัวคน ชอบขนมไก่',
                contact: '062-555-xxxx', reporter: userId, image: img('photo-1517849845537-4d257902454a'), createdAt: ago(3 * DAY),
            },
            {
                type: 'found', name: 'พบกระต่ายขาวในสวนสาธารณะ', lat: 13.8065, lng: 100.553, category: 'กระต่าย/ฟันแทะ', breed: 'ฮอลแลนด์ลอป (คาดว่า)', genderAge: 'ไม่ทราบ',
                location: 'สวนรถไฟ ใกล้ลานจอดจักรยาน', eventDate: day(5 * DAY),
                desc: 'กระต่ายสีขาวหูตก ตัวเล็ก ค่อนข้างเชื่อง ตอนนี้ฝากไว้ที่ป้อมยามสวน',
                contact: 'โทร 095-777-xxxx', reporter: adminId, image: img('photo-1585110396000-c9ffd4e4b308'), createdAt: ago(5 * DAY),
            },
        ];

        for (const p of posts) {
            const { rows } = await db.query(
                `INSERT INTO items (type, name, category, breed, gender_age, reward, location, event_date, description,
                                    contact, status, image_url, reporter_id, created_at, updated_at, lat, lng)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $15, $16) RETURNING id`,
                [p.type, p.name, p.category, p.breed, p.genderAge, p.reward || '', p.location, p.eventDate, p.desc,
                    p.contact, p.status || 'pending', p.image, p.reporter, p.createdAt, p.lat, p.lng],
            );
            if (p.sighting) {
                await db.query(
                    'INSERT INTO sightings (item_id, user_id, text, location, created_at) VALUES ($1, $2, $3, $4, $5)',
                    [rows[0].id, p.sighting.user, p.sighting.text, p.sighting.location, p.sighting.createdAt],
                );
            }
        }
    });
    console.log('Seeded demo data (accounts: admin/123, user/1234)');
}

module.exports = { seedDemoData };
