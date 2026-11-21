const express = require('express');
const bcrypt = require('bcryptjs');
const users = require('../models/users');
const logins = require('../models/logins');
const { validateRegistration } = require('../validation');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// --- very small in-memory limiter for login attempts (per IP + username) ---
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function tooManyAttempts(key) {
    const entry = attempts.get(key);
    if (!entry || Date.now() - entry.first > WINDOW_MS) return false;
    return entry.count >= MAX_ATTEMPTS;
}
function recordFailure(key) {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || now - entry.first > WINDOW_MS) attempts.set(key, { first: now, count: 1 });
    else entry.count++;
}

router.post('/register', async (req, res) => {
    const { name, username, email, password } = validateRegistration(req.body);

    if (await users.usernameExists(username)) return res.status(409).json({ message: 'ชื่อผู้ใช้นี้มีผู้ใช้งานแล้ว' });
    if (email && await users.emailExists(email)) return res.status(409).json({ message: 'อีเมลนี้ถูกใช้สมัครแล้ว' });

    const user = await users.create({ name, username, email, passwordHash: await bcrypt.hash(password, 10) });
    await logins.record(req, { user, method: 'register', success: true });
    res.status(201).json({ token: signToken(user), user: users.toPublic(user) });
});

router.post('/login', async (req, res) => {
    // "username" may be either the username or the email address
    const identifier = String(req.body?.username ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const key = `${req.ip}|${identifier}`;

    if (!identifier || !password) return res.status(400).json({ message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    if (tooManyAttempts(key)) {
        return res.status(429).json({ message: 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที' });
    }
    const user = identifier.includes('@') ? await users.findByEmail(identifier) : await users.findByUsername(identifier);
    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
        recordFailure(key);
        await logins.record(req, { user, identifier, method: 'password', success: false });
        return res.status(401).json({ message: 'ชื่อผู้ใช้ อีเมล หรือรหัสผ่านไม่ถูกต้อง' });
    }
    attempts.delete(key);
    if (user.banned) {
        await logins.record(req, { user, method: 'password', success: false });
        return res.status(403).json({ message: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
    }
    await logins.record(req, { user, method: 'password', success: true });
    res.json({ token: signToken(user), user: users.toPublic(user) });
});

router.get('/me', requireAuth, (req, res) => {
    res.json({ user: users.toPublic(req.user) });
});

module.exports = router;
