const { query } = require('../db');

// social provider -> column
const PROVIDER_COLUMNS = { google: 'google_id', line: 'line_id' };

function toPublic(u) {
    return {
        id: String(u.id),
        username: u.username,
        name: u.name,
        email: u.email || null,
        avatarUrl: u.avatar_url || null,
        role: u.role,
        hasPassword: !!u.password_hash,
        providers: { google: !!u.google_id, line: !!u.line_id },
        createdAt: u.created_at,
    };
}

const one = async (sql, params) => (await query(sql, params)).rows[0] || null;

const findById = id => one('SELECT * FROM users WHERE id = $1', [id]);
const findByUsername = username => one('SELECT * FROM users WHERE username = $1', [username]);
const findByEmail = email => one('SELECT * FROM users WHERE email = $1', [email]);
const usernameExists = async username => !!(await one('SELECT 1 FROM users WHERE username = $1', [username]));
const emailExists = async email => !!(await one('SELECT 1 FROM users WHERE email = $1', [email]));

function findByProvider(provider, providerId) {
    const col = PROVIDER_COLUMNS[provider];
    return one(`SELECT * FROM users WHERE ${col} = $1`, [providerId]);
}

function create({ username, name, email = null, passwordHash = null, role = 'user', avatarUrl = null, provider = null, providerId = null }) {
    const col = provider ? PROVIDER_COLUMNS[provider] : null;
    const cols = ['username', 'name', 'email', 'password_hash', 'role', 'avatar_url', ...(col ? [col] : [])];
    const vals = [username, name, email, passwordHash, role, avatarUrl, ...(col ? [providerId] : [])];
    const ph = vals.map((_, i) => `$${i + 1}`).join(', ');
    return one(`INSERT INTO users (${cols.join(', ')}) VALUES (${ph}) RETURNING *`, vals);
}

function linkProvider(id, provider, providerId, avatarUrl) {
    const col = PROVIDER_COLUMNS[provider];
    return one(
        `UPDATE users SET ${col} = $2, avatar_url = COALESCE(avatar_url, $3), updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, providerId, avatarUrl || null],
    );
}

function updateProfile(id, { name, email, avatarUrl }) {
    const sets = [];
    const params = [id];
    const set = (col, v) => { params.push(v); sets.push(`${col} = $${params.length}`); };
    if (name !== undefined) set('name', name);
    if (email !== undefined) set('email', email);
    if (avatarUrl !== undefined) set('avatar_url', avatarUrl);
    if (!sets.length) return findById(id);
    return one(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, params);
}

// Makes the user an admin if their email is listed in ADMIN_EMAILS. Returns the (possibly updated) user.
async function promoteIfAdminEmail(user) {
    const adminEmails = require('../config').adminEmails;
    if (!user || user.role === 'admin' || !user.email || !adminEmails.includes(user.email.toLowerCase())) return user;
    const updated = await one("UPDATE users SET role = 'admin', updated_at = now() WHERE id = $1 RETURNING *", [user.id]);
    console.log(`Made ${user.username} an admin (listed in ADMIN_EMAILS)`);
    return updated || user;
}

const setPassword = (id, passwordHash) =>
    query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [id, passwordHash]);

const count = async () => (await one('SELECT count(*)::int AS n FROM users')).n;

module.exports = {
    toPublic, findById, findByUsername, findByEmail, findByProvider,
    usernameExists, emailExists, create, linkProvider, updateProfile, setPassword, promoteIfAdminEmail, count,
};
