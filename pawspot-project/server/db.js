const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const config = require('./config');

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Dates (avoids timezone shifts)
types.setTypeParser(1082, v => v);

let pool = null;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

function connectionOptions(database) {
    if (config.databaseUrl) {
        const url = new URL(config.databaseUrl);
        if (database) url.pathname = `/${database}`;
        const opts = { connectionString: url.toString(), max: 5 };
        // Hosted databases (Neon, etc.) need SSL; skip it only for local servers or sslmode=disable
        if (!LOCAL_HOSTS.includes(url.hostname) && url.searchParams.get('sslmode') !== 'disable') {
            url.searchParams.delete('sslmode');           // use the explicit ssl option below instead
            url.searchParams.delete('channel_binding');
            opts.connectionString = url.toString();
            opts.ssl = { rejectUnauthorized: true };
        }
        return opts;
    }
    return { ...config.pg, database: database || config.pg.database };
}

function explain(err) {
    if (err.code === 'ECONNREFUSED') return 'เชื่อมต่อ PostgreSQL ไม่ได้ - ตรวจว่าเปิด PostgreSQL service อยู่ และ PGHOST/PGPORT ใน .env ถูกต้อง';
    if (err.code === '28P01') return 'รหัสผ่าน PostgreSQL ไม่ถูกต้อง - ตั้งค่า PGPASSWORD ใน .env ให้ตรงกับรหัสที่ใช้ตอนติดตั้ง PostgreSQL';
    if (err.code === '28000') return `ไม่มีผู้ใช้ "${config.pg.user}" ใน PostgreSQL - ตรวจ PGUSER ใน .env`;
    if (/password must be a string/i.test(err.message)) return 'ยังไม่ได้ตั้งรหัสผ่าน PostgreSQL - ใส่ PGPASSWORD ใน .env';
    return err.message;
}

// Creates the database (e.g. "pawspot") if it does not exist yet
async function ensureDatabase() {
    const probe = new Pool({ ...connectionOptions(), max: 1 });
    try {
        await probe.query('SELECT 1');
        return;
    } catch (err) {
        if (err.code !== '3D000') throw err;   // 3D000 = database does not exist
    } finally {
        await probe.end();
    }
    const name = config.databaseUrl ? new URL(config.databaseUrl).pathname.slice(1) : config.pg.database;
    const admin = new Pool({ ...connectionOptions('postgres'), max: 1 });
    try {
        await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
        console.log(`Created database "${name}"`);
    } finally {
        await admin.end();
    }
}

async function connectDB() {
    try {
        await ensureDatabase();
        pool = new Pool(connectionOptions());
        pool.on('error', err => console.error('PostgreSQL pool error:', err.message));
        await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
        const { rows } = await pool.query('SELECT current_database() AS db, current_user AS usr');
        console.log(`Connected to PostgreSQL, database "${rows[0].db}" as "${rows[0].usr}"`);
    } catch (err) {
        throw new Error(explain(err));
    }
}

async function disconnectDB() {
    if (pool) await pool.end();
    pool = null;
}

const query = (text, params) => pool.query(text, params);

// Runs fn(client) inside BEGIN ... COMMIT (ROLLBACK on error)
async function transaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { connectDB, disconnectDB, query, transaction };
