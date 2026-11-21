const path = require('path');
const express = require('express');
const config = require('./config');
const { connectDB, disconnectDB } = require('./db');
const { seedDemoData } = require('./seed');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);   // behind Render's proxy: correct req.ip and https

// Basic security headers
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
    });
    if (config.isProduction) res.set('Strict-Transport-Security', 'max-age=15552000');
    next();
});
if (process.env.LOG_REQUESTS !== 'false') app.use(require('./middleware/logger'));
app.use(express.json({ limit: '4mb' })); // photos arrive as base64 (compressed in the browser)

// --- API ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/oauth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/images', require('./routes/images'));
app.use('/api/me', require('./routes/me'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res) => res.status(404).json({ message: 'ไม่พบ API นี้' }));

// --- Frontend ---
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/favicon.ico', (req, res) => res.status(204).end()); // icon is inline in index.html

// --- Errors ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    // PostgreSQL error codes
    if (err.code === '23505') return res.status(409).json({ message: 'ข้อมูลนี้มีอยู่แล้ว' });       // unique_violation
    if (['23502', '23514', '22001', '22007', '22008', '22P02'].includes(err.code)) {          // not null / check / too long / bad value
        return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง' });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'ข้อมูลหรือรูปภาพมีขนาดใหญ่เกินไป' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'รูปแบบข้อมูลไม่ถูกต้อง' });
    if (err.status && err.status < 500) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์ กรุณาลองใหม่' });
});

async function start() {
    if (config.isProduction && !config.jwtSecret) {
        throw new Error('JWT_SECRET must be set when NODE_ENV=production');
    }
    await connectDB();
    if (config.seedDemo) await seedDemoData();
    const server = app.listen(config.port, () => {
        const url = config.isProduction ? config.publicUrl : `http://localhost:${config.port}`;
        console.log(`
🐾 PawSpot running at ${url}

  Website            ${url}
  GET    ${url}/api/items
  GET    ${url}/api/items/stats
  GET    ${url}/api/items/:id
  POST   ${url}/api/items
  PUT    ${url}/api/items/:id
  PATCH  ${url}/api/items/:id/status
  DELETE ${url}/api/items/:id
  POST   ${url}/api/items/:id/sightings
  POST   ${url}/api/auth/register
  POST   ${url}/api/auth/login
  GET    ${url}/api/auth/me
  GET    ${url}/api/items/map
  GET    ${url}/api/me
  GET    ${url}/api/notifications
  GET    ${url}/api/admin/stats        (admin)
  GET    ${url}/api/health

  Requests will be logged below (Ctrl + C to stop)
`);
    });

    const shutdown = async () => {
        server.close();
        await disconnectDB();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

if (require.main === module) {
    start().catch(err => {
        console.error('Failed to start:', err.message);
        process.exit(1);
    });
}

module.exports = { app, start };
