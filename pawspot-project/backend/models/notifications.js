const { query } = require('../db');
const items = require('./items');

function toPublic(n) {
    return {
        id: String(n.id),
        type: n.type,
        message: n.message,
        itemId: n.item_id ? String(n.item_id) : null,
        otherItemId: n.other_item_id ? String(n.other_item_id) : null,
        actor: n.actor_id ? { id: String(n.actor_id), name: n.actor_name } : null,
        read: !!n.read_at,
        createdAt: n.created_at,
    };
}

// Never throws: a notification problem must not break the action that caused it.
async function create({ userId, type, itemId = null, otherItemId = null, actorId = null, message }) {
    if (!userId || (actorId && String(actorId) === String(userId))) return;   // don't notify yourself
    try {
        await query(
            `INSERT INTO notifications (user_id, type, item_id, other_item_id, actor_id, message)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, type, itemId, otherItemId, actorId, String(message).slice(0, 300)],
        );
    } catch (err) {
        console.error('Could not save notification:', err.message);
    }
}

async function listFor(userId, limit = 30) {
    const { rows } = await query(
        `SELECT n.*, a.name AS actor_name
         FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
         WHERE n.user_id = $1 ORDER BY n.created_at DESC, n.id DESC LIMIT $2`,
        [userId, limit],
    );
    const unread = await query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId]);
    return { notifications: rows.map(toPublic), unread: unread.rows[0].n };
}

function markRead(userId, ids) {
    if (Array.isArray(ids) && ids.length) {
        return query(
            'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND id = ANY($2::int[])',
            [userId, ids.map(Number).filter(Number.isInteger)],
        );
    }
    return query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
}

// After a post is created/edited: tell both owners about possible matches (once per pair).
async function notifyMatches(item) {
    if (!item || item.review_status !== 'approved' || item.hidden) return 0;   // only public posts are matched
    try {
        const matches = await items.findMatches(item);
        for (const m of matches) {
            const exists = await query(
                `SELECT 1 FROM notifications WHERE type = 'match'
                   AND ((item_id = $1 AND other_item_id = $2) OR (item_id = $2 AND other_item_id = $1)) LIMIT 1`,
                [item.id, m.id],
            );
            if (exists.rows.length) continue;
            const km = m.km < 1 ? `${Math.round(m.km * 1000)} ม.` : `${m.km.toFixed(1)} กม.`;
            const label = item.type === 'lost' ? 'มีคนพบสัตว์ที่อาจเป็นน้องของคุณ' : 'อาจพบเจ้าของน้องที่คุณเจอแล้ว';
            const otherLabel = item.type === 'lost' ? 'มีคนตามหาสัตว์ที่อาจเป็นตัวที่คุณพบ' : 'มีคนพบสัตว์ที่อาจเป็นน้องของคุณ';
            await create({ userId: item.reporter_id, type: 'match', itemId: item.id, otherItemId: m.id,
                message: `${label}: "${m.name}" ห่างไป ${km}` });
            await create({ userId: m.reporter_id, type: 'match', itemId: m.id, otherItemId: item.id,
                message: `${otherLabel}: "${item.name}" ห่างไป ${km}` });
        }
        return matches.length;
    } catch (err) {
        console.error('Could not check matches:', err.message);
        return 0;
    }
}

// Sends the same notification to every admin (except the one who caused it)
async function notifyAdmins({ type, itemId = null, actorId = null, message, exclude = [] }) {
    try {
        const { rows } = await query("SELECT id FROM users WHERE role = 'admin' AND NOT banned");
        const skip = new Set(exclude.map(String));
        for (const a of rows) {
            if (!skip.has(String(a.id))) await create({ userId: a.id, type, itemId, actorId, message });
        }
    } catch (err) {
        console.error('Could not notify admins:', err.message);
    }
}

module.exports = { create, listFor, markRead, notifyMatches, notifyAdmins };
