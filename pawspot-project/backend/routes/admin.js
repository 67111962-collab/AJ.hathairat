// Admin-only API: /api/admin
const express = require('express');
const items = require('../models/items');
const users = require('../models/users');
const notifications = require('../models/notifications');
const { query } = require('../db');
const { isId } = require('../validation');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const pageOf = req => Math.max(1, parseInt(req.query.page, 10) || 1);
const likeOf = q => `%${String(q).trim().slice(0, 50).replace(/[\\%_]/g, c => `\\${c}`)}%`;

// ---------------------------------------------------------------- overview
router.get('/stats', async (req, res) => {
    const { rows: [totals] } = await query(`
        SELECT
          (SELECT count(*)::int FROM users)                                                     AS users,
          (SELECT count(*)::int FROM users WHERE created_at >= now() - interval '7 days')       AS "newUsers7d",
          (SELECT count(*)::int FROM items)                                                     AS items,
          (SELECT count(*)::int FROM items WHERE status = 'returned')                           AS returned,
          (SELECT count(*)::int FROM items WHERE hidden)                                        AS hidden,
          (SELECT count(*)::int FROM items WHERE review_status = 'pending')                    AS "pendingReview",
          (SELECT count(*)::int FROM sightings)                                                 AS sightings,
          (SELECT count(DISTINCT item_id)::int FROM reports WHERE NOT resolved)                 AS "reportedItems",
          (SELECT count(*)::int FROM login_history WHERE success AND created_at >= current_date) AS "loginsToday",
          (SELECT count(*)::int FROM login_history WHERE NOT success AND created_at >= current_date) AS "failedToday"`);

    // last 30 days, one row per day (days with no activity included as 0)
    const { rows: daily } = await query(`
        WITH days AS (SELECT generate_series(current_date - 29, current_date, interval '1 day')::date AS day)
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
               (SELECT count(*)::int FROM items i WHERE i.created_at::date = d.day)                        AS posts,
               (SELECT count(*)::int FROM login_history h WHERE h.success AND h.created_at::date = d.day)  AS logins,
               (SELECT count(*)::int FROM users u WHERE u.created_at::date = d.day)                        AS signups
        FROM days d ORDER BY d.day`);

    const { rows: byCategory } = await query(`
        SELECT category, count(*)::int AS n FROM items GROUP BY category ORDER BY n DESC`);
    const { rows: byMethod } = await query(`
        SELECT method, count(*)::int AS n FROM login_history WHERE success GROUP BY method ORDER BY n DESC`);

    res.json({ totals, daily, byCategory, byMethod });
});

// ---------------------------------------------------------------- users
router.get('/users', async (req, res) => {
    const page = pageOf(req);
    const limit = 20;
    const params = [];
    let where = '';
    if (req.query.q) {
        params.push(likeOf(req.query.q));
        where = `WHERE u.username ILIKE $1 OR u.name ILIKE $1 OR u.email ILIKE $1`;
    }
    const total = (await query(`SELECT count(*)::int AS n FROM users u ${where}`, params)).rows[0].n;
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(
        `SELECT u.*,
                (SELECT count(*)::int FROM items i WHERE i.reporter_id = u.id) AS post_count,
                (SELECT count(*)::int FROM login_history h WHERE h.user_id = u.id AND h.success) AS login_count
         FROM users u ${where}
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
    );
    res.json({
        users: rows.map(u => ({
            ...users.toPublic(u), banned: u.banned, lastLoginAt: u.last_login_at,
            postCount: u.post_count, loginCount: u.login_count,
        })),
        total, page, pages: Math.ceil(total / limit),
    });
});

// body: { role?: 'user'|'admin', banned?: boolean }
router.patch('/users/:id', async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ message: 'ไม่สามารถแก้สิทธิ์หรือระงับบัญชีของตัวเองได้' });
    const target = await users.findById(id);
    if (!target) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });

    const { role, banned } = req.body ?? {};
    if (role !== undefined) {
        if (role !== 'user' && role !== 'admin') return res.status(400).json({ message: 'สิทธิ์ไม่ถูกต้อง' });
        await query('UPDATE users SET role = $2, updated_at = now() WHERE id = $1', [id, role]);
    }
    if (banned !== undefined) {
        await query('UPDATE users SET banned = $2, updated_at = now() WHERE id = $1', [id, !!banned]);
    }
    const u = await users.findById(id);
    res.json({ user: { ...users.toPublic(u), banned: u.banned } });
});

// ---------------------------------------------------------------- posts
router.get('/items', async (req, res) => {
    const page = pageOf(req);
    const filter = String(req.query.filter || 'all');
    const { rows, total } = await items.list({
        viewer: { admin: true },
        hiddenOnly: filter === 'hidden',
        reportedOnly: filter === 'reported',
        reviewStatus: ['pending', 'rejected'].includes(filter) ? filter : null,
        sort: filter === 'pending' ? 'oldest' : 'newest',   // oldest waiting first
        terms: String(req.query.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 8),
        page, limit: 20,
    });
    res.json({ items: rows.map(r => items.toPublic(r, { admin: true })), total, page, pages: Math.ceil(total / 20) });
});

// body: { hidden: boolean, reason? }
router.patch('/items/:id/hidden', async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'ไม่พบประกาศนี้' });
    const item = await items.findById(Number(req.params.id));
    if (!item) return res.status(404).json({ message: 'ไม่พบประกาศนี้' });
    const hidden = !!req.body?.hidden;
    await items.setHidden(item.id, hidden);
    if (hidden) {
        await query('UPDATE reports SET resolved = true WHERE item_id = $1', [item.id]);
        await notifications.create({
            userId: item.reporter_id, type: 'hidden', itemId: item.id, actorId: req.user.id,
            message: `ประกาศ "${item.name}" ถูกซ่อนโดยผู้ดูแลระบบ${req.body?.reason ? `: ${String(req.body.reason).slice(0, 150)}` : ''}`,
        });
    }
    res.json({ item: items.toPublic(await items.findById(item.id), { admin: true }) });
});

// body: { decision: 'approve' | 'reject', reason? }
router.patch('/items/:id/review', async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'ไม่พบประกาศนี้' });
    const item = await items.findById(Number(req.params.id));
    if (!item) return res.status(404).json({ message: 'ไม่พบประกาศนี้' });
    const { decision } = req.body ?? {};
    const reason = String(req.body?.reason ?? '').trim().slice(0, 300);

    if (decision === 'approve') {
        await items.setReview(item.id, 'approved');
        await notifications.create({
            userId: item.reporter_id, type: 'approved', itemId: item.id, actorId: req.user.id,
            message: `ประกาศ "${item.name}" ได้รับการอนุมัติแล้ว ทุกคนมองเห็นได้แล้ว`,
        });
        await notifications.notifyMatches(await items.findById(item.id));   // now it can be matched
    } else if (decision === 'reject') {
        await items.setReview(item.id, 'rejected', reason || null);
        await notifications.create({
            userId: item.reporter_id, type: 'rejected', itemId: item.id, actorId: req.user.id,
            message: `ประกาศ "${item.name}" ไม่ผ่านการอนุมัติ${reason ? `: ${reason}` : ''} แก้ไขแล้วส่งใหม่ได้`,
        });
    } else {
        return res.status(400).json({ message: 'ต้องเป็น approve หรือ reject' });
    }
    res.json({ item: items.toPublic(await items.findById(item.id), { admin: true }) });
});

// ---------------------------------------------------------------- reports
router.get('/reports', async (req, res) => {
    const open = req.query.status !== 'all';
    const { rows } = await query(
        `SELECT r.*, i.name AS item_name, i.hidden AS item_hidden, u.username, u.name AS user_name
         FROM reports r JOIN items i ON i.id = r.item_id JOIN users u ON u.id = r.user_id
         ${open ? 'WHERE NOT r.resolved' : ''}
         ORDER BY r.created_at DESC LIMIT 200`,
    );
    res.json({
        reports: rows.map(r => ({
            id: String(r.id), reason: r.reason, resolved: r.resolved, createdAt: r.created_at,
            item: { id: String(r.item_id), name: r.item_name, hidden: r.item_hidden },
            user: { username: r.username, name: r.user_name },
        })),
    });
});

router.post('/reports/:id/resolve', async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'ไม่พบรายงานนี้' });
    const { rowCount } = await query('UPDATE reports SET resolved = true WHERE id = $1', [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ message: 'ไม่พบรายงานนี้' });
    res.json({ ok: true });
});

// ---------------------------------------------------------------- login history
router.get('/logins', async (req, res) => {
    const page = pageOf(req);
    const limit = 30;
    const where = [];
    const params = [];
    if (req.query.success === 'true' || req.query.success === 'false') {
        params.push(req.query.success === 'true');
        where.push(`success = $${params.length}`);
    }
    if (req.query.q) {
        params.push(likeOf(req.query.q));
        where.push(`(email ILIKE $${params.length} OR username ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await query(`SELECT count(*)::int AS n FROM login_history ${whereSql}`, params)).rows[0].n;
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(
        `SELECT id, email, username, method, success, ip, created_at FROM login_history ${whereSql}
         ORDER BY created_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
    );
    res.json({
        logins: rows.map(r => ({ ...r, id: String(r.id), createdAt: r.created_at, created_at: undefined })),
        total, page, pages: Math.ceil(total / limit),
    });
});

module.exports = router;
