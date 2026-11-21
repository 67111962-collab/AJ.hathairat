require('dotenv').config({ quiet: true });
const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';
const env = name => (process.env[name] || '').trim();

// In production a fixed JWT_SECRET is required (checked in backend/server.js start()).
let jwtSecret = env('JWT_SECRET');
if (!jwtSecret && !isProduction) {
    jwtSecret = crypto.randomBytes(32).toString('hex');
    console.warn('⚠  JWT_SECRET is not set - using a random one. Everyone will be logged out when the server restarts.');
}

const port = Number(process.env.PORT) || 3000;

module.exports = {
    isProduction,
    port,
    // Behind a hosting proxy (Render etc.) so req.ip / https detection are correct
    trustProxy: isProduction || env('TRUST_PROXY') === 'true',
    // Public address of the site; OAuth callback URLs are built from it.
    publicUrl: (env('PUBLIC_URL') || `http://localhost:${port}`).replace(/\/+$/, ''),
    oauth: {
        google: { clientId: env('GOOGLE_CLIENT_ID'), clientSecret: env('GOOGLE_CLIENT_SECRET') },
        line: { clientId: env('LINE_CHANNEL_ID'), clientSecret: env('LINE_CHANNEL_SECRET'), scope: env('LINE_SCOPE') || 'profile openid' },
    },
    // PostgreSQL: either DATABASE_URL, or the PG* settings below
    databaseUrl: env('DATABASE_URL'),
    pg: {
        host: env('PGHOST') || 'localhost',
        port: Number(env('PGPORT')) || 5432,
        user: env('PGUSER') || 'postgres',
        password: process.env.PGPASSWORD ?? '',
        database: env('PGDATABASE') || 'pawspot',
    },
    // Users with these emails become admins when they log in (e.g. the site owner)
    adminEmails: env('ADMIN_EMAILS').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
    jwtSecret,
    jwtExpiresIn: '7d',
    seedDemo: process.env.SEED_DEMO !== 'false',
    maxImageBytes: 2.5 * 1024 * 1024,
};
