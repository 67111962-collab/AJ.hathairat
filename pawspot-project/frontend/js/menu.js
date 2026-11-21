'use strict';
// Side menu (☰): links grouped by section. What you see depends on who is logged in.

let drawerOpen = false;
let adminReportCount = 0;
let adminPendingCount = 0;

function menuSections() {
    const unread = typeof notifState !== 'undefined' ? notifState.unread : 0;
    const sections = [{
        title: 'เมนูหลัก',
        items: [
            { icon: 'fa-house', label: 'หน้าแรก', act: 'home' },
            { icon: 'fa-list', label: 'ประกาศทั้งหมด', act: 'listings' },
            { icon: 'fa-map-location-dot', label: 'ดูบนแผนที่', act: 'map' },
            { icon: 'fa-plus', label: 'แจ้งเคสใหม่', act: 'report', accent: true },
        ],
    }];
    if (currentUser) {
        sections.push({
            title: 'บัญชีของฉัน',
            items: [
                { icon: 'fa-circle-user', label: 'โปรไฟล์', act: 'profile' },
                { icon: 'fa-folder-open', label: 'ประกาศของฉัน', act: 'my-posts' },
                { icon: 'fa-eye', label: 'เบาะแสที่ฉันส่ง', act: 'my-tips' },
                { icon: 'fa-bell', label: 'การแจ้งเตือน', act: 'notifications', badge: unread },
            ],
        });
    }
    if (isAdmin()) {
        sections.push({
            title: 'ผู้ดูแลระบบ',
            items: [
                { icon: 'fa-shield-halved', label: 'แดชบอร์ดผู้ดูแล', act: 'admin' },
                { icon: 'fa-hourglass-half', label: 'ประกาศรออนุมัติ', act: 'admin-pending', badge: adminPendingCount },
                { icon: 'fa-flag', label: 'รายงานที่รอตรวจ', act: 'admin-reports', badge: adminReportCount },
                { icon: 'fa-users', label: 'จัดการผู้ใช้', act: 'admin-users' },
            ],
        });
    }
    const dark = typeof isDarkMode === 'function' && isDarkMode();
    sections.push({
        title: 'การแสดงผล',
        items: [{ icon: dark ? 'fa-sun' : 'fa-moon', label: dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด', act: 'theme' }],
    });
    sections.push({
        title: 'ช่วยเหลือ',
        items: [
            { icon: 'fa-circle-question', label: 'วิธีใช้งาน', act: 'how' },
            { icon: 'fa-lightbulb', label: 'เคล็ดลับเมื่อน้องหาย', act: 'tips' },
            { icon: 'fa-circle-info', label: 'เกี่ยวกับเรา', act: 'page:about' },
            { icon: 'fa-user-shield', label: 'นโยบายความเป็นส่วนตัว', act: 'page:privacy' },
            { icon: 'fa-file-contract', label: 'ข้อตกลงการใช้งาน', act: 'page:terms' },
            { icon: 'fa-envelope', label: 'ติดต่อเรา', act: 'page:contact' },
        ],
    });
    return sections;
}

function renderDrawer() {
    const head = currentUser ? `
        <div class="mx-4 mb-2 p-4 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 flex items-center gap-3">
            ${avatarHTML(currentUser, 'w-12 h-12 text-lg')}
            <div class="min-w-0">
                <div class="font-bold text-slate-800 truncate">${esc(currentUser.name)}</div>
                <div class="text-xs text-slate-500 truncate">@${esc(currentUser.username)} · ${isAdmin() ? 'ผู้ดูแลระบบ' : 'สมาชิก'}</div>
            </div>
        </div>` : `
        <div class="mx-4 mb-2 p-4 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50">
            <p class="text-sm text-slate-600 mb-3">เข้าสู่ระบบเพื่อลงประกาศ แจ้งเบาะแส และรับการแจ้งเตือน</p>
            <div class="grid grid-cols-2 gap-2">
                <button type="button" data-act="login" class="py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">เข้าสู่ระบบ</button>
                <button type="button" data-act="signup" class="py-2.5 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800">สมัครสมาชิก</button>
            </div>
        </div>`;

    const body = menuSections().map(sec => `
        <div class="drawer-section">
            <div class="drawer-heading">${esc(sec.title)}</div>
            ${sec.items.map(it => `
                <button type="button" class="drawer-item ${it.accent ? 'accent' : ''}" data-act="${it.act}">
                    <i class="fas ${it.icon}"></i><span class="flex-1">${esc(it.label)}</span>
                    ${it.badge ? `<span class="drawer-badge">${it.badge > 99 ? '99+' : it.badge}</span>` : ''}
                </button>`).join('')}
        </div>`).join('');

    const foot = currentUser ? `
        <div class="drawer-section">
            <button type="button" class="drawer-item text-rose-600" data-act="logout"><i class="fas fa-right-from-bracket"></i><span>ออกจากระบบ</span></button>
        </div>` : '';

    $('drawerBody').innerHTML = head + body + foot;
}

function openDrawer() {
    renderDrawer();
    drawerOpen = true;
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('menuBtn').setAttribute('aria-expanded', 'true');
    document.body.classList.add('overflow-hidden');
    setTimeout(() => $('drawerBody').querySelector('button')?.focus(), 50);
    if (isAdmin()) refreshAdminCount();
}

function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('menuBtn').setAttribute('aria-expanded', 'false');
    if (!modalStack.length) document.body.classList.remove('overflow-hidden');
    $('menuBtn').focus();
}

async function refreshAdminCount() {
    const s = await api('/admin/stats').catch(() => null);
    if (!s) return;
    adminReportCount = s.totals.reportedItems;
    adminPendingCount = s.totals.pendingReview;
    if (drawerOpen) renderDrawer();
    updateMenuDot();
}

function updateMenuDot() {
    const unread = typeof notifState !== 'undefined' ? notifState.unread : 0;
    $('menuDot').classList.toggle('hidden', !(currentUser && (unread || (isAdmin() && (adminReportCount || adminPendingCount)))));
}

function scrollToSection(id) {
    const el = $(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function runMenuAction(act) {
    if (act === 'theme') {   // keep the menu open so the change is visible
        toggleTheme();
        renderDrawer();
        $('drawerBody').querySelector('[data-act="theme"]')?.focus();
        return;
    }
    closeDrawer();
    if (act.startsWith('page:')) return openInfoPage(act.slice(5));
    switch (act) {
        case 'home': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
        case 'listings': setViewMode('list'); scrollToSection('listings'); break;
        case 'map': setViewMode('map'); scrollToSection('listings'); break;
        case 'report': handleReportClick(); break;
        case 'profile': openProfile('info'); break;
        case 'my-posts': openProfile('posts'); break;
        case 'my-tips': openProfile('tips'); break;
        case 'notifications':
            window.scrollTo({ top: 0 });
            setTimeout(() => $('notifBtn').click(), 50);
            break;
        case 'admin': openAdmin('overview'); break;
        case 'admin-pending': openAdmin('pending'); break;
        case 'admin-reports': openAdmin('reports'); break;
        case 'admin-users': openAdmin('users'); break;
        case 'how': scrollToSection('how'); break;
        case 'tips': scrollToSection('tips'); break;
        case 'login': openModal('loginModal'); break;
        case 'signup': openModal('signupModal'); break;
        case 'logout': logout(); break;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    $('menuBtn').addEventListener('click', e => {
        e.stopPropagation();
        drawerOpen ? closeDrawer() : openDrawer();
    });
    $('drawer').addEventListener('click', e => {
        if (e.target.closest('[data-drawer-close]')) return closeDrawer();
        const btn = e.target.closest('[data-act]');
        if (btn) runMenuAction(btn.dataset.act);
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && drawerOpen) closeDrawer();
        // keep Tab inside the open menu
        if (e.key === 'Tab' && drawerOpen) {
            const focusable = [...$('drawer').querySelectorAll('button')];
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });
});

document.addEventListener('pawspot:auth', () => {
    if (!currentUser) { adminReportCount = 0; adminPendingCount = 0; }
    else if (isAdmin()) refreshAdminCount();
    updateMenuDot();
    if (drawerOpen) renderDrawer();
});
document.addEventListener('pawspot:notifs', () => {
    updateMenuDot();
    if (drawerOpen) renderDrawer();
});
