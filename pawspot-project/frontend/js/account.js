'use strict';
// Account menu, notifications (bell) and the profile modal.

// ===================================================================== dropdowns
function togglePanel(panelId, btnId, show) {
    const panel = $(panelId);
    const open = show ?? panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    $(btnId).setAttribute('aria-expanded', open);
    return open;
}

function closePanels(except) {
    [['notifPanel', 'notifBtn'], ['accountPanel', 'accountBtn']].forEach(([p, b]) => {
        if (p !== except) togglePanel(p, b, false);
    });
}

// ===================================================================== notifications
const NOTIF_STYLE = {
    sighting: { icon: 'fa-eye', cls: 'bg-sky-100 text-sky-600' },
    match: { icon: 'fa-link', cls: 'bg-amber-100 text-amber-600' },
    hidden: { icon: 'fa-eye-slash', cls: 'bg-slate-200 text-slate-600' },
    review: { icon: 'fa-hourglass-half', cls: 'bg-amber-100 text-amber-600' },
    approved: { icon: 'fa-circle-check', cls: 'bg-emerald-100 text-emerald-600' },
    rejected: { icon: 'fa-circle-xmark', cls: 'bg-rose-100 text-rose-600' },
    report: { icon: 'fa-flag', cls: 'bg-rose-100 text-rose-600' },
};
let notifState = { notifications: [], unread: 0 };
let notifTimer = null;
let lastUnread = null;

async function loadNotifications() {
    if (!currentUser) return;
    const data = await api('/notifications').catch(() => null);
    if (!data) return;
    if (lastUnread !== null && data.unread > lastUnread) {
        showToast(`มีการแจ้งเตือนใหม่ ${data.unread - lastUnread} รายการ`, 'info');
    }
    lastUnread = data.unread;
    notifState = data;
    renderNotifications();
}

function renderNotifications() {
    const badge = $('notifBadge');
    badge.textContent = notifState.unread > 99 ? '99+' : notifState.unread;
    badge.classList.toggle('hidden', !notifState.unread);
    $('notifBtn').setAttribute('aria-label', `การแจ้งเตือน${notifState.unread ? ` (ยังไม่อ่าน ${notifState.unread})` : ''}`);
    document.dispatchEvent(new CustomEvent('pawspot:notifs', { detail: { unread: notifState.unread } }));

    const list = $('notifList');
    if (!notifState.notifications.length) {
        list.innerHTML = '<div class="p-8 text-center text-sm text-slate-400"><i class="far fa-bell-slash text-2xl mb-2 block"></i>ยังไม่มีการแจ้งเตือน</div>';
        return;
    }
    list.innerHTML = notifState.notifications.map(n => {
        const st = NOTIF_STYLE[n.type] || NOTIF_STYLE.sighting;
        return `
        <button type="button" class="notif-item ${n.read ? '' : 'unread'}" data-nid="${esc(n.id)}" data-item="${esc(n.otherItemId || n.itemId || '')}">
            <span class="notif-icon ${st.cls}"><i class="fas ${st.icon}"></i></span>
            <span class="min-w-0 flex-1">
                <span class="block text-sm text-slate-700 leading-snug">${esc(n.message)}</span>
                <span class="block text-xs text-slate-400 mt-1">${getTimeAgo(n.createdAt)}</span>
            </span>
            ${n.read ? '' : '<span class="w-2 h-2 rounded-full bg-orange-500 mt-2 shrink-0"></span>'}
        </button>`;
    }).join('');
}

async function markNotificationsRead(ids) {
    const data = await api('/notifications/read', { method: 'POST', body: ids ? { ids } : {} }).catch(() => null);
    if (data) { notifState = data; lastUnread = data.unread; renderNotifications(); }
}

function startNotifications() {
    stopNotifications();
    lastUnread = null;
    loadNotifications();
    notifTimer = setInterval(() => { if (!document.hidden) loadNotifications(); }, 30000);
}

function stopNotifications() {
    clearInterval(notifTimer);
    notifTimer = null;
    notifState = { notifications: [], unread: 0 };
}

// ===================================================================== profile modal
let profileData = null;
let profileTab = 'info';
let profileAvatar;   // undefined = unchanged, null = remove, data URL = new

async function openProfile(tab = 'info') {
    if (!currentUser) return openModal('loginModal');
    closePanels();
    profileTab = tab;
    syncProfileTabs();
    $('profileBody').innerHTML = '<div class="py-16 text-center text-slate-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
    openModal('profileModal');
    profileData = await api('/me').catch(err => { showToast(err.message, 'error'); return null; });
    if (!profileData) return closeModal('profileModal');
    renderProfileHeader();
    renderProfileTab();
}

function syncProfileTabs() {
    document.querySelectorAll('[data-ptab]').forEach(b => {
        b.classList.toggle('active', b.dataset.ptab === profileTab);
        b.setAttribute('aria-selected', b.dataset.ptab === profileTab);
    });
}

function renderProfileHeader() {
    const u = profileData.user;
    $('profileHeadAvatar').innerHTML = u.avatarUrl
        ? `<img src="${esc(u.avatarUrl)}" alt="" referrerpolicy="no-referrer" class="w-full h-full object-cover">`
        : esc(u.name.charAt(0).toUpperCase());
    $('profileTitle').textContent = u.name;
    $('profileSub').textContent = `@${u.username}${u.role === 'admin' ? ' · ผู้ดูแลระบบ' : ''} · สมาชิกตั้งแต่ ${new Date(u.createdAt).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}`;
}

function renderProfileTab() {
    syncProfileTabs();
    ({ info: renderProfileInfo, posts: renderProfilePosts, tips: renderProfileTips, security: renderProfileSecurity })[profileTab]();
}

function renderProfileInfo() {
    const { user: u, stats } = profileData;
    profileAvatar = undefined;
    const stat = (label, value, icon) => `
        <div class="rounded-2xl bg-slate-50 border border-slate-100 p-4">
            <div class="text-xs text-slate-500"><i class="fas ${icon} mr-1 text-orange-400"></i>${label}</div>
            <div class="text-2xl font-extrabold text-slate-800">${value}</div>
        </div>`;
    const linked = (on, label, icon) => `<span class="pill ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}"><i class="${icon}"></i>${label} ${on ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม'}</span>`;

    $('profileBody').innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            ${stat('ประกาศทั้งหมด', stats.posts, 'fa-bullhorn')}
            ${stat('กลับบ้านแล้ว', stats.returned, 'fa-home')}
            ${stat('เบาะแสที่ส่ง', stats.sightings, 'fa-eye')}
            ${stat('เข้าสู่ระบบ', `${stats.logins} ครั้ง`, 'fa-right-to-bracket')}
        </div>
        <form id="profileForm" class="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-start" novalidate>
            <div class="flex flex-col items-center gap-3">
                <div id="profileAvatarPreview" class="w-28 h-28 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-4xl font-bold overflow-hidden border-4 border-white shadow-md">
                    ${u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="" referrerpolicy="no-referrer" class="w-full h-full object-cover">` : esc(u.name.charAt(0).toUpperCase())}
                </div>
                <label class="mini-btn bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"><i class="fas fa-camera mr-1"></i>เปลี่ยนรูป
                    <input type="file" id="profileAvatarInput" accept="image/*" class="sr-only"></label>
                ${u.avatarUrl ? '<button type="button" id="profileAvatarRemove" class="text-xs text-rose-500 hover:underline">ลบรูป</button>' : ''}
            </div>
            <div class="space-y-4">
                <div>
                    <label for="profileName" class="form-label">ชื่อที่แสดง</label>
                    <input id="profileName" type="text" maxlength="40" class="form-input-sm" value="${esc(u.name)}">
                </div>
                <div>
                    <label for="profileEmail" class="form-label">อีเมล</label>
                    <input id="profileEmail" type="email" maxlength="100" class="form-input-sm" value="${esc(u.email || '')}" placeholder="name@example.com">
                </div>
                <div>
                    <span class="form-label">ชื่อผู้ใช้</span>
                    <div class="text-sm text-slate-600">@${esc(u.username)} <span class="text-slate-400">(เปลี่ยนไม่ได้)</span></div>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${linked(u.providers.google, 'Google', 'fab fa-google')}
                    ${linked(u.providers.line, 'LINE', 'fab fa-line')}
                    ${linked(u.hasPassword, 'รหัสผ่าน', 'fas fa-key')}
                </div>
                <div class="pt-2"><button type="submit" class="btn-gradient px-6">บันทึกข้อมูล</button></div>
            </div>
        </form>`;

    $('profileAvatarInput').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return showToast('กรุณาเลือกไฟล์รูปภาพ', 'error');
        try {
            profileAvatar = await compressImage(file, 400, 0.85);
            $('profileAvatarPreview').innerHTML = `<img src="${profileAvatar}" alt="" class="w-full h-full object-cover">`;
        } catch { showToast('อ่านไฟล์รูปไม่ได้', 'error'); }
    });
    $('profileAvatarRemove')?.addEventListener('click', () => {
        profileAvatar = null;
        $('profileAvatarPreview').textContent = u.name.charAt(0).toUpperCase();
    });
    $('profileForm').addEventListener('submit', saveProfile);
}

async function saveProfile(e) {
    e.preventDefault();
    const body = { name: $('profileName').value.trim(), email: $('profileEmail').value.trim() };
    if (!body.name) return showToast('กรุณากรอกชื่อที่แสดง', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return showToast('รูปแบบอีเมลไม่ถูกต้อง', 'error');
    if (profileAvatar !== undefined) body.avatar = profileAvatar;

    const btn = e.submitter || e.target.querySelector('[type=submit]');
    setBusy(btn, true, 'กำลังบันทึก...');
    const res = await attempt(() => api('/me', { method: 'PATCH', body }));
    setBusy(btn, false);
    if (!res) return;
    profileData = res;
    currentUser = { ...currentUser, ...res.user };
    updateAuthUI();
    renderProfileHeader();
    renderProfileInfo();
    showToast('บันทึกข้อมูลเรียบร้อย');
}

async function renderProfilePosts() {
    const body = $('profileBody');
    body.innerHTML = '<div class="py-16 text-center text-slate-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
    const data = await api('/items?mine=1&limit=50').catch(err => { showToast(err.message, 'error'); return null; });
    if (!data || profileTab !== 'posts') return;
    if (!data.items.length) {
        body.innerHTML = `<div class="py-12 text-center text-slate-500"><div class="text-5xl mb-3">📭</div>ยังไม่มีประกาศ
            <div class="mt-4"><button onclick="closeModal('profileModal'); handleReportClick()" class="btn-gradient px-5 py-2.5 text-sm">ลงประกาศแรก</button></div></div>`;
        return;
    }
    body.innerHTML = `<div class="space-y-3">${data.items.map(item => `
        <div class="flex flex-wrap sm:flex-nowrap items-center gap-4 p-3 rounded-2xl border border-slate-100 hover:border-orange-200 bg-white">
            <img src="${esc(imageFor(item))}" data-cat="${esc(item.category)}" onerror="imgFallback(this)" alt="" class="w-20 h-20 rounded-xl object-cover shrink-0">
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="font-bold text-slate-800 truncate">${esc(item.name)}</span>
                    ${statusBadge(item)}
                    ${item.reviewStatus === 'pending' ? '<span class="pill bg-amber-100 text-amber-800"><i class="fas fa-hourglass-half"></i>รออนุมัติ</span>' : ''}
                    ${item.reviewStatus === 'rejected' ? `<span class="pill bg-rose-50 text-rose-600" title="${esc(item.reviewNote || '')}"><i class="fas fa-circle-xmark"></i>ไม่ผ่านการอนุมัติ</span>` : ''}
                    ${item.hidden ? '<span class="pill bg-slate-800 text-white"><i class="fas fa-eye-slash"></i>ถูกซ่อน</span>' : ''}
                    ${item.lat == null ? '<span class="pill bg-amber-50 text-amber-700" title="ปักหมุดเพื่อให้ระบบช่วยจับคู่"><i class="fas fa-map-pin"></i>ยังไม่ปักหมุด</span>' : ''}
                </div>
                <div class="text-xs text-slate-500 truncate"><i class="fas fa-map-marker-alt text-orange-500 mr-1"></i>${esc(item.location)} · ${formatThaiDate(item.eventDate)}</div>
                <div class="text-xs text-slate-400 mt-0.5"><i class="fas fa-eye mr-1"></i>${item.sightingCount} เบาะแส · ลงเมื่อ ${getTimeAgo(item.createdAt)}</div>
            </div>
            <div class="flex flex-wrap gap-1.5 w-full sm:w-auto justify-end">
                <button class="mini-btn bg-orange-50 text-orange-700 hover:bg-orange-100" data-pact="view" data-id="${esc(item.id)}">ดู</button>
                <button class="mini-btn bg-emerald-50 text-emerald-700 hover:bg-emerald-100" data-pact="status" data-id="${esc(item.id)}">${item.status === 'returned' ? 'เปิดเคสอีกครั้ง' : 'กลับบ้านแล้ว'}</button>
                <button class="mini-btn bg-blue-50 text-blue-700 hover:bg-blue-100" data-pact="edit" data-id="${esc(item.id)}">แก้ไข</button>
                <button class="mini-btn bg-rose-50 text-rose-600 hover:bg-rose-100" data-pact="delete" data-id="${esc(item.id)}">ลบ</button>
            </div>
        </div>`).join('')}</div>`;

    body.querySelectorAll('[data-pact]').forEach(btn => btn.addEventListener('click', async () => {
        const item = data.items.find(i => i.id === btn.dataset.id);
        const act = btn.dataset.pact;
        if (act === 'view') { closeModal('profileModal'); openDetail(item.id); }
        if (act === 'edit') { closeModal('profileModal'); openEditModal(item); }
        if (act === 'delete') { promptDelete(item); watchDeleteThenReload(); }
        if (act === 'status') {
            btn.disabled = true;
            const res = await attempt(() => api(`/items/${item.id}/status`, {
                method: 'PATCH', body: { status: item.status === 'pending' ? 'returned' : 'pending' },
            }));
            if (res) { updateListItem(res.item); loadStats(); renderProfilePosts(); }
            else btn.disabled = false;
        }
    }));
}

// Re-render "my posts" once the delete confirmation closes
function watchDeleteThenReload() {
    const timer = setInterval(() => {
        if (!modalStack.includes('confirmModal')) {
            clearInterval(timer);
            if (modalStack.includes('profileModal') && profileTab === 'posts') renderProfilePosts();
        }
    }, 400);
}

async function renderProfileTips() {
    const body = $('profileBody');
    body.innerHTML = '<div class="py-16 text-center text-slate-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
    const data = await api('/me/sightings').catch(err => { showToast(err.message, 'error'); return null; });
    if (!data || profileTab !== 'tips') return;
    if (!data.sightings.length) {
        body.innerHTML = '<div class="py-12 text-center text-slate-500"><div class="text-5xl mb-3">👀</div>ยังไม่เคยส่งเบาะแส<br><span class="text-sm text-slate-400">ถ้าพบเห็นน้องในประกาศ ช่วยแจ้งเบาะแสในหน้ารายละเอียดได้เลย</span></div>';
        return;
    }
    body.innerHTML = `<ul class="space-y-3">${data.sightings.map(s => `
        <li class="p-4 rounded-2xl border border-slate-100 bg-white">
            <div class="flex items-center justify-between gap-2 mb-1">
                <button class="font-semibold text-orange-700 hover:underline truncate text-left" onclick="closeModal('profileModal'); openDetail('${esc(s.item.id)}')">${esc(s.item.name)}</button>
                <span class="text-xs text-slate-400 shrink-0">${getTimeAgo(s.createdAt)}</span>
            </div>
            ${s.location ? `<div class="text-xs text-orange-600"><i class="fas fa-map-marker-alt mr-1"></i>${esc(s.location)}</div>` : ''}
            <p class="text-sm text-slate-600 mt-1 whitespace-pre-line break-words">${esc(s.text)}</p>
        </li>`).join('')}</ul>`;
}

function renderProfileSecurity() {
    const has = profileData.user.hasPassword;
    $('profileBody').innerHTML = `
        <form id="passwordForm" class="max-w-md space-y-4" novalidate>
            <p class="text-sm text-slate-500">${has
                ? 'เปลี่ยนรหัสผ่านสำหรับเข้าสู่ระบบด้วยชื่อผู้ใช้หรืออีเมล'
                : 'บัญชีนี้สมัครผ่าน Google / LINE จึงยังไม่มีรหัสผ่าน ตั้งรหัสผ่านไว้เพื่อเข้าสู่ระบบด้วยชื่อผู้ใช้หรืออีเมลได้ด้วย'}</p>
            ${has ? `<div><label for="pwCurrent" class="form-label">รหัสผ่านปัจจุบัน</label>
                <input id="pwCurrent" type="password" autocomplete="current-password" class="form-input-sm"></div>` : ''}
            <div><label for="pwNew" class="form-label">รหัสผ่านใหม่</label>
                <input id="pwNew" type="password" autocomplete="new-password" minlength="4" class="form-input-sm" placeholder="อย่างน้อย 4 ตัวอักษร"></div>
            <div><label for="pwConfirm" class="form-label">ยืนยันรหัสผ่านใหม่</label>
                <input id="pwConfirm" type="password" autocomplete="new-password" class="form-input-sm"></div>
            <button type="submit" class="btn-gradient px-6">${has ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}</button>
        </form>`;
    $('passwordForm').addEventListener('submit', async e => {
        e.preventDefault();
        const newPassword = $('pwNew').value;
        if (newPassword.length < 4) return showToast('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร', 'error');
        if (newPassword !== $('pwConfirm').value) return showToast('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน', 'error');
        const btn = e.submitter || e.target.querySelector('[type=submit]');
        setBusy(btn, true, 'กำลังบันทึก...');
        const res = await attempt(() => api('/me/password', {
            method: 'POST', body: { currentPassword: $('pwCurrent')?.value || '', newPassword },
        }));
        setBusy(btn, false);
        if (!res) return;
        showToast(res.message);
        profileData.user.hasPassword = true;
        renderProfileSecurity();
    });
}

// ===================================================================== wiring
document.addEventListener('DOMContentLoaded', () => {
    $('notifBtn').addEventListener('click', e => {
        e.stopPropagation();
        closePanels('notifPanel');
        if (togglePanel('notifPanel', 'notifBtn')) loadNotifications();
    });
    $('accountBtn').addEventListener('click', e => {
        e.stopPropagation();
        closePanels('accountPanel');
        togglePanel('accountPanel', 'accountBtn');
    });
    $('notifReadAll').addEventListener('click', e => { e.stopPropagation(); markNotificationsRead(); });
    $('notifList').addEventListener('click', e => {
        const el = e.target.closest('[data-nid]');
        if (!el) return;
        markNotificationsRead([Number(el.dataset.nid)]);
        closePanels();
        if (el.dataset.item) openDetail(el.dataset.item);
    });
    $('accountPanel').addEventListener('click', e => {
        const el = e.target.closest('[data-menu]');
        if (!el) return;
        closePanels();
        const m = el.dataset.menu;
        if (m === 'profile') openProfile('info');
        if (m === 'my-posts') openProfile('posts');
        if (m === 'my-tips') openProfile('tips');
        if (m === 'admin' && typeof openAdmin === 'function') openAdmin();
        if (m === 'logout') logout();
    });
    document.querySelectorAll('[data-ptab]').forEach(b => b.addEventListener('click', () => {
        profileTab = b.dataset.ptab;
        renderProfileTab();
    }));
    document.addEventListener('click', e => {
        if (!e.target.closest('#notifWrap') && !e.target.closest('#accountWrap')) closePanels();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });
});

document.addEventListener('pawspot:auth', () => {
    $('menuAdmin').classList.toggle('hidden', !isAdmin());
    if (currentUser) { if (!notifTimer) startNotifications(); }
    else { stopNotifications(); renderNotifications(); closePanels(); }
});
