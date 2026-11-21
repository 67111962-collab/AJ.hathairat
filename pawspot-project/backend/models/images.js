const config = require('../config');
const { query } = require('../db');
const { HttpError, badRequest } = require('../errors');

// Parses a "data:image/...;base64,..." string, checks type and size
function parseDataUrl(dataUrl) {
    const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
    if (!match) throw badRequest('รูปภาพต้องเป็นไฟล์ JPG, PNG, WEBP หรือ GIF');
    const data = Buffer.from(match[2], 'base64');
    if (data.length > config.maxImageBytes) throw new HttpError(413, 'รูปภาพมีขนาดใหญ่เกินไป');
    return { data, contentType: match[1] };
}

// `db` may be a transaction client
async function create(db, { data, contentType }, ownerId) {
    const { rows } = await db.query(
        'INSERT INTO images (data, content_type, size, owner_id) VALUES ($1, $2, $3, $4) RETURNING id',
        [data, contentType, data.length, ownerId],
    );
    return rows[0].id;
}

async function findById(id) {
    const { rows } = await query('SELECT data, content_type FROM images WHERE id = $1', [id]);
    return rows[0] || null;
}

const remove = (db, id) => db.query('DELETE FROM images WHERE id = $1', [id]);

module.exports = { parseDataUrl, create, findById, remove };
