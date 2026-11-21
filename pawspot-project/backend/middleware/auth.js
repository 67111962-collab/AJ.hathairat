const jwt = require('jsonwebtoken');
const config = require('../config');
const users = require('../models/users');

function signToken(user) {
    return jwt.sign({ sub: String(user.id) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

async function userFromRequest(req) {
    const match = (req.get('authorization') || '').match(/^Bearer (.+)$/);
    if (!match) return { user: null, hadToken: false };
    try {
        const payload = jwt.verify(match[1], config.jwtSecret);
        if (!/^\d+$/.test(String(payload.sub))) return { user: null, hadToken: true };
        const user = await users.findById(Number(payload.sub));
        if (user?.banned) return { user: null, hadToken: true, banned: true };
        return { user, hadToken: true };
    } catch {
        return { user: null, hadToken: true };
    }
}

// Attaches req.user when a valid token is sent; never blocks the request.
async function optionalAuth(req, res, next) {
    req.user = (await userFromRequest(req)).user;
    next();
}

// Blocks the request unless a valid token is sent.
async function requireAuth(req, res, next) {
    const { user, hadToken, banned } = await userFromRequest(req);
    if (!user) {
        const message = banned ? 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ'
            : hadToken ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : 'กรุณาเข้าสู่ระบบ';
        return res.status(401).json({ message });
    }
    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'สำหรับผู้ดูแลระบบเท่านั้น' });
    next();
}

const isAdmin = user => user?.role === 'admin';
const isSameUser = (user, userId) => !!user && userId != null && String(user.id) === String(userId);

module.exports = { signToken, optionalAuth, requireAuth, requireAdmin, isAdmin, isSameUser };
