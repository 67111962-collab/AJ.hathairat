// Place search for the map picker: /api/geocode?q=...
// Uses OpenStreetMap Nominatim (free). Its usage policy asks for: an identifying User-Agent,
// at most 1 request per second, caching, and no search-as-you-type - so the page only
// searches when the user presses Enter / the search button, and this route caches + throttles.
const express = require('express');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = `PawSpot/1.0 (lost and found pets board; ${config.publicUrl})`;
const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;

const cache = new Map();          // query -> { at, results }
let nextSlot = 0;                 // earliest time the next upstream request may start

// Waits so that upstream requests are at least 1.1 s apart (shared by all users)
function throttle() {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + 1100;
    return new Promise(resolve => setTimeout(resolve, wait));
}

function shortName(r) {
    const a = r.address || {};
    const main = r.name || a.road || a.suburb || a.city_district || '';
    const area = [a.suburb || a.quarter, a.city_district || a.district || a.county, a.city || a.state]
        .filter(Boolean).filter(v => v !== main);
    return [main, ...new Set(area)].filter(Boolean).slice(0, 3).join(', ') || r.display_name;
}

router.get('/', requireAuth, async (req, res) => {
    const q = String(req.query.q ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (q.length < 2) return res.status(400).json({ message: 'พิมพ์ชื่อสถานที่อย่างน้อย 2 ตัวอักษร' });
    const key = q.toLowerCase();

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return res.json({ results: hit.results, cached: true });

    if (nextSlot - Date.now() > 8000) {   // too many people searching at once
        return res.status(429).json({ message: 'มีการค้นหาเยอะเกินไป กรุณารอสักครู่แล้วลองใหม่' });
    }
    await throttle();

    const url = `${NOMINATIM}?${new URLSearchParams({
        q, format: 'jsonv2', addressdetails: '1', limit: '6', countrycodes: 'th', 'accept-language': 'th,en',
    })}`;
    let data;
    try {
        const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
        data = await r.json();
    } catch (err) {
        console.error('[geocode]', err.message);
        return res.status(502).json({ message: 'ค้นหาสถานที่ไม่สำเร็จ กรุณาลองใหม่ หรือคลิกปักหมุดบนแผนที่เอง' });
    }

    const results = (Array.isArray(data) ? data : []).map(r => ({
        name: shortName(r),
        fullName: r.display_name,
        lat: Number(r.lat),
        lng: Number(r.lon),
        type: r.type,
    })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));

    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), results });
    res.json({ results });
});

module.exports = router;
