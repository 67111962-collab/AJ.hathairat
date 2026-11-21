const express = require('express');
const items = require('../models/items');
const images = require('../models/images');
const notifications = require('../models/notifications');
const { query, transaction } = require('../db');
const { validateItem, validateSighting, validateReport, isId } = require('../validation');
const { optionalAuth, requireAuth, isAdmin, isSameUser } = require('../middleware/auth');

const router = express.Router();

const canManage = (user, item) => isAdmin(user) || isSameUser(user, item.reporter_id);
const viewerOf = req => ({ id: req.user?.id || null, admin: isAdmin(req.user) });

async function sendDetail(req, res, id, status = 200) {
    const row = await items.findById(id);
    const sightings = await items.sightingsFor(id);
    res.status(status).json({ item: items.toPublic(row, { sightings, admin: isAdmin(req.user) }) });
}

// Loads :id into req.item. Hidden posts are only visible to their owner and admins.
async function loadItem(req, res, next) {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'ไม่พบประกาศนี้' });
    const item = await items.findById(Number(req.params.id));
    if (!item || (item.hidden && !canManage(req.user, item))) {
        return res.status(404).json({ message: 'ไม่พบประกาศนี้ อาจถูกลบไปแล้ว' });
    }
    req.item = item;
    next();
}

function requireManager(req, res, next) {
    if (!canManage(req.user, req.item)) return res.status(403).json({ message: 'คุณไม่มีสิทธิ์จัดการประกาศนี้' });
    next();
}

function listFilters(req) {
    const { type, category, status, q, mine } = req.query;
    return {
        type: type === 'lost' || type === 'found' ? type : null,
        status: status === 'pending' || status === 'returned' ? status : null,
        category: category && category !== 'all' ? String(category) : null,
        reporterId: mine === '1' && req.user ? req.user.id : null,
        terms: String(q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 8).map(t => t.slice(0, 50)),
        viewer: viewerOf(req),
    };
}

// ---------------------------------------------------------------- list
router.get('/', optionalAuth, async (req, res) => {
    if (req.query.mine === '1' && !req.user) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));

    const { rows, total } = await items.list({ ...listFilters(req), sort: String(req.query.sort ?? 'newest'), page, limit });
    const admin = isAdmin(req.user);
    res.json({ items: rows.map(r => items.toPublic(r, { admin })), total, page, pages: Math.ceil(total / limit) });
});

// ---------------------------------------------------------------- map pins
router.get('/map', optionalAuth, async (req, res) => {
    if (req.query.mine === '1' && !req.user) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' });
    res.json({ points: await items.mapPoints(listFilters(req)) });
});

// ---------------------------------------------------------------- stats
router.get('/stats', async (req, res) => res.json(await items.stats()));

// ---------------------------------------------------------------- read one
router.get('/:id', optionalAuth, loadItem, (req, res) => sendDetail(req, res, req.item.id));

// Posts that might be the same pet (opposite type, same category, nearby, similar date)
router.get('/:id/matches', optionalAuth, loadItem, async (req, res) => {
    const matches = await items.findMatches(req.item, { limit: 6 });
    const rows = await Promise.all(matches.map(m => items.findById(m.id)));
    res.json({
        matches: rows.filter(Boolean).map((r, i) => ({ ...items.toPublic(r), km: Math.round(matches[i].km * 10) / 10 })),
    });
});

// ---------------------------------------------------------------- create
router.post('/', requireAuth, async (req, res) => {
    const data = validateItem(req.body);
    const image = req.body.image ? images.parseDataUrl(req.body.image) : null;

    const id = await transaction(async db => {
        const imageId = image ? await images.create(db, image, req.user.id) : null;
        return items.create(db, data, req.user.id, imageId);
    });
    await notifications.notifyMatches(await items.findById(id));
    await sendDetail(req, res, id, 201);
});

// ---------------------------------------------------------------- update
router.put('/:id', requireAuth, loadItem, requireManager, async (req, res) => {
    const data = validateItem(req.body);
    // image: data URL = replace, null = remove, anything else (e.g. current URL) = keep
    const { image } = req.body;
    const newImage = typeof image === 'string' && image.startsWith('data:') ? images.parseDataUrl(image) : null;
    const oldImageId = req.item.image_id;

    await transaction(async db => {
        let imageChange;   // undefined = keep
        if (newImage) imageChange = await images.create(db, newImage, req.user.id);
        else if (image === null) imageChange = null;
        await items.update(db, req.item.id, data, imageChange);
        if (imageChange !== undefined && oldImageId) await images.remove(db, oldImageId);
    });
    await notifications.notifyMatches(await items.findById(req.item.id));
    await sendDetail(req, res, req.item.id);
});

// ---------------------------------------------------------------- status
router.patch('/:id/status', requireAuth, loadItem, requireManager, async (req, res) => {
    const { status } = req.body ?? {};
    if (status !== 'pending' && status !== 'returned') return res.status(400).json({ message: 'สถานะไม่ถูกต้อง' });
    await items.setStatus(req.item.id, status);
    await sendDetail(req, res, req.item.id);
});

// ---------------------------------------------------------------- delete
router.delete('/:id', requireAuth, loadItem, requireManager, async (req, res) => {
    await transaction(async db => {
        await items.remove(db, req.item.id);   // sightings, reports, notifications are removed by ON DELETE CASCADE
        if (req.item.image_id) await images.remove(db, req.item.image_id);
    });
    res.status(204).end();
});

// ---------------------------------------------------------------- sightings
router.post('/:id/sightings', requireAuth, loadItem, async (req, res) => {
    if (req.item.status === 'returned') return res.status(400).json({ message: 'ประกาศนี้ปิดเคสแล้ว' });
    const sighting = validateSighting(req.body);
    await items.addSighting(req.item.id, req.user.id, sighting);
    await notifications.create({
        userId: req.item.reporter_id, type: 'sighting', itemId: req.item.id, actorId: req.user.id,
        message: `${req.user.name} แจ้งเบาะแสในประกาศ "${req.item.name}": ${sighting.text.slice(0, 120)}`,
    });
    await sendDetail(req, res, req.item.id, 201);
});

router.delete('/:id/sightings/:sid', requireAuth, loadItem, async (req, res) => {
    const sighting = isId(req.params.sid) ? await items.findSighting(req.item.id, Number(req.params.sid)) : null;
    if (!sighting) return res.status(404).json({ message: 'ไม่พบเบาะแสนี้' });
    if (!canManage(req.user, req.item) && !isSameUser(req.user, sighting.user_id)) {
        return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ลบเบาะแสนี้' });
    }
    await items.removeSighting(sighting.id);
    await sendDetail(req, res, req.item.id);
});

// ---------------------------------------------------------------- report a fake / scam post
router.post('/:id/report', requireAuth, loadItem, async (req, res) => {
    if (isSameUser(req.user, req.item.reporter_id)) return res.status(400).json({ message: 'ไม่สามารถแจ้งประกาศของตัวเองได้' });
    const { reason } = validateReport(req.body);
    const { rows: [saved] } = await query(
        `INSERT INTO reports (item_id, user_id, reason) VALUES ($1, $2, $3)
         ON CONFLICT (item_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, resolved = false, created_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [req.item.id, req.user.id, reason],
    );
    if (!saved.inserted) {
        return res.json({ ok: true, message: 'อัปเดตรายงานเดิมของคุณแล้ว ขอบคุณครับ' });   // don't notify admins twice
    }
    // tell the admins
    const { rows: admins } = await query("SELECT id FROM users WHERE role = 'admin'");
    for (const a of admins) {
        await notifications.create({
            userId: a.id, type: 'report', itemId: req.item.id, actorId: req.user.id,
            message: `มีผู้แจ้งว่าประกาศ "${req.item.name}" อาจไม่ถูกต้อง: ${reason.slice(0, 120)}`,
        });
    }
    res.status(201).json({ ok: true, message: 'ส่งรายงานให้ผู้ดูแลแล้ว ขอบคุณครับ' });
});

module.exports = router;
