const { query } = require('../db');

const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

// Saves one login attempt. Never throws: a logging problem must not block the login itself.
async function record(req, { user = null, identifier = null, providerEmail = null, method, success }) {
    const typed = identifier ? String(identifier).toLowerCase() : null;
    const email = (user && user.email)
        || (providerEmail ? String(providerEmail).toLowerCase() : null)
        || (typed && typed.includes('@') ? typed : null);
    const username = user ? user.username : (typed && !typed.includes('@') ? typed : null);
    try {
        await query(
            `INSERT INTO login_history (user_id, email, username, method, success, ip, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user ? user.id : null, clip(email, 100), clip(username, 100), method, success,
                clip(req.ip, 64), clip(req.get('user-agent'), 300)],
        );
        if (user && success) await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    } catch (err) {
        console.error('Could not save login history:', err.message);
    }
}

module.exports = { record };
