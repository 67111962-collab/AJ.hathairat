// The logged-in user's own profile: /api/me
const express = require('express');
const bcrypt = require('bcryptjs');
const users = require('../models/users');
const items = require('../models/items');
const images = require('../models/images');
const { query } = require('../db');
const { validateProfile } = require('../validation');
const { requireAuth } = require('../middleware/auth');
const { badRequest } = require('../errors');

const router = express.Router();
router.use(requireAuth);

async function profile(userId) {
    const user = await users.findById(userId);
    const { rows } = await query(
        `SELECT
            (SELECT count(*)::int FROM items WHERE reporter_id = $1)                          AS posts,
            (SELECT count(*)::int FROM items WHERE reporter_id = $1 AND status = 'returned')  AS returned,
            (SELECT count(*)::int FROM sightings WHERE user_id = $1)                          AS sightings,
            (SELECT count(*)::int FROM login_history WHERE user_id = $1 AND success)          AS logins`,
        [userId],
    );
    return { user: users.toPublic(user), stats: rows[0] };
}

router.get('/', async (req, res) => res.json(await profile(req.user.id)));

// body: { name?, email?, avatar? }  avatar: data URL = new photo, null = remove
router.patch('/', async (req, res) => {
    const data = validateProfile(req.body);
    if (data.email && data.email !== req.user.email && await users.emailExists(data.email)) {
        return res.status(409).json({ message: 'อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว' });
    }

    const { avatar } = req.body ?? {};
    const oldAvatarId = /^\/api\/images\/(\d+)$/.exec(req.user.avatar_url || '')?.[1];
    const db = { query };
    if (typeof avatar === 'string' && avatar.startsWith('data:')) {
        const imageId = await images.create(db, images.parseDataUrl(avatar), req.user.id);
        data.avatarUrl = `/api/images/${imageId}`;
    } else if (avatar === null) {
        data.avatarUrl = null;
    }
    await users.updateProfile(req.user.id, data);
    if (data.avatarUrl !== undefined && oldAvatarId) await images.remove(db, Number(oldAvatarId));
    res.json(await profile(req.user.id));
});

// body: { currentPassword?, newPassword }  (currentPassword is not needed for Google/LINE-only accounts)
router.post('/password', async (req, res) => {
    const current = String(req.body?.currentPassword ?? '');
    const next = String(req.body?.newPassword ?? '');
    if (next.length < 4) throw badRequest('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
    if (next.length > 100) throw badRequest('รหัสผ่านยาวเกินไป');
    if (req.user.password_hash && !(await bcrypt.compare(current, req.user.password_hash))) {
        return res.status(400).json({ message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }
    await users.setPassword(req.user.id, await bcrypt.hash(next, 10));
    res.json({ ok: true, message: req.user.password_hash ? 'เปลี่ยนรหัสผ่านเรียบร้อย' : 'ตั้งรหัสผ่านเรียบร้อย ตอนนี้ล็อกอินด้วยรหัสผ่านได้แล้ว' });
});

router.get('/sightings', async (req, res) => {
    res.json({ sightings: await items.sightingsByUser(req.user.id) });
});

module.exports = router;
