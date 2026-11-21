const { query } = require('../db');

const SELECT_ITEM = `
    SELECT i.*,
           u.username AS reporter_username,
           u.name     AS reporter_name,
           u.avatar_url AS reporter_avatar,
           (SELECT count(*)::int FROM sightings s WHERE s.item_id = i.id) AS sighting_count,
           (SELECT count(*)::int FROM reports r WHERE r.item_id = i.id AND NOT r.resolved) AS report_count
    FROM items i
    JOIN users u ON u.id = i.reporter_id`;

const SEARCH_COLUMNS = ['i.name', 'i.location', 'i.breed', 'i.description', 'i.category', 'i.gender_age'];

const SORTS = {
    newest: 'i.created_at DESC, i.id DESC',
    oldest: 'i.created_at ASC, i.id ASC',
    event: 'i.event_date DESC, i.created_at DESC, i.id DESC',
};

// Distance in km between items.i and a point given as SQL params (haversine)
const distanceSql = (latP, lngP) => `(6371 * 2 * asin(sqrt(
    power(sin(radians(i.lat - ${latP}) / 2), 2) +
    cos(radians(${latP})) * cos(radians(i.lat)) * power(sin(radians(i.lng - ${lngP}) / 2), 2))))`;

// API shape. `admin` adds moderation fields.
function toPublic(row, { sightings, admin = false } = {}) {
    const out = {
        id: String(row.id),
        type: row.type,
        name: row.name,
        category: row.category,
        breed: row.breed,
        genderAge: row.gender_age,
        location: row.location,
        lat: row.lat,
        lng: row.lng,
        eventDate: row.event_date,
        reward: row.reward,
        desc: row.description,
        contact: row.contact,
        status: row.status,
        hidden: row.hidden,
        image: row.image_id ? `/api/images/${row.image_id}` : row.image_url,
        reporter: {
            id: String(row.reporter_id), username: row.reporter_username,
            name: row.reporter_name, avatarUrl: row.reporter_avatar || null,
        },
        sightingCount: row.sighting_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
    if (admin) out.reportCount = row.report_count;
    if (sightings) out.sightings = sightings.map(sightingToPublic);
    return out;
}

function sightingToPublic(s) {
    return {
        id: String(s.id),
        text: s.text,
        location: s.location,
        user: { id: String(s.user_id), username: s.username, name: s.user_name },
        createdAt: s.created_at,
    };
}

// Escape % and _ so user input is matched literally by ILIKE
const likePattern = term => `%${term.replace(/[\\%_]/g, c => `\\${c}`)}%`;

// Builds the WHERE clause shared by the list and the map.
// viewer: { id, admin } - hidden posts are only shown to their owner and to admins.
function buildWhere({ type, category, status, reporterId, terms = [], hiddenOnly = false, viewer = {} }) {
    const where = [];
    const params = [];
    const add = value => { params.push(value); return `$${params.length}`; };

    if (!viewer.admin) {
        where.push(viewer.id ? `(NOT i.hidden OR i.reporter_id = ${add(viewer.id)})` : 'NOT i.hidden');
    }
    if (hiddenOnly) where.push('i.hidden');
    if (type) where.push(`i.type = ${add(type)}`);
    if (status) where.push(`i.status = ${add(status)}`);
    if (category) where.push(`i.category = ${add(category)}`);
    if (reporterId) where.push(`i.reporter_id = ${add(reporterId)}`);
    for (const term of terms) {
        const p = add(likePattern(term));
        where.push(`(${SEARCH_COLUMNS.map(c => `${c} ILIKE ${p}`).join(' OR ')})`);
    }
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params, add };
}

async function list({ sort = 'newest', page = 1, limit = 12, reportedOnly = false, ...filters }) {
    const { whereSql, params, add } = buildWhere(filters);
    const extra = reportedOnly
        ? `${whereSql ? `${whereSql} AND` : 'WHERE'} EXISTS (SELECT 1 FROM reports r WHERE r.item_id = i.id AND NOT r.resolved)`
        : whereSql;
    const countRes = await query(`SELECT count(*)::int AS n FROM items i ${extra}`, params);
    const rowsRes = await query(
        `${SELECT_ITEM} ${extra} ORDER BY ${SORTS[sort] || SORTS.newest} LIMIT ${add(limit)} OFFSET ${add((page - 1) * limit)}`,
        params,
    );
    return { rows: rowsRes.rows, total: countRes.rows[0].n };
}

// Light rows for the map (only posts that have a pin)
async function mapPoints(filters) {
    const { whereSql, params } = buildWhere(filters);
    const where = `${whereSql ? `${whereSql} AND` : 'WHERE'} i.lat IS NOT NULL AND i.lng IS NOT NULL`;
    const { rows } = await query(
        `SELECT i.id, i.type, i.name, i.category, i.location, i.status, i.lat, i.lng, i.event_date,
                i.image_id, i.image_url
         FROM items i ${where} ORDER BY i.created_at DESC LIMIT 500`,
        params,
    );
    return rows.map(r => ({
        id: String(r.id), type: r.type, name: r.name, category: r.category, location: r.location,
        status: r.status, lat: r.lat, lng: r.lng, eventDate: r.event_date,
        image: r.image_id ? `/api/images/${r.image_id}` : r.image_url,
    }));
}

async function findById(id) {
    const { rows } = await query(`${SELECT_ITEM} WHERE i.id = $1`, [id]);
    return rows[0] || null;
}

async function sightingsFor(itemId) {
    const { rows } = await query(
        `SELECT s.*, u.username, u.name AS user_name
         FROM sightings s JOIN users u ON u.id = s.user_id
         WHERE s.item_id = $1 ORDER BY s.created_at ASC, s.id ASC`,
        [itemId],
    );
    return rows;
}

// Tips a user has sent, with the post they belong to
async function sightingsByUser(userId) {
    const { rows } = await query(
        `SELECT s.id, s.text, s.location, s.created_at, i.id AS item_id, i.name AS item_name, i.type AS item_type,
                i.status AS item_status
         FROM sightings s JOIN items i ON i.id = s.item_id
         WHERE s.user_id = $1 AND NOT i.hidden
         ORDER BY s.created_at DESC LIMIT 100`,
        [userId],
    );
    return rows.map(r => ({
        id: String(r.id), text: r.text, location: r.location, createdAt: r.created_at,
        item: { id: String(r.item_id), name: r.item_name, type: r.item_type, status: r.item_status },
    }));
}

// `db` may be a transaction client
async function create(db, data, reporterId, imageId) {
    const { rows } = await db.query(
        `INSERT INTO items (type, name, category, breed, gender_age, location, event_date, reward, description, contact,
                            lat, lng, image_id, reporter_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [data.type, data.name, data.category, data.breed, data.genderAge, data.location, data.eventDate,
            data.reward, data.desc, data.contact, data.lat, data.lng, imageId, reporterId],
    );
    return rows[0].id;
}

// image: undefined = keep, null = remove, number = new image id
function update(db, id, data, image) {
    const params = [id, data.type, data.name, data.category, data.breed, data.genderAge, data.location,
        data.eventDate, data.reward, data.desc, data.contact, data.lat, data.lng];
    let imageSql = '';
    if (image !== undefined) {
        params.push(image);
        imageSql = `, image_id = $${params.length}, image_url = NULL`;
    }
    return db.query(
        `UPDATE items SET type = $2, name = $3, category = $4, breed = $5, gender_age = $6, location = $7,
                event_date = $8, reward = $9, description = $10, contact = $11, lat = $12, lng = $13,
                updated_at = now()${imageSql}
         WHERE id = $1`,
        params,
    );
}

const setStatus = (id, status) => query('UPDATE items SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
const setHidden = (id, hidden) => query('UPDATE items SET hidden = $2, updated_at = now() WHERE id = $1', [id, hidden]);
const remove = (db, id) => db.query('DELETE FROM items WHERE id = $1', [id]);

const addSighting = (itemId, userId, { text, location }) => query(
    'INSERT INTO sightings (item_id, user_id, text, location) VALUES ($1, $2, $3, $4)',
    [itemId, userId, text, location],
);

async function findSighting(itemId, sightingId) {
    const { rows } = await query('SELECT * FROM sightings WHERE id = $1 AND item_id = $2', [sightingId, itemId]);
    return rows[0] || null;
}

const removeSighting = id => query('DELETE FROM sightings WHERE id = $1', [id]);

// Posts of the opposite type that might be the same pet:
// same category, still open, pinned within `km`, dates within `days` of each other.
async function findMatches(item, { km = 5, days = 21, limit = 5 } = {}) {
    if (item.lat == null || item.lng == null) return [];
    const { rows } = await query(
        `SELECT i.id, i.reporter_id, i.name, ${distanceSql('$1', '$2')} AS km
         FROM items i
         WHERE i.type <> $3 AND i.category = $4 AND i.status = 'pending' AND NOT i.hidden
           AND i.id <> $5 AND i.reporter_id <> $6
           AND i.lat IS NOT NULL AND i.lng IS NOT NULL
           AND abs(i.event_date - $7::date) <= $8
           AND ${distanceSql('$1', '$2')} <= $9
         ORDER BY km ASC LIMIT $10`,
        [item.lat, item.lng, item.type, item.category, item.id, item.reporter_id, item.event_date, days, km, limit],
    );
    return rows;
}

// Public numbers (hidden posts are not counted)
async function stats() {
    const { rows } = await query(`
        SELECT count(*)::int                                                      AS total,
               count(*) FILTER (WHERE type = 'lost')::int                         AS lost,
               count(*) FILTER (WHERE type = 'found')::int                        AS found,
               count(*) FILTER (WHERE type = 'lost'  AND status = 'pending')::int AS "lostActive",
               count(*) FILTER (WHERE type = 'found' AND status = 'pending')::int AS "foundActive",
               count(*) FILTER (WHERE status = 'returned')::int                   AS returned
        FROM items WHERE NOT hidden`);
    return rows[0];
}

module.exports = {
    toPublic, list, mapPoints, findById, sightingsFor, sightingsByUser, create, update, setStatus, setHidden,
    remove, addSighting, findSighting, removeSighting, findMatches, stats,
};
