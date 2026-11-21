// Input checks with Thai messages (the database CHECK constraints are a second safety net)
const { CATEGORIES } = require('./constants');
const { badRequest } = require('./errors');

const today = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// field -> [max length, Thai label, required]
const ITEM_TEXT = {
    name: [80, 'ชื่อสัตว์เลี้ยง / หัวข้อ', true],
    breed: [60, 'สายพันธุ์', false],
    genderAge: [60, 'เพศ & อายุ', false],
    location: [120, 'สถานที่', true],
    reward: [60, 'สินน้ำใจ', false],
    desc: [1000, 'จุดสังเกต / รายละเอียด', true],
    contact: [120, 'ข้อมูลติดต่อ', true],
};

function validateItem(body) {
    const b = body || {};
    const out = {};

    if (b.type !== 'lost' && b.type !== 'found') throw badRequest('ประเภทเคสไม่ถูกต้อง');
    out.type = b.type;

    for (const [field, [max, label, required]] of Object.entries(ITEM_TEXT)) {
        const v = String(b[field] ?? '').trim();
        if (required && !v) throw badRequest(`กรุณากรอก${label}`);
        if (v.length > max) throw badRequest(`${label}ยาวเกิน ${max} ตัวอักษร`);
        out[field] = v;
    }

    const category = String(b.category ?? '');
    if (!category) throw badRequest('กรุณาเลือกหมวดสัตว์เลี้ยง');
    if (!CATEGORIES.includes(category)) throw badRequest('หมวดสัตว์เลี้ยงไม่ถูกต้อง');
    out.category = category;

    const eventDate = String(b.eventDate ?? '');
    if (!eventDate) throw badRequest('กรุณาเลือกวันที่หาย / วันที่พบ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(eventDate))) throw badRequest('รูปแบบวันที่ไม่ถูกต้อง');
    if (eventDate > today()) throw badRequest('วันที่ต้องไม่เป็นวันในอนาคต');
    out.eventDate = eventDate;

    // Map pin (optional): both or neither
    const hasLat = b.lat !== undefined && b.lat !== null && b.lat !== '';
    const hasLng = b.lng !== undefined && b.lng !== null && b.lng !== '';
    if (hasLat !== hasLng) throw badRequest('ตำแหน่งบนแผนที่ไม่ครบ');
    if (hasLat) {
        const lat = Number(b.lat);
        const lng = Number(b.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            throw badRequest('ตำแหน่งบนแผนที่ไม่ถูกต้อง');
        }
        out.lat = Math.round(lat * 1e6) / 1e6;
        out.lng = Math.round(lng * 1e6) / 1e6;
    } else {
        out.lat = null;
        out.lng = null;
    }

    return out;
}

function validateReport(body) {
    const reason = String(body?.reason ?? '').trim();
    if (!reason) throw badRequest('กรุณาระบุเหตุผลที่แจ้ง');
    if (reason.length > 300) throw badRequest('เหตุผลยาวเกิน 300 ตัวอักษร');
    return { reason };
}

function validateProfile(body) {
    const out = {};
    if (body?.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) throw badRequest('กรุณากรอกชื่อที่แสดง');
        if (name.length > 40) throw badRequest('ชื่อที่แสดงยาวเกิน 40 ตัวอักษร');
        out.name = name;
    }
    if (body?.email !== undefined) {
        const email = String(body.email).trim().toLowerCase();
        if (!email) throw badRequest('กรุณากรอกอีเมล');
        if (email.length > 100 || !EMAIL_RE.test(email)) throw badRequest('รูปแบบอีเมลไม่ถูกต้อง');
        out.email = email;
    }
    return out;
}

function validateSighting(body) {
    const text = String(body?.text ?? '').trim();
    const location = String(body?.location ?? '').trim();
    if (!text) throw badRequest('กรุณากรอกรายละเอียดเบาะแส');
    if (text.length > 500) throw badRequest('รายละเอียดเบาะแสยาวเกิน 500 ตัวอักษร');
    if (location.length > 120) throw badRequest('สถานที่ยาวเกิน 120 ตัวอักษร');
    return { text, location };
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRegistration(body) {
    const name = String(body?.name ?? '').trim();
    const username = String(body?.username ?? '').trim().toLowerCase();
    const email = String(body?.email ?? '').trim().toLowerCase() || null;
    const password = String(body?.password ?? '');

    if (!name) throw badRequest('กรุณากรอกชื่อที่แสดง');
    if (name.length > 40) throw badRequest('ชื่อที่แสดงยาวเกิน 40 ตัวอักษร');
    if (!USERNAME_RE.test(username)) throw badRequest('ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ _ จำนวน 3-20 ตัว');
    if (!email) throw badRequest('กรุณากรอกอีเมล');
    if (email.length > 100 || !EMAIL_RE.test(email)) throw badRequest('รูปแบบอีเมลไม่ถูกต้อง');
    if (password.length < 4) throw badRequest('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
    if (password.length > 100) throw badRequest('รหัสผ่านยาวเกินไป');
    return { name, username, email, password };
}

// Route ids are SERIAL integers
const isId = v => /^\d{1,9}$/.test(String(v));

module.exports = { validateItem, validateSighting, validateRegistration, validateReport, validateProfile, isId };
