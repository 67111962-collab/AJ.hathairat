// Social login: /api/auth/providers, /api/auth/oauth/:provider(/callback), /api/auth/oauth/exchange
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const users = require('../models/users');
const logins = require('../models/logins');
const { signToken } = require('../middleware/auth');
const { providers, settingsFor, isConfigured } = require('../oauth-providers');

const router = express.Router();

const STATE_COOKIE = 'pawspot_oauth';
const STATE_TTL_S = 10 * 60;
const CODE_TTL_MS = 60 * 1000;
const secureCookies = config.publicUrl.startsWith('https://');

// One-time codes handed to the browser after a successful callback (exchanged for a token)
const loginCodes = new Map();

function issueLoginCode(user) {
    const now = Date.now();
    for (const [k, v] of loginCodes) if (v.expires < now) loginCodes.delete(k);
    const code = crypto.randomBytes(24).toString('base64url');
    loginCodes.set(code, { userId: user.id, expires: now + CODE_TTL_MS });
    return code;
}

function readCookie(req, name) {
    const raw = req.get('cookie') || '';
    for (const part of raw.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
}

function setStateCookie(res, value, maxAge) {
    res.append('Set-Cookie', [
        `${STATE_COOKIE}=${encodeURIComponent(value)}`,
        'Path=/api/auth/oauth', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`,
        ...(secureCookies ? ['Secure'] : []),
    ].join('; '));
}

const backToSite = (res, hash) => res.redirect(303, `/#${hash}`);

// Username from email / provider name: lowercase a-z0-9_, 3-20 chars, unique
async function uniqueUsername(email, fallback) {
    let base = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 14);
    if (base.length < 3) base = fallback;
    if (!(await users.usernameExists(base))) return base;
    for (let i = 0; i < 20; i++) {
        const candidate = `${base}_${crypto.randomInt(1000, 9999)}`;
        if (!(await users.usernameExists(candidate))) return candidate;
    }
    return `${fallback}_${crypto.randomBytes(4).toString('hex')}`;
}

async function findOrCreateUser(providerName, profile) {
    const providerId = String(profile.id);
    const email = profile.email ? String(profile.email).toLowerCase() : null;

    // 1) already linked
    const linked = await users.findByProvider(providerName, providerId);
    if (linked) return linked;

    // 2) a verified email that matches an existing account -> link it
    if (email && profile.emailVerified) {
        const existing = await users.findByEmail(email);
        if (existing) {
            // Signup never checked that email, so whoever set the old password may not own it.
            // The provider just proved who does: drop that password (they can set a new one in their profile).
            if (existing.password_hash) await users.setPassword(existing.id, null);
            return users.linkProvider(existing.id, providerName, providerId, profile.avatarUrl);
        }
    }

    // 3) new account
    const emailFree = email && !(await users.emailExists(email));
    return users.create({
        username: await uniqueUsername(email, providerName),
        name: String(profile.name || '').trim().slice(0, 40) || 'สมาชิก PawSpot',
        email: emailFree ? email : null,
        avatarUrl: profile.avatarUrl || null,
        provider: providerName,
        providerId,
    });
}

// Which providers are set up (the frontend uses this to enable buttons)
router.get('/providers', (req, res) => {
    res.json(Object.fromEntries(Object.keys(providers).map(name => [name, isConfigured(name)])));
});

// Step 1: send the browser to the provider's login page
router.get('/oauth/:provider', (req, res) => {
    const name = req.params.provider;
    if (!providers[name]) return res.status(404).json({ message: 'ไม่รองรับผู้ให้บริการนี้' });
    if (!isConfigured(name)) return backToSite(res, `oauth_error=not_configured&provider=${name}`);

    const state = crypto.randomBytes(24).toString('base64url');
    setStateCookie(res, `${name}.${state}`, STATE_TTL_S);
    res.redirect(302, providers[name].authorizeUrl({ ...settingsFor(name), state }));
});

// Step 2: the provider sends the browser back here with ?code=...&state=...
router.get('/oauth/:provider/callback', async (req, res) => {
    const name = req.params.provider;
    if (!providers[name] || !isConfigured(name)) return backToSite(res, 'oauth_error=failed');

    const expected = readCookie(req, STATE_COOKIE);
    setStateCookie(res, '', 0);   // single use

    const { code, state, error } = req.query;
    if (error) return backToSite(res, `oauth_error=cancelled&provider=${name}`);
    if (!code || !state || expected !== `${name}.${state}`) return backToSite(res, 'oauth_error=state');

    try {
        const profile = await providers[name].fetchProfile({ ...settingsFor(name), code: String(code) });
        if (!profile?.id) throw new Error('profile has no id');
        let user = await findOrCreateUser(name, profile);
        // ADMIN_EMAILS only counts when the provider has verified the email
        if (profile.emailVerified) user = await users.promoteIfAdminEmail(user);
        if (user.banned) {
            await logins.record(req, { user, providerEmail: profile.email, method: name, success: false });
            return backToSite(res, `oauth_error=banned&provider=${name}`);
        }
        // keep the email the provider gave us, even if it is not saved on the account
        await logins.record(req, { user, providerEmail: profile.email, method: name, success: true });
        return backToSite(res, `oauth=${issueLoginCode(user)}`);
    } catch (err) {
        console.error(`[oauth:${name}]`, err.message);
        return backToSite(res, `oauth_error=failed&provider=${name}`);
    }
});

// Step 3: the page trades the one-time code for a normal login token
router.post('/oauth/exchange', async (req, res) => {
    const code = String(req.body?.code ?? '');
    const entry = loginCodes.get(code);
    loginCodes.delete(code);
    if (!entry || entry.expires < Date.now()) {
        return res.status(400).json({ message: 'ลิงก์เข้าสู่ระบบหมดอายุ กรุณาลองใหม่' });
    }
    const user = await users.findById(entry.userId);
    if (!user) return res.status(400).json({ message: 'ไม่พบบัญชีผู้ใช้' });
    res.json({ token: signToken(user), user: users.toPublic(user) });
});

module.exports = router;
