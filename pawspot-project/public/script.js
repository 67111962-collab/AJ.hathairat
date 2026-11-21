'use strict';

// =====================================================================
//  Config
// =====================================================================
// Keep values in sync with server/constants.js
const CATEGORIES = [
    { value: 'สุนัข', label: 'สุนัข (Dogs)', emoji: '🐕' },
    { value: 'แมว', label: 'แมว (Cats)', emoji: '🐈' },
    { value: 'นก', label: 'นก (Birds)', emoji: '🦜' },
    { value: 'กระต่าย/ฟันแทะ', label: 'กระต่าย / สัตว์ฟันแทะ', emoji: '🐰' },
    { value: 'สัตว์เลื้อยคลาน', label: 'สัตว์เลื้อยคลาน / ครึ่งบกครึ่งน้ำ', emoji: '🦎' },
    { value: 'ปลา', label: 'ปลา / สัตว์น้ำ', emoji: '🐠' },
    { value: 'สัตว์แปลก', label: 'สัตว์แปลก (Exotic Pets)', emoji: '🦔' },
    { value: 'สัตว์ใหญ่/ฟาร์ม', label: 'สัตว์ใหญ่ / สัตว์ฟาร์ม', emoji: '🐴' },
    { value: 'อุปกรณ์สัตว์เลี้ยง', label: 'อุปกรณ์สัตว์เลี้ยง', emoji: '🎾' },
    { value: 'อื่นๆ', label: 'อื่นๆ', emoji: '📦' },
];
const PAGE_SIZE = 12;
const MAX_UPLOAD_MB = 10;
const TOKEN_KEY = 'pawspot_token';

// =====================================================================
//  State
// =====================================================================
let token = storageGet(TOKEN_KEY);
let currentUser = null;

const state = { type: 'all', category: 'all', status: 'all', sort: 'newest', search: '' };
let listItems = [];         // posts currently shown in the grid
let listTotal = 0;
let listPage = 1;
let listRequestId = 0;      // ignore responses from outdated requests
let pendingImage = null;    // image in the report form: data URL (new), URL (existing) or null
let detailItem = null;      // post shown in the detail modal

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, val) {
    try { val == null ? localStorage.removeItem(key) : localStorage.setItem(key, val); } catch { /* private mode */ }
}

// =====================================================================
//  API client
// =====================================================================
class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
}

async function api(path, { method = 'GET', body } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
        res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
        throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 0);
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
        if (res.status === 401 && token) setSession(null, null);   // token expired / invalid
        throw new ApiError(data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่', res.status);
    }
    return data;
}

function setSession(newToken, user) {
    token = newToken;
    currentUser = user;
    storageSet(TOKEN_KEY, newToken);
    updateAuthUI();
}

// Runs an async action and shows its error as a toast. Returns the result or undefined.
async function attempt(fn) {
    try { return await fn(); }
    catch (err) { showToast(err.message, 'error'); }
}

// =====================================================================
//  Helpers
// =====================================================================
const $ = id => document.getElementById(id);

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const catEmoji = v => (CATEGORIES.find(c => c.value === v) || CATEGORIES[CATEGORIES.length - 1]).emoji;
const isAdmin = () => currentUser?.role === 'admin';
const isMine = ref => !!currentUser && ref?.id === currentUser.id;
const canManage = item => isAdmin() || isMine(item.reporter);
const findListItem = id => listItems.find(i => i.id === id);

function placeholderImage(category) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7ed"/><stop offset="1" stop-color="#fde68a"/></linearGradient></defs><rect width="600" height="400" fill="url(#g)"/><text x="300" y="215" font-size="140" text-anchor="middle" dominant-baseline="middle">${catEmoji(category)}</text><text x="300" y="340" font-size="26" fill="#c2410c" text-anchor="middle" font-family="sans-serif">ไม่มีรูปภาพ</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const imageFor = item => item.image || placeholderImage(item.category);

// called from <img onerror>
function imgFallback(img) {
    img.onerror = null;
    img.src = placeholderImage(img.dataset.cat);
}

function toDateInput(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatThaiDate(ymd) {
    if (!ymd) return '-';
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getTimeAgo(dateLike) {
    const seconds = Math.floor((Date.now() - new Date(dateLike)) / 1000);
    const units = [[31536000, 'ปี'], [2592000, 'เดือน'], [86400, 'วัน'], [3600, 'ชม.'], [60, 'นาที']];
    for (const [sec, label] of units) {
        const n = Math.floor(seconds / sec);
        if (n >= 1) return `${n} ${label}ที่แล้ว`;
    }
    return 'เมื่อสักครู่';
}

function phoneHref(contact) {
    const digits = String(contact).replace(/[^\d+]/g, '');
    return /^(\+66|0)\d{8,9}$/.test(digits) ? `tel:${digits}` : null;
}

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function copyText(text, msg = 'คัดลอกแล้ว') {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
    }
    showToast(msg);
}

const caseUrl = id => location.href.split('#')[0] + '#case-' + id;

function setHash(hash) {
    try { history.replaceState(null, '', hash || location.pathname + location.search); } catch { /* ignore */ }
}

function setBusy(btn, busy, html) {
    if (!btn) return;
    if (busy) {
        btn.dataset.html = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${html || 'กำลังบันทึก...'}`;
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.html || btn.innerHTML;
        btn.disabled = false;
    }
}

// =====================================================================
//  Init
// =====================================================================
document.addEventListener('DOMContentLoaded', async () => {
    $('year').textContent = new Date().getFullYear();

    const options = CATEGORIES.map(c => `<option value="${esc(c.value)}">${c.emoji} ${esc(c.label)}</option>`).join('');
    $('categoryFilter').insertAdjacentHTML('beforeend', options);
    $('itemCategory').insertAdjacentHTML('beforeend', options);

    bindEvents();
    loadProviders();

    if (await finishSocialLogin()) {
        if (!currentUser) updateAuthUI();
        return;
    }
    if (token) {
        const me = await api('/auth/me').catch(() => null);
        currentUser = me?.user || null;
        if (!currentUser) setSession(null, null);
    }
    updateAuthUI();
    openFromHash();
});

function bindEvents() {
    document.querySelectorAll('[data-filter]').forEach(btn =>
        btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
    $('categoryFilter').addEventListener('change', e => { state.category = e.target.value; loadItems(); });
    $('statusFilter').addEventListener('change', e => { state.status = e.target.value; loadItems(); });
    $('sortSelect').addEventListener('change', e => { state.sort = e.target.value; loadItems(); });
    $('searchInput').addEventListener('input', debounce(e => { state.search = e.target.value; loadItems(); }, 300));

    $('itemsGrid').addEventListener('click', e => {
        const card = e.target.closest('[data-id]');
        if (!card) return;
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            e.stopPropagation();
            runAction(actionBtn.dataset.action, findListItem(card.dataset.id), actionBtn);
        } else {
            openDetail(card.dataset.id);
        }
    });
    $('itemsGrid').addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-id]')) {
            e.preventDefault();
            openDetail(e.target.dataset.id);
        }
    });

    $('detailContent').addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (btn && detailItem) runAction(btn.dataset.action, detailItem, btn);
    });
    $('detailContent').addEventListener('submit', e => {
        if (e.target.id === 'sightingForm') submitSighting(e);
    });

    $('loginForm').addEventListener('submit', handleLogin);
    $('signupForm').addEventListener('submit', handleSignup);
    $('reportForm').addEventListener('submit', submitReport);
    $('itemImage').addEventListener('change', e => handleImageFile(e.target.files[0]));
    $('itemDesc').addEventListener('input', e => { $('descCount').textContent = e.target.value.length; });
    ['reportForm', 'loginForm', 'signupForm'].forEach(id =>
        $(id).addEventListener('input', e => e.target.classList.remove('invalid')));

    const dz = $('dropZone');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, () => dz.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, () => dz.classList.remove('dragover')));

    document.querySelectorAll('[data-toggle-password]').forEach(btn => btn.addEventListener('click', () => {
        const input = $(btn.dataset.togglePassword);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = `<i class="far ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
        btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    }));

    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => {
        if (e.target === m) closeModal(m.id);
    }));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modalStack.length) closeModal(modalStack[modalStack.length - 1]);
    });

    window.addEventListener('hashchange', openFromHash);
}

function openFromHash() {
    const m = location.hash.match(/^#case-(\d{1,9})$/);
    if (m) openDetail(m[1]);
}

function runAction(action, item, el) {
    if (!item) return;
    switch (action) {
        case 'edit': openEditModal(item); break;
        case 'delete': promptDelete(item); break;
        case 'status': toggleStatus(item, el); break;
        case 'share': shareItem(item); break;
        case 'print': printPoster(item); break;
        case 'copy-contact': copyText(item.contact, 'คัดลอกข้อมูลติดต่อแล้ว'); break;
        case 'delete-sighting': deleteSighting(item, el.dataset.sid); break;
        case 'login': closeModal('detailModal'); openModal('loginModal'); break;
        case 'open-item': openDetail(el.dataset.id); break;
        case 'report': reportPost(item); break;
        case 'admin-hide': if (typeof adminToggleHidden === 'function') adminToggleHidden(item); break;
    }
}

// =====================================================================
//  Auth
// =====================================================================
function updateAuthUI() {
    if (currentUser) {
        $('guestMenu').classList.add('hidden');
        $('userMenu').classList.remove('hidden');
        $('userNameDisplay').textContent = currentUser.name;
        $('userRoleDisplay').textContent = isAdmin() ? 'Administrator' : 'สมาชิก';
        $('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
        if (currentUser.avatarUrl) {
            const img = document.createElement('img');
            img.src = currentUser.avatarUrl;
            img.alt = '';
            img.referrerPolicy = 'no-referrer';
            img.className = 'w-full h-full rounded-full object-cover';
            img.onerror = () => { $('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase(); };
            $('userAvatar').replaceChildren(img);
        }
        $('filterMy').classList.remove('hidden');
    } else {
        $('guestMenu').classList.remove('hidden');
        $('userMenu').classList.add('hidden');
        $('filterMy').classList.add('hidden');
        if (state.type === 'my') state.type = 'all';
    }
    syncFilterButtons();
    loadItems();
    if (detailItem && modalStack.includes('detailModal')) renderDetail();
    document.dispatchEvent(new CustomEvent('pawspot:auth'));
}

function markInvalid(ids) {
    ids.forEach(id => $(id).classList.add('invalid'));
    if (ids.length) $(ids[0]).focus();
}

async function handleLogin(e) {
    e.preventDefault();
    const username = $('loginUsername').value.trim();
    const password = $('loginPassword').value;
    ['loginUsername', 'loginPassword'].forEach(id => $(id).classList.remove('invalid'));
    const missing = [!username && 'loginUsername', !password && 'loginPassword'].filter(Boolean);
    if (missing.length) {
        markInvalid(missing);
        return showToast('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 'error');
    }

    const btn = e.submitter || $('loginForm').querySelector('[type=submit]');
    setBusy(btn, true, 'กำลังเข้าสู่ระบบ...');
    const res = await attempt(() => api('/auth/login', { method: 'POST', body: { username, password } }));
    setBusy(btn, false);
    if (!res) return;

    closeModal('loginModal');
    $('loginForm').reset();
    setSession(res.token, res.user);
    showToast(`ยินดีต้อนรับ, ${res.user.name} 🐾`);
}

async function handleSignup(e) {
    e.preventDefault();
    const name = $('signupName').value.trim();
    const username = $('signupUsername').value.trim();
    const email = $('signupEmail').value.trim();
    const password = $('signupPassword').value;
    document.querySelectorAll('#signupForm .invalid').forEach(el => el.classList.remove('invalid'));

    const fail = (id, msg) => { markInvalid([id]); showToast(msg, 'error'); };
    if (!name) return fail('signupName', 'กรุณากรอกชื่อที่แสดง');
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return fail('signupUsername', 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข หรือ _ จำนวน 3-20 ตัว');
    if (!email) return fail('signupEmail', 'กรุณากรอกอีเมล');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('signupEmail', 'รูปแบบอีเมลไม่ถูกต้อง');
    if (password.length < 4) return fail('signupPassword', 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
    if (password !== $('signupPassword2').value) return fail('signupPassword2', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน');

    const btn = e.submitter || $('signupForm').querySelector('[type=submit]');
    setBusy(btn, true, 'กำลังสร้างบัญชี...');
    const res = await attempt(() => api('/auth/register', { method: 'POST', body: { name, username, email, password } }));
    setBusy(btn, false);
    if (!res) return;

    closeModal('signupModal');
    $('signupForm').reset();
    setSession(res.token, res.user);
    showToast('สร้างบัญชีสำเร็จ! ยินดีต้อนรับสู่ PawSpot 🎉');
}

function forgotPassword() {
    showToast('กรุณาติดต่อผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน', 'info');
}

// ---------- Social login (Google / LINE) ----------
const PROVIDER_LABELS = { google: 'Google', line: 'LINE' };
let enabledProviders = null;   // { google: bool, ... } from the server

async function loadProviders() {
    enabledProviders = await api('/auth/providers').catch(() => null);
    document.querySelectorAll('[data-provider]').forEach(btn => {
        const off = enabledProviders && !enabledProviders[btn.dataset.provider];
        btn.classList.toggle('opacity-50', !!off);
        btn.title = off ? `ยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย ${PROVIDER_LABELS[btn.dataset.provider]}` : '';
    });
}

function socialLogin(provider) {
    const label = PROVIDER_LABELS[provider] || provider;
    if (enabledProviders && !enabledProviders[provider]) {
        return showToast(`ผู้ดูแลระบบยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย ${label}`, 'info');
    }
    document.querySelectorAll('[data-provider]').forEach(b => { b.disabled = true; });
    showToast(`กำลังไปที่ ${label}...`, 'info');
    location.href = `/api/auth/oauth/${encodeURIComponent(provider)}`;
}

// After the provider redirects back: /#oauth=<one-time code> or /#oauth_error=<reason>
async function finishSocialLogin() {
    const params = new URLSearchParams(location.hash.slice(1));
    const code = params.get('oauth');
    const error = params.get('oauth_error');
    if (!code && !error) return false;
    setHash('');

    if (error) {
        const label = PROVIDER_LABELS[params.get('provider')] || '';
        const messages = {
            cancelled: `ยกเลิกการเข้าสู่ระบบด้วย ${label}`,
            not_configured: `ผู้ดูแลระบบยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย ${label}`,
            state: 'การเข้าสู่ระบบหมดเวลาหรือไม่ถูกต้อง กรุณาลองใหม่',
            banned: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
        };
        showToast(messages[error] || `เข้าสู่ระบบด้วย ${label} ไม่สำเร็จ กรุณาลองใหม่`, error === 'cancelled' ? 'info' : 'error');
        return true;
    }

    const res = await attempt(() => api('/auth/oauth/exchange', { method: 'POST', body: { code } }));
    if (res) {
        setSession(res.token, res.user);
        showToast(`ยินดีต้อนรับ, ${res.user.name} 🐾`);
    }
    return true;
}

function logout() {
    setSession(null, null);
    showToast('ออกจากระบบเรียบร้อยแล้ว');
}

// =====================================================================
//  Filtering & listing
// =====================================================================
function setFilter(type) {
    state.type = type;
    syncFilterButtons();
    loadItems();
}

function syncFilterButtons() {
    document.querySelectorAll('[data-filter]').forEach(btn => {
        const active = btn.dataset.filter === state.type;
        btn.classList.toggle('active', active);
        btn.classList.toggle('inactive', !active);
        btn.setAttribute('aria-selected', active);
    });
}

function resetFilters() {
    Object.assign(state, { type: 'all', category: 'all', status: 'all', sort: 'newest', search: '' });
    $('searchInput').value = '';
    $('categoryFilter').value = 'all';
    $('statusFilter').value = 'all';
    $('sortSelect').value = 'newest';
    syncFilterButtons();
    loadItems();
}

function hasActiveFilters() {
    return state.type !== 'all' || state.category !== 'all' || state.status !== 'all' || state.search.trim() !== '';
}

function listQuery(page) {
    const p = new URLSearchParams({ page, limit: PAGE_SIZE, sort: state.sort });
    if (state.type === 'my') p.set('mine', '1');
    else if (state.type !== 'all') p.set('type', state.type);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.status !== 'all') p.set('status', state.status);
    if (state.search.trim()) p.set('q', state.search.trim());
    return p.toString();
}

// Loads page 1 (or appends the next page when append = true)
async function loadItems(append = false) {
    const reqId = ++listRequestId;
    const page = append ? listPage + 1 : 1;
    if (!append) {
        loadStats();
        if (!listItems.length) renderSkeleton();
    }
    const btn = $('loadMoreBtn');
    if (append) setBusy(btn, true, 'กำลังโหลด...');

    let data;
    try {
        data = await api(`/items?${listQuery(page)}`);
    } catch (err) {
        if (append) setBusy(btn, false);
        if (reqId !== listRequestId) return;
        if (append) showToast(err.message, 'error');
        else renderLoadError(err.message);
        return;
    }
    if (append) setBusy(btn, false);
    if (reqId !== listRequestId) return;   // a newer request has started
    listItems = append ? listItems.concat(data.items) : data.items;
    listTotal = data.total;
    listPage = data.page;
    renderItems(append ? listItems.length - data.items.length : 0);
    if (!append) document.dispatchEvent(new CustomEvent('pawspot:list'));
}

function loadMore() { loadItems(true); }

async function loadStats() {
    const s = await api('/items/stats').catch(() => null);
    if (!s) return;
    $('statTotal').textContent = s.total;
    $('statLost').textContent = s.lostActive;
    $('statFound').textContent = s.foundActive;
    $('statReturned').textContent = s.returned;
    $('countLost').textContent = s.lost;
    $('countFound').textContent = s.found;
}

function renderSkeleton() {
    $('emptyState').classList.add('hidden');
    $('itemsGrid').classList.remove('hidden');
    $('itemsGrid').innerHTML = Array.from({ length: 4 }, () => `
        <div class="glass-card rounded-[2rem] overflow-hidden animate-pulse">
            <div class="h-56 bg-slate-200/70"></div>
            <div class="p-6 space-y-3">
                <div class="h-5 bg-slate-200/70 rounded w-3/4"></div>
                <div class="h-4 bg-slate-200/70 rounded w-1/2"></div>
                <div class="h-4 bg-slate-200/70 rounded w-full"></div>
            </div>
        </div>`).join('');
}

function renderLoadError(message) {
    listItems = [];
    $('resultCount').textContent = '';
    $('loadMoreBtn').classList.add('hidden');
    $('emptyState').classList.add('hidden');
    $('itemsGrid').classList.remove('hidden');
    $('itemsGrid').innerHTML = `
        <div class="col-span-full glass-card rounded-3xl py-16 text-center">
            <div class="text-5xl mb-3">😿</div>
            <p class="text-slate-600 font-semibold mb-4">${esc(message)}</p>
            <button onclick="loadItems()" class="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-semibold"><i class="fas fa-redo mr-2"></i>ลองใหม่</button>
        </div>`;
}

function renderItems(animateFrom = 0) {
    const grid = $('itemsGrid');
    const empty = $('emptyState');

    $('resultCount').textContent = `พบ ${listTotal} ประกาศ`;
    $('clearFiltersBtn').classList.toggle('hidden', !hasActiveFilters());
    const remaining = listTotal - listItems.length;
    $('loadMoreBtn').classList.toggle('hidden', remaining <= 0);
    $('loadMoreBtn').innerHTML = `<i class="fas fa-chevron-down mr-2"></i>แสดงเพิ่มเติม (อีก ${remaining} ประกาศ)`;

    if (listItems.length === 0) {
        grid.classList.add('hidden');
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    grid.classList.remove('hidden');
    empty.classList.add('hidden');
    grid.innerHTML = listItems.map((item, idx) => cardHTML(item, idx, idx >= animateFrom)).join('');
}

// Replace one post in the grid after it changed
function updateListItem(item) {
    const idx = listItems.findIndex(i => i.id === item.id);
    if (idx > -1) {
        listItems[idx] = item;
        renderItems(listItems.length);
    }
}

function typeInfo(item) {
    return item.type === 'lost'
        ? { color: 'rose', icon: 'fa-search', text: 'ตามหาน้อง', poster: 'ตามหา' }
        : { color: 'emerald', icon: 'fa-hand-holding-heart', text: 'พบน้องหลง', poster: 'พบน้องหลง' };
}

function statusBadge(item) {
    const returned = item.status === 'returned';
    const cls = returned ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-amber-500 shadow-amber-500/30';
    const text = returned ? 'กลับบ้านแล้ว ❤️' : (item.type === 'lost' ? 'กำลังตามหา' : 'รอเจ้าของ');
    return `<span class="${cls} text-white text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-md">${text}</span>`;
}

function cardHTML(item, idx, animate) {
    const t = typeInfo(item);
    const returned = item.status === 'returned';
    const anim = animate ? `animate-fade-in-up" style="animation-delay:${(idx % PAGE_SIZE) * 0.04}s` : '';

    let actions = '';
    if (canManage(item)) {
        actions = `
            <div class="card-actions absolute bottom-4 right-4 bg-white/95 backdrop-blur-md rounded-xl p-1 shadow-md border border-white flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all z-20">
                <button data-action="status" class="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg" title="${returned ? 'เปิดเคสอีกครั้ง' : 'ทำเครื่องหมายว่ากลับบ้านแล้ว'}" aria-label="เปลี่ยนสถานะ"><i class="fas ${returned ? 'fa-undo' : 'fa-check-circle'}"></i></button>
                <button data-action="edit" class="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg" title="แก้ไข" aria-label="แก้ไข"><i class="fas fa-edit"></i></button>
                <button data-action="delete" class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg" title="ลบ" aria-label="ลบ"><i class="fas fa-trash-alt"></i></button>
            </div>`;
    }

    const sightCount = item.sightingCount
        ? `<span class="inline-flex items-center gap-1 text-sky-600" title="เบาะแส"><i class="fas fa-eye"></i>${item.sightingCount}</span>` : '';

    return `
    <article data-id="${esc(item.id)}" tabindex="0" role="button" aria-label="ดูรายละเอียด ${esc(item.name)}"
        class="glass-card rounded-[2rem] overflow-hidden flex flex-col group cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:shadow-orange-900/5 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-400/40 transition-all duration-300 ${anim}">
        <div class="h-56 w-full bg-slate-100 relative overflow-hidden">
            <img src="${esc(imageFor(item))}" data-cat="${esc(item.category)}" onerror="imgFallback(this)" alt="${esc(item.name)}" loading="lazy"
                 class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${returned ? 'grayscale-[70%] opacity-80' : ''}">
            <div class="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent z-10"></div>
            <div class="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-1.5 text-xs font-bold text-${t.color}-600">
                <i class="fas ${t.icon}"></i> ${t.text}
            </div>
            <div class="absolute top-4 right-4 z-20 flex flex-col items-end gap-1.5">${statusBadge(item)}
                ${item.hidden ? '<span class="bg-slate-800 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-md"><i class="fas fa-eye-slash mr-1"></i>ถูกซ่อน</span>' : ''}
                ${item.reportCount ? `<span class="bg-rose-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-md"><i class="fas fa-flag mr-1"></i>ถูกแจ้ง ${item.reportCount}</span>` : ''}
            </div>
            ${actions}
            <div class="absolute bottom-4 left-4 z-20 flex gap-1.5 flex-wrap max-w-[60%]">
                <span class="bg-orange-500/90 text-white backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold shadow-sm border border-orange-400/50">${catEmoji(item.category)} ${esc(item.category)}</span>
            </div>
        </div>
        <div class="p-6 flex-1 flex flex-col bg-white/50">
            <h3 class="font-extrabold text-xl text-slate-800 line-clamp-1 leading-tight mb-2" title="${esc(item.name)}">${esc(item.name)}</h3>
            ${item.reward ? `<div class="self-start text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200/60 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 mb-2"><i class="fas fa-gift text-amber-500"></i> ${esc(item.reward)}</div>` : ''}
            <div class="flex items-start text-slate-500 text-sm mb-1.5 font-medium">
                <i class="fas fa-map-marker-alt w-5 text-orange-500 mt-1"></i><span class="line-clamp-1">${esc(item.location)}</span>${item.lat != null ? '<i class="fas fa-map-pin text-sky-500 ml-1.5 mt-1 text-xs" title="มีหมุดบนแผนที่"></i>' : ''}
            </div>
            <div class="flex items-center text-slate-400 text-xs mb-2 font-medium">
                <i class="far fa-calendar w-5 text-orange-400"></i>${item.type === 'lost' ? 'หายเมื่อ' : 'พบเมื่อ'} ${formatThaiDate(item.eventDate)}
            </div>
            ${item.breed || item.genderAge ? `<div class="text-xs text-slate-400 font-medium mb-2 line-clamp-1"><i class="fas fa-info-circle w-5"></i>${esc([item.breed, item.genderAge].filter(Boolean).join(' · '))}</div>` : ''}
            <p class="text-slate-600 text-sm mb-5 line-clamp-2">${esc(item.desc)}</p>
            <div class="mt-auto pt-4 border-t border-slate-200/60 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    ${avatarHTML(item.reporter, 'w-8 h-8 text-xs')}
                    <span class="text-xs font-bold text-slate-700 truncate">${esc(item.reporter.name)}</span>
                </div>
                <div class="flex items-center gap-2 text-xs font-medium text-slate-400 shrink-0">
                    ${sightCount}
                    <span class="bg-white border border-slate-100 shadow-sm px-2.5 py-1 rounded-lg">${getTimeAgo(item.createdAt)}</span>
                </div>
            </div>
        </div>
    </article>`;
}

// =====================================================================
//  Detail view
// =====================================================================
async function openDetail(id) {
    const fromList = findListItem(id);
    detailItem = fromList ? { ...fromList, sightings: null } : null;   // show list data right away
    if (detailItem) renderDetail();
    else $('detailContent').innerHTML = '<div class="py-32 text-center text-slate-400"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';
    setHash('#case-' + id);
    if (!modalStack.includes('detailModal')) openModal('detailModal');
    $('detailContent').scrollTop = 0;

    try {
        const { item } = await api(`/items/${id}`);
        if (!modalStack.includes('detailModal')) return;   // closed while loading
        detailItem = item;
        renderDetail();
    } catch (err) {
        showToast(err.message, 'error');
        closeModal('detailModal');
    }
}

// Called after any change to the post shown in the detail modal
function applyDetail(item) {
    detailItem = item;
    if (modalStack.includes('detailModal')) renderDetail();
    updateListItem(item);
}

function renderDetail() {
    const item = detailItem;
    if (!item) return;
    const t = typeInfo(item);
    const returned = item.status === 'returned';
    const tel = phoneHref(item.contact);
    const hasPin = item.lat != null && item.lng != null;
    const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(hasPin ? `${item.lat},${item.lng}` : item.location);

    const row = (icon, label, value) => value ? `
        <div class="flex gap-3 py-2.5 border-b border-slate-100 last:border-0">
            <i class="fas ${icon} w-5 text-orange-500 mt-0.5"></i>
            <div class="w-24 sm:w-28 shrink-0 text-slate-400 text-sm">${label}</div>
            <div class="text-slate-700 text-sm font-medium flex-1 min-w-0 break-words">${value}</div>
        </div>` : '';

    const manage = canManage(item) ? `
        <div class="flex flex-wrap gap-2 pt-4 mt-4 border-t border-slate-100">
            <button data-action="status" class="btn-soft ${returned ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}">
                <i class="fas ${returned ? 'fa-undo' : 'fa-home'}"></i> ${returned ? 'เปิดเคสอีกครั้ง' : 'น้องกลับบ้านแล้ว'}
            </button>
            <button data-action="edit" class="btn-soft bg-blue-50 text-blue-700 hover:bg-blue-100"><i class="fas fa-edit"></i> แก้ไข</button>
            <button data-action="delete" class="btn-soft bg-rose-50 text-rose-600 hover:bg-rose-100"><i class="fas fa-trash-alt"></i> ลบ</button>
            ${isAdmin() ? `<button data-action="admin-hide" class="btn-soft bg-slate-100 text-slate-700 hover:bg-slate-200"><i class="fas ${item.hidden ? 'fa-eye' : 'fa-eye-slash'}"></i> ${item.hidden ? 'เลิกซ่อน' : 'ซ่อนประกาศ'}</button>` : ''}
        </div>` : '';
    const canReport = currentUser && !isMine(item.reporter);

    let sightingsHtml;
    if (!item.sightings) {
        sightingsHtml = '<p class="text-sm text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลด...</p>';
    } else if (!item.sightings.length) {
        sightingsHtml = '<p class="text-sm text-slate-400">ยังไม่มีเบาะแส</p>';
    } else {
        sightingsHtml = '<ul class="space-y-3">' + [...item.sightings].reverse().map(s => {
            const canDel = canManage(item) || isMine(s.user);
            return `
            <li class="flex gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div class="w-9 h-9 shrink-0 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center text-sm font-bold">${esc(s.user.name.charAt(0).toUpperCase())}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-semibold text-sm text-slate-800 truncate">${esc(s.user.name)}</span>
                        <div class="flex items-center gap-2 shrink-0">
                            <span class="text-xs text-slate-400">${getTimeAgo(s.createdAt)}</span>
                            ${canDel ? `<button data-action="delete-sighting" data-sid="${esc(s.id)}" class="text-slate-300 hover:text-rose-500 p-1" title="ลบเบาะแส" aria-label="ลบเบาะแส"><i class="fas fa-times"></i></button>` : ''}
                        </div>
                    </div>
                    ${s.location ? `<div class="text-xs text-orange-600 font-medium mt-0.5"><i class="fas fa-map-marker-alt mr-1"></i>${esc(s.location)}</div>` : ''}
                    <p class="text-sm text-slate-600 mt-1 whitespace-pre-line break-words">${esc(s.text)}</p>
                </div>
            </li>`;
        }).join('') + '</ul>';
    }

    const sightingForm = currentUser ? `
        <form id="sightingForm" class="space-y-3 mt-4 p-4 rounded-2xl border border-dashed border-slate-200">
            <div class="text-sm font-semibold text-slate-700">${item.type === 'lost' ? 'พบเห็นน้องตัวนี้? แจ้งเบาะแสได้เลย' : 'คิดว่ารู้จักเจ้าของ? ฝากข้อความได้เลย'}</div>
            <input id="sightingLocation" type="text" maxlength="120" class="form-input-sm" placeholder="สถานที่ที่พบเห็น (ถ้ามี)">
            <textarea id="sightingText" required maxlength="500" rows="2" class="form-input-sm" placeholder="รายละเอียด เช่น เวลา ทิศทางที่เดินไป สภาพน้อง..."></textarea>
            <div class="text-right"><button type="submit" class="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold"><i class="fas fa-paper-plane mr-1.5"></i>ส่งเบาะแส</button></div>
        </form>` : `
        <div class="mt-4 p-4 rounded-2xl bg-slate-50 text-sm text-slate-500 text-center">
            <button data-action="login" class="text-orange-600 font-semibold hover:underline">เข้าสู่ระบบ</button> เพื่อแจ้งเบาะแส
        </div>`;

    $('detailContent').innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 [&>*]:min-w-0">
        <div class="relative bg-slate-100 lg:min-h-[520px]">
            <img src="${esc(imageFor(item))}" data-cat="${esc(item.category)}" onerror="imgFallback(this)" alt="${esc(item.name)}"
                 class="w-full h-72 sm:h-96 lg:h-full lg:absolute lg:inset-0 object-cover ${returned ? 'grayscale-[60%]' : ''}">
            <div class="absolute top-4 left-4 flex gap-2">
                <span class="bg-white/95 px-3 py-1.5 rounded-xl shadow-sm text-xs font-bold text-${t.color}-600"><i class="fas ${t.icon} mr-1"></i>${t.text}</span>
                ${statusBadge(item)}
            </div>
        </div>
        <div class="p-6 sm:p-8">
            <div class="text-sm font-semibold text-orange-600 mb-1">${catEmoji(item.category)} ${esc(item.category)}</div>
            ${item.hidden ? '<div class="mb-3 p-3 rounded-xl bg-slate-800 text-white text-sm"><i class="fas fa-eye-slash mr-2"></i>ประกาศนี้ถูกซ่อนโดยผู้ดูแลระบบ คนอื่นจะมองไม่เห็น</div>' : ''}
            <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-3 pr-10 break-words">${esc(item.name)}</h2>
            ${item.reward ? `<div class="inline-flex items-center gap-2 text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl mb-4"><i class="fas fa-gift text-amber-500"></i> สินน้ำใจ: ${esc(item.reward)}</div>` : ''}

            <div class="mb-4">
                ${row('fa-map-marker-alt', item.type === 'lost' ? 'สถานที่หาย' : 'สถานที่พบ', `${esc(item.location)} <a href="${mapUrl}" target="_blank" rel="noopener" class="text-sky-600 hover:underline inline-block ml-1 text-xs"><i class="fas fa-external-link-alt"></i> ดูแผนที่</a>`)}
                ${row('fa-calendar-day', item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ', formatThaiDate(item.eventDate))}
                ${row('fa-dna', 'สายพันธุ์', esc(item.breed))}
                ${row('fa-venus-mars', 'เพศ / อายุ', esc(item.genderAge))}
                ${row('fa-user', 'ผู้ลงประกาศ', `${esc(item.reporter.name)} <span class="text-slate-400 font-normal">· ${getTimeAgo(item.createdAt)}</span>`)}
            </div>

            ${hasPin ? '<div id="detailMap" class="detail-map mb-5" role="img" aria-label="แผนที่ตำแหน่ง"></div>' : ''}
            <h3 class="font-bold text-slate-800 mb-1.5">จุดสังเกต / รายละเอียด</h3>
            <p class="text-slate-600 text-sm whitespace-pre-line break-words mb-5">${esc(item.desc) || '-'}</p>

            <div class="rounded-2xl bg-slate-900 text-white p-4 flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <div class="text-xs text-slate-400">ข้อมูลติดต่อ</div>
                    <div class="font-bold break-words">${esc(item.contact)}</div>
                </div>
                <div class="flex gap-2 shrink-0">
                    ${tel ? `<a href="${tel}" class="w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center" title="โทร" aria-label="โทร"><i class="fas fa-phone"></i></a>` : ''}
                    <button data-action="copy-contact" class="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center" title="คัดลอก" aria-label="คัดลอกข้อมูลติดต่อ"><i class="far fa-copy"></i></button>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2 mt-3">
                <button data-action="share" class="btn-soft justify-center bg-orange-50 text-orange-700 hover:bg-orange-100"><i class="fas fa-share-nodes"></i> แชร์ประกาศ</button>
                <button data-action="print" class="btn-soft justify-center bg-slate-100 text-slate-700 hover:bg-slate-200"><i class="fas fa-print"></i> พิมพ์โปสเตอร์</button>
            </div>
            <p class="text-xs text-slate-400 mt-3"><i class="fas fa-shield-alt mr-1"></i>ระวังมิจฉาชีพ: อย่าโอนเงินก่อนเห็นตัวน้องจริง และนัดพบในที่สาธารณะ
                ${canReport ? '<button data-action="report" class="ml-1 text-rose-500 hover:underline font-semibold"><i class="far fa-flag mr-0.5"></i>แจ้งประกาศไม่เหมาะสม</button>' : ''}</p>
            ${manage}
        </div>
    </div>
    <div id="detailMatches"></div>
    <div class="p-6 sm:p-8 border-t border-slate-100 bg-white">
        <h3 class="font-bold text-lg text-slate-800 mb-3"><i class="fas fa-eye text-sky-500 mr-2"></i>เบาะแสจากผู้พบเห็น <span class="text-sm text-slate-400 font-medium">(${item.sightings ? item.sightings.length : item.sightingCount})</span></h3>
        ${sightingsHtml}
        ${returned || !item.sightings ? '' : sightingForm}
    </div>`;
    if (item.sightings) {
        document.dispatchEvent(new CustomEvent('pawspot:detail', { detail: item }));
        loadMatches(item);
    }
}

// "Possible matches": posts of the opposite type nearby (needs a map pin)
const matchCache = new Map();
async function loadMatches(item) {
    const box = $('detailMatches');
    if (!box || item.lat == null || item.status !== 'pending') return;
    let matches = matchCache.get(item.id);
    if (!matches) {
        matches = (await api(`/items/${item.id}/matches`).catch(() => null))?.matches || [];
        matchCache.set(item.id, matches);
    }
    if (!matches.length || detailItem?.id !== item.id || !$('detailMatches')) return;
    $('detailMatches').innerHTML = `
        <div class="p-6 sm:p-8 border-t border-slate-100 bg-amber-50/60">
            <h3 class="font-bold text-lg text-slate-800 mb-1"><i class="fas fa-link text-amber-500 mr-2"></i>${item.type === 'lost' ? 'มีคนพบสัตว์ที่อาจเป็นน้องตัวนี้' : 'อาจเป็นน้องที่มีคนกำลังตามหา'}</h3>
            <p class="text-sm text-slate-500 mb-4">ประเภทเดียวกัน อยู่ใกล้กัน และวันที่ใกล้เคียงกัน ลองเปิดดูรายละเอียด</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${matches.map(m => `
                <button data-action="open-item" data-id="${esc(m.id)}" class="flex gap-3 items-center text-left p-3 rounded-2xl bg-white border border-amber-100 hover:border-amber-300 hover:shadow-md transition-all">
                    <img src="${esc(imageFor(m))}" data-cat="${esc(m.category)}" onerror="imgFallback(this)" alt="" class="w-16 h-16 rounded-xl object-cover shrink-0">
                    <div class="min-w-0">
                        <div class="font-bold text-slate-800 truncate">${esc(m.name)}</div>
                        <div class="text-xs text-slate-500 truncate"><i class="fas fa-map-marker-alt text-orange-500 mr-1"></i>${esc(m.location)}</div>
                        <div class="text-xs text-amber-700 font-semibold mt-0.5">ห่าง ${m.km} กม. · ${formatThaiDate(m.eventDate)}</div>
                    </div>
                </button>`).join('')}
            </div>
        </div>`;
}

// Report a fake / scam post to the admins
async function reportPost(item) {
    if (!currentUser) { closeModal('detailModal'); openModal('loginModal'); return; }
    const reason = window.prompt('เหตุผลที่แจ้ง (เช่น ประกาศปลอม, เรียกให้โอนเงินก่อน, ข้อมูลไม่เหมาะสม)');
    if (reason === null) return;
    if (!reason.trim()) return showToast('กรุณาระบุเหตุผล', 'error');
    const res = await attempt(() => api(`/items/${item.id}/report`, { method: 'POST', body: { reason: reason.trim() } }));
    if (res) showToast(res.message || 'ส่งรายงานแล้ว');
}

// Round avatar: photo if there is one, otherwise the first letter
function avatarHTML(user, size = 'w-8 h-8 text-xs') {
    const letter = esc((user?.name || '?').charAt(0).toUpperCase());
    const fallback = `<div class="${size} shrink-0 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold">${letter}</div>`;
    if (!user?.avatarUrl) return fallback;
    return `<img src="${esc(user.avatarUrl)}" alt="" referrerpolicy="no-referrer" class="${size} shrink-0 rounded-full object-cover bg-orange-100" onerror="avatarFallback(this)" data-letter="${letter}" data-size="${esc(size)}">`;
}
function avatarFallback(img) {
    img.outerHTML = `<div class="${img.dataset.size} shrink-0 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold">${img.dataset.letter}</div>`;
}


async function submitSighting(e) {
    e.preventDefault();
    const item = detailItem;
    if (!item || !currentUser) return;
    const text = $('sightingText').value.trim();
    if (!text) return showToast('กรุณากรอกรายละเอียดเบาะแส', 'error');

    const btn = e.submitter;
    setBusy(btn, true, 'กำลังส่ง...');
    const res = await attempt(() => api(`/items/${item.id}/sightings`, {
        method: 'POST', body: { text, location: $('sightingLocation').value.trim() },
    }));
    setBusy(btn, false);
    if (!res) return;
    applyDetail(res.item);
    showToast('ส่งเบาะแสเรียบร้อย ขอบคุณที่ช่วยเหลือ 💛');
}

async function deleteSighting(item, sid) {
    const res = await attempt(() => api(`/items/${item.id}/sightings/${sid}`, { method: 'DELETE' }));
    if (!res) return;
    applyDetail(res.item);
    showToast('ลบเบาะแสแล้ว');
}

async function shareItem(item) {
    const url = caseUrl(item.id);
    const text = `${item.type === 'lost' ? '🚨 ช่วยตามหา' : '🐾 พบน้องหลง ตามหาเจ้าของ'}: ${item.name} — ${item.location}`;
    if (navigator.share) {
        try { await navigator.share({ title: 'PawSpot', text, url }); return; }
        catch (err) { if (err.name === 'AbortError') return; }
    }
    copyText(`${text}\n${url}`, 'คัดลอกลิงก์ประกาศแล้ว นำไปแชร์ต่อได้เลย');
}

function printPoster(item) {
    const t = typeInfo(item);
    const rows = [
        [item.type === 'lost' ? 'หายที่' : 'พบที่', item.location],
        [item.type === 'lost' ? 'วันที่หาย' : 'วันที่พบ', formatThaiDate(item.eventDate)],
        ['ประเภท', item.category],
        ['สายพันธุ์', item.breed],
        ['เพศ / อายุ', item.genderAge],
        ['จุดสังเกต', item.desc],
    ].filter(r => r[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');

    $('printArea').innerHTML = `
    <div class="poster">
        <div class="poster-head ${item.type}">${t.poster}${item.type === 'lost' ? '!' : ''}
            <div class="poster-sub">${item.type === 'lost' ? 'ช่วยด้วย สัตว์เลี้ยงหาย' : 'ตามหาเจ้าของ'}</div>
        </div>
        <img class="poster-img" src="${esc(imageFor(item))}" data-cat="${esc(item.category)}" onerror="imgFallback(this)" alt="">
        <div class="poster-name">${esc(item.name)}</div>
        ${item.reward ? `<div class="poster-reward">สินน้ำใจ ${esc(item.reward)}</div>` : ''}
        <table class="poster-table">${rows}</table>
        <div class="poster-contact">ติดต่อ: ${esc(item.contact)}</div>
        <div class="poster-foot">ดูรายละเอียดและแจ้งเบาะแสได้ที่ ${esc(caseUrl(item.id))}</div>
    </div>`;

    const img = $('printArea').querySelector('img');
    const go = () => setTimeout(() => window.print(), 50);
    if (img.complete) go();
    else {
        let done = false;
        const once = () => { if (!done) { done = true; go(); } };
        img.addEventListener('load', once);
        img.addEventListener('error', once);
        setTimeout(once, 3000);
    }
}

// =====================================================================
//  Create / edit
// =====================================================================
function handleReportClick() {
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อนลงประกาศ', 'info');
        openModal('loginModal');
        return;
    }
    $('reportForm').reset();
    clearInvalid();
    $('editItemId').value = '';
    $('itemCategory').value = '';
    $('itemEventDate').value = toDateInput(new Date());
    $('itemEventDate').max = toDateInput(new Date());
    $('descCount').textContent = '0';
    $('modalTitle').textContent = 'ลงประกาศสัตว์เลี้ยง';
    setPendingImage(null);
    openModal('reportModal');
    document.dispatchEvent(new CustomEvent('pawspot:report-form', { detail: null }));
}

function openEditModal(item) {
    if (!canManage(item)) return;
    if (modalStack.includes('detailModal')) closeModal('detailModal');

    $('reportForm').reset();
    clearInvalid();
    $('editItemId').value = item.id;
    $('modalTitle').textContent = 'แก้ไขข้อมูลประกาศ';
    document.querySelector(`input[name="type"][value="${item.type}"]`).checked = true;
    $('itemName').value = item.name;
    $('itemCategory').value = item.category || 'อื่นๆ';
    $('itemBreed').value = item.breed || '';
    $('itemGenderAge').value = item.genderAge || '';
    $('itemLocation').value = item.location;
    $('itemEventDate').value = item.eventDate || '';
    $('itemEventDate').max = toDateInput(new Date());
    $('itemReward').value = item.reward || '';
    $('itemDesc').value = item.desc || '';
    $('descCount').textContent = (item.desc || '').length;
    $('itemContact').value = item.contact;
    setPendingImage(item.image);
    openModal('reportModal');
    document.dispatchEvent(new CustomEvent('pawspot:report-form', { detail: item }));
}

function setPendingImage(src) {
    pendingImage = src || null;
    $('imagePreview').src = pendingImage || '';
    $('imagePreviewContainer').classList.toggle('hidden', !pendingImage);
    $('uploadPrompt').classList.toggle('hidden', !!pendingImage);
    $('imageProcessing').classList.add('hidden');
    // the file input overlays the drop zone only when there's no preview (so preview buttons stay clickable)
    $('itemImage').classList.toggle('pointer-events-none', !!pendingImage);
}

function removeImage() {
    $('itemImage').value = '';
    setPendingImage(null);
}

async function handleImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('กรุณาเลือกไฟล์รูปภาพเท่านั้น', 'error');
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return showToast(`รูปภาพต้องมีขนาดไม่เกิน ${MAX_UPLOAD_MB}MB`, 'error');

    const previous = pendingImage;
    $('uploadPrompt').classList.add('hidden');
    $('imagePreviewContainer').classList.add('hidden');
    $('imageProcessing').classList.remove('hidden');
    try {
        setPendingImage(await compressImage(file));
    } catch {
        setPendingImage(previous);
        showToast('ไม่สามารถอ่านไฟล์รูปนี้ได้', 'error');
    }
}

// Resize + re-encode in the browser so uploads stay small
function compressImage(file, maxSide = 1200, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.round(img.naturalWidth * scale);
            const h = Math.round(img.naturalHeight * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('invalid image')); };
        img.src = url;
    });
}

function clearInvalid() {
    document.querySelectorAll('#reportForm .invalid').forEach(el => el.classList.remove('invalid'));
}

function validateReport() {
    clearInvalid();
    const required = ['itemName', 'itemCategory', 'itemLocation', 'itemEventDate', 'itemDesc', 'itemContact'];
    const bad = required.map($).filter(el => !el.value.trim());
    const dateEl = $('itemEventDate');
    if (dateEl.value && dateEl.value > toDateInput(new Date())) bad.push(dateEl);
    bad.forEach(el => el.classList.add('invalid'));
    if (bad.length) {
        bad[0].focus();
        showToast(bad[0] === dateEl && dateEl.value ? 'วันที่ต้องไม่เป็นวันในอนาคต' : 'กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบ', 'error');
        return false;
    }
    return true;
}

async function submitReport(e) {
    e.preventDefault();
    if (!currentUser || !validateReport()) return;

    const body = {
        type: document.querySelector('input[name="type"]:checked').value,
        name: $('itemName').value.trim(),
        category: $('itemCategory').value,
        breed: $('itemBreed').value.trim(),
        genderAge: $('itemGenderAge').value.trim(),
        location: $('itemLocation').value.trim(),
        eventDate: $('itemEventDate').value,
        reward: $('itemReward').value.trim(),
        desc: $('itemDesc').value.trim(),
        contact: $('itemContact').value.trim(),
        image: pendingImage,   // data URL = new photo, existing URL = keep, null = none
        ...(typeof getPickedLocation === 'function' ? getPickedLocation() : {}),
    };
    const editId = $('editItemId').value;

    const btn = $('submitBtn');
    setBusy(btn, true, editId ? 'กำลังบันทึก...' : 'กำลังลงประกาศ...');
    const res = await attempt(() => editId
        ? api(`/items/${editId}`, { method: 'PUT', body })
        : api('/items', { method: 'POST', body }));
    setBusy(btn, false);
    if (!res) return;

    closeModal('reportModal');
    if (editId) updateListItem(res.item);
    else loadItems();
    loadStats();
    showToast(editId ? 'อัปเดตประกาศสำเร็จ' : 'ลงประกาศสำเร็จ 🎉 แชร์ต่อเพื่อเพิ่มโอกาสพบน้อง');
    setTimeout(() => openDetail(res.item.id), 320);
}

// =====================================================================
//  Status / delete
// =====================================================================
async function toggleStatus(item, btn) {
    if (!canManage(item)) return;
    const status = item.status === 'pending' ? 'returned' : 'pending';
    if (btn) btn.disabled = true;
    const res = await attempt(() => api(`/items/${item.id}/status`, { method: 'PATCH', body: { status } }));
    if (btn) btn.disabled = false;
    if (!res) return;

    if (detailItem?.id === item.id) applyDetail(res.item);
    else updateListItem(res.item);
    loadStats();
    showToast(status === 'returned' ? 'ยินดีด้วย! น้องได้กลับบ้านแล้ว 🏡' : 'เปิดเคสอีกครั้งแล้ว');
}

function promptDelete(item) {
    if (!canManage(item)) return;
    $('confirmText').textContent = `ประกาศ "${item.name}" จะถูกลบออกจากระบบเป็นการถาวร`;
    openModal('confirmModal');
    $('confirmDeleteBtn').onclick = async () => {
        const btn = $('confirmDeleteBtn');
        setBusy(btn, true, 'กำลังลบ...');
        const ok = await attempt(() => api(`/items/${item.id}`, { method: 'DELETE' }).then(() => true));
        setBusy(btn, false);
        if (!ok) return;
        closeModal('confirmModal');
        if (detailItem?.id === item.id) closeModal('detailModal');
        listItems = listItems.filter(i => i.id !== item.id);
        listTotal = Math.max(0, listTotal - 1);
        renderItems(listItems.length);
        loadStats();
        showToast('ลบประกาศเรียบร้อยแล้ว');
    };
}

// =====================================================================
//  Modals
// =====================================================================
const modalStack = [];
const modalTimers = {};

function openModal(id) {
    const modal = $(id);
    clearTimeout(modalTimers[id]);
    if (!modalStack.includes(id)) modalStack.push(id);
    modal.classList.remove('hidden');
    void modal.offsetWidth; // restart transition
    modal.classList.remove('opacity-0');
    modal.firstElementChild.classList.replace('scale-95', 'scale-100');
    document.body.classList.add('overflow-hidden');
    const focusTarget = modal.querySelector('input:not([type=hidden]):not([type=radio]):not([type=file]), button');
    if (focusTarget && id !== 'detailModal') setTimeout(() => focusTarget.focus(), 50);
}

function closeModal(id) {
    const modal = $(id);
    const idx = modalStack.indexOf(id);
    if (idx > -1) modalStack.splice(idx, 1);
    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.replace('scale-100', 'scale-95');
    modalTimers[id] = setTimeout(() => modal.classList.add('hidden'), 300);
    if (!modalStack.length) document.body.classList.remove('overflow-hidden');
    if (id === 'detailModal') {
        detailItem = null;
        if (location.hash.startsWith('#case-')) setHash('');
    }
}

function switchModal(from, to) {
    closeModal(from);
    openModal(to);
}

// =====================================================================
//  Toast
// =====================================================================
function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    const base = 'flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl text-sm font-semibold transition-all duration-500 -translate-y-4 opacity-0 backdrop-blur-md border border-white/20';
    const styles = {
        success: ['bg-slate-900/90 text-white', '<div class="bg-emerald-500 rounded-full w-6 h-6 shrink-0 flex items-center justify-center text-xs"><i class="fas fa-check"></i></div>'],
        error: ['bg-rose-500/95 text-white', '<i class="fas fa-exclamation-triangle text-lg shrink-0"></i>'],
        info: ['bg-white/95 text-slate-800', '<i class="fas fa-info-circle text-orange-500 text-lg shrink-0"></i>'],
    };
    const [cls, icon] = styles[type] || styles.info;
    toast.className = `${base} ${cls}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = icon;
    const span = document.createElement('span');
    span.textContent = msg;
    toast.appendChild(span);

    $('toastContainer').appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.remove('-translate-y-4', 'opacity-0')));
    setTimeout(() => {
        toast.classList.add('-translate-y-4', 'opacity-0');
        setTimeout(() => toast.remove(), 500);
    }, 3200);
}
