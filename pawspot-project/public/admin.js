'use strict';
// Admin dashboard: overview + charts, reports, posts, users, login history.

let adminTab = 'overview';
const adminState = {
    items: { filter: 'all', q: '', page: 1 },
    users: { q: '', page: 1 },
    logins: { success: '', q: '', page: 1 },
};
const METHOD_LABELS = { password: 'รหัสผ่าน', register: 'สมัครสมาชิก', google: 'Google', line: 'LINE' };

function openAdmin(tab = 'overview') {
    if (!isAdmin()) return;
    adminTab = tab;
    openModal('adminModal');
    renderAdminTab();
}

function renderAdminTab() {
    document.querySelectorAll('[data-atab]').forEach(b => {
        b.classList.toggle('active', b.dataset.atab === adminTab);
        b.setAttribute('aria-selected', b.dataset.atab === adminTab);
    });
    $('adminBody').innerHTML = '<div class="py-20 text-center text-slate-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
    ({ overview: adminOverview, reports: adminReports, items: adminItems, users: adminUsers, logins: adminLogins })[adminTab]();
}

const fmtNum = n => Number(n || 0).toLocaleString('th-TH');
const fmtDateTime = d => new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const shortDay = ymd => { const [, m, d] = ymd.split('-').map(Number); return `${d}/${m}`; };

function pager(state, pages, onChange) {
    if (pages <= 1) return '';
    const id = `pg${Math.random().toString(36).slice(2, 8)}`;
    setTimeout(() => {
        document.querySelectorAll(`[data-${id}]`).forEach(b => b.addEventListener('click', () => {
            state.page += Number(b.dataset[id]);
            onChange();
        }));
    });
    return `<div class="flex items-center justify-end gap-2 mt-4 text-sm text-slate-500">
        <button class="mini-btn bg-white border border-slate-200" data-${id}="-1" ${state.page <= 1 ? 'disabled' : ''}>ก่อนหน้า</button>
        <span>หน้า ${state.page} / ${pages}</span>
        <button class="mini-btn bg-white border border-slate-200" data-${id}="1" ${state.page >= pages ? 'disabled' : ''}>ถัดไป</button>
    </div>`;
}

// ===================================================================== overview
async function adminOverview() {
    const data = await api('/admin/stats').catch(err => { showToast(err.message, 'error'); return null; });
    if (!data || adminTab !== 'overview') return;
    const t = data.totals;
    setReportBadge(t.reportedItems);
    const pct = t.items ? Math.round((t.returned / t.items) * 100) : 0;
    const kpi = (label, value, sub, icon) => `
        <div class="kpi">
            <div class="kpi-label"><i class="fas ${icon} mr-1 text-orange-400"></i>${label}</div>
            <div class="kpi-value">${value}</div>
            <div class="kpi-sub">${sub}</div>
        </div>`;

    const postsTotal = data.daily.reduce((s, d) => s + d.posts, 0);
    const loginsTotal = data.daily.reduce((s, d) => s + d.logins, 0);

    $('adminBody').innerHTML = `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            ${kpi('ผู้ใช้ทั้งหมด', fmtNum(t.users), `+${fmtNum(t.newUsers7d)} คนใน 7 วัน`, 'fa-users')}
            ${kpi('ประกาศทั้งหมด', fmtNum(t.items), `${fmtNum(t.sightings)} เบาะแส`, 'fa-bullhorn')}
            ${kpi('กลับบ้านแล้ว', `${pct}%`, `${fmtNum(t.returned)} จาก ${fmtNum(t.items)} ประกาศ`, 'fa-home')}
            ${kpi('ล็อกอินวันนี้', fmtNum(t.loginsToday), `ล้มเหลว ${fmtNum(t.failedToday)} ครั้ง`, 'fa-right-to-bracket')}
        </div>
        ${t.reportedItems || t.hidden ? `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            ${t.reportedItems ? `<button class="kpi text-left border-rose-200 bg-rose-50 hover:bg-rose-100" onclick="adminSwitch('reports')">
                <div class="kpi-label text-rose-700"><i class="fas fa-flag mr-1"></i>ประกาศที่ถูกแจ้ง รอตรวจสอบ</div>
                <div class="kpi-value text-rose-700">${fmtNum(t.reportedItems)}</div><div class="kpi-sub">คลิกเพื่อตรวจสอบ</div></button>` : ''}
            ${t.hidden ? `<button class="kpi text-left hover:bg-slate-100" onclick="adminState.items.filter='hidden'; adminSwitch('items')">
                <div class="kpi-label"><i class="fas fa-eye-slash mr-1"></i>ประกาศที่ซ่อนอยู่</div>
                <div class="kpi-value">${fmtNum(t.hidden)}</div><div class="kpi-sub">คลิกเพื่อดู</div></button>` : ''}
        </div>` : ''}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div class="panel">
                <div class="panel-title">ประกาศใหม่ต่อวัน</div>
                <div class="panel-sub">30 วันล่าสุด · รวม ${fmtNum(postsTotal)} ประกาศ</div>
                ${columnChart(data.daily, 'posts', 'ประกาศ')}
            </div>
            <div class="panel">
                <div class="panel-title">การเข้าสู่ระบบต่อวัน</div>
                <div class="panel-sub">30 วันล่าสุด · รวม ${fmtNum(loginsTotal)} ครั้ง (เฉพาะที่สำเร็จ)</div>
                ${columnChart(data.daily, 'logins', 'ครั้ง')}
            </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="panel">
                <div class="panel-title">ประกาศแยกตามหมวด</div>
                <div class="panel-sub">ทุกประกาศรวมที่ซ่อน</div>
                ${hbars(data.byCategory.map(r => [`${catEmoji(r.category)} ${r.category}`, r.n]))}
            </div>
            <div class="panel">
                <div class="panel-title">วิธีเข้าสู่ระบบ</div>
                <div class="panel-sub">นับเฉพาะครั้งที่สำเร็จ</div>
                ${hbars(data.byMethod.map(r => [METHOD_LABELS[r.method] || r.method, r.n]))}
            </div>
        </div>`;
}

// One-series column chart: thin bars, 2px gaps, rounded tops, hover tooltip.
function columnChart(daily, key, unit) {
    const max = Math.max(1, ...daily.map(d => d[key]));
    const cols = daily.map(d => `
        <div class="col" data-tip="${esc(formatThaiDate(d.day))}: ${fmtNum(d[key])} ${unit}" tabindex="0" aria-label="${esc(formatThaiDate(d.day))} ${d[key]} ${unit}">
            <div style="height:${(d[key] / max) * 100}%"></div>
        </div>`).join('');
    return `
        <div class="flex gap-2">
            <div class="flex flex-col justify-between text-[0.7rem] text-slate-400 text-right" style="height:140px"><span>${fmtNum(max)}</span><span>0</span></div>
            <div class="flex-1 min-w-0">
                <div class="cols ${key}">${cols}</div>
                <div class="cols-axis"><span>${shortDay(daily[0].day)}</span><span>${shortDay(daily[14].day)}</span><span>วันนี้</span></div>
            </div>
        </div>`;
}

function hbars(rows) {
    if (!rows.length) return '<p class="text-sm text-slate-400">ยังไม่มีข้อมูล</p>';
    const max = Math.max(...rows.map(r => r[1]));
    return rows.map(([label, n]) => `
        <div class="hbar">
            <span class="truncate text-slate-600" title="${esc(label)}">${esc(label)}</span>
            <div class="track"><div class="fill" style="width:${(n / max) * 100}%"></div></div>
            <span class="val">${fmtNum(n)}</span>
        </div>`).join('');
}

// ===================================================================== reports
async function adminReports() {
    const data = await api('/admin/reports').catch(err => { showToast(err.message, 'error'); return null; });
    if (!data || adminTab !== 'reports') return;
    setReportBadge(new Set(data.reports.map(r => r.item.id)).size);
    if (!data.reports.length) {
        $('adminBody').innerHTML = '<div class="panel py-16 text-center text-slate-500"><div class="text-5xl mb-3">✅</div>ไม่มีรายงานที่รอตรวจสอบ</div>';
        return;
    }
    $('adminBody').innerHTML = `
        <div class="panel overflow-x-auto">
            <table class="data-table">
                <thead><tr><th>ประกาศ</th><th>เหตุผล</th><th>ผู้แจ้ง</th><th>เวลา</th><th></th></tr></thead>
                <tbody>${data.reports.map(r => `
                    <tr>
                        <td><button class="font-semibold text-orange-700 hover:underline text-left" data-open="${esc(r.item.id)}">${esc(r.item.name)}</button>
                            ${r.item.hidden ? '<span class="pill bg-slate-800 text-white ml-1">ซ่อนแล้ว</span>' : ''}</td>
                        <td class="max-w-xs">${esc(r.reason)}</td>
                        <td>${esc(r.user.name)}<div class="text-xs text-slate-400">@${esc(r.user.username)}</div></td>
                        <td class="whitespace-nowrap text-slate-500">${fmtDateTime(r.createdAt)}</td>
                        <td class="text-right whitespace-nowrap">
                            ${r.item.hidden ? '' : `<button class="mini-btn bg-slate-800 text-white hover:bg-slate-700" data-hide="${esc(r.item.id)}">ซ่อนประกาศ</button>`}
                            <button class="mini-btn bg-slate-100 text-slate-700 hover:bg-slate-200" data-resolve="${esc(r.id)}">ไม่เป็นไร</button>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    bindAdminRowActions();
}

// ===================================================================== posts
async function adminItems() {
    const st = adminState.items;
    const params = new URLSearchParams({ filter: st.filter, page: st.page });
    if (st.q) params.set('q', st.q);
    const data = await api(`/admin/items?${params}`).catch(err => { showToast(err.message, 'error'); return null; });
    if (!data || adminTab !== 'items') return;

    $('adminBody').innerHTML = `
        <div class="flex flex-wrap gap-2 mb-4">
            <select id="aItemsFilter" class="select-input">
                <option value="all">ทุกประกาศ</option>
                <option value="reported">ถูกแจ้ง (รอตรวจสอบ)</option>
                <option value="hidden">ที่ซ่อนอยู่</option>
            </select>
            <input id="aItemsQ" type="search" class="form-input-sm max-w-xs" placeholder="ค้นหาชื่อ สถานที่..." value="${esc(st.q)}">
            <span class="ml-auto self-center text-sm text-slate-500">${fmtNum(data.total)} ประกาศ</span>
        </div>
        <div class="panel overflow-x-auto">
            ${data.items.length ? `<table class="data-table">
                <thead><tr><th>ประกาศ</th><th>เจ้าของ</th><th>สถานะ</th><th>ถูกแจ้ง</th><th>ลงเมื่อ</th><th></th></tr></thead>
                <tbody>${data.items.map(i => `
                    <tr>
                        <td><div class="flex items-center gap-3 min-w-[14rem]">
                            <img src="${esc(imageFor(i))}" data-cat="${esc(i.category)}" onerror="imgFallback(this)" alt="" class="w-11 h-11 rounded-lg object-cover shrink-0">
                            <div class="min-w-0"><button class="font-semibold text-slate-800 hover:text-orange-700 hover:underline text-left truncate block max-w-[16rem]" data-open="${esc(i.id)}">${esc(i.name)}</button>
                            <div class="text-xs text-slate-400">${typeInfo(i).text} · ${esc(i.category)}</div></div></div></td>
                        <td>${esc(i.reporter.name)}</td>
                        <td class="whitespace-nowrap">${i.status === 'returned' ? '<span class="pill bg-emerald-50 text-emerald-700">กลับบ้านแล้ว</span>' : '<span class="pill bg-amber-50 text-amber-700">เปิดอยู่</span>'}
                            ${i.hidden ? '<span class="pill bg-slate-800 text-white">ซ่อน</span>' : ''}</td>
                        <td>${i.reportCount ? `<span class="pill bg-rose-50 text-rose-600"><i class="fas fa-flag"></i>${i.reportCount}</span>` : '<span class="text-slate-300">-</span>'}</td>
                        <td class="whitespace-nowrap text-slate-500">${getTimeAgo(i.createdAt)}</td>
                        <td class="text-right whitespace-nowrap">
                            <button class="mini-btn ${i.hidden ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}" data-${i.hidden ? 'unhide' : 'hide'}="${esc(i.id)}">${i.hidden ? 'เลิกซ่อน' : 'ซ่อน'}</button>
                            <button class="mini-btn bg-rose-50 text-rose-600 hover:bg-rose-100" data-del="${esc(i.id)}">ลบ</button>
                        </td>
                    </tr>`).join('')}
                </tbody></table>` : '<p class="py-10 text-center text-slate-400">ไม่พบประกาศ</p>'}
            ${pager(st, data.pages, adminItems)}
        </div>`;
    $('aItemsFilter').value = st.filter;
    $('aItemsFilter').addEventListener('change', e => { st.filter = e.target.value; st.page = 1; adminItems(); });
    $('aItemsQ').addEventListener('input', debounce(e => { st.q = e.target.value.trim(); st.page = 1; adminItems(); }, 400));
    bindAdminRowActions(data.items);
}

// ===================================================================== users
async function adminUsers() {
    const st = adminState.users;
    const params = new URLSearchParams({ page: st.page });
    if (st.q) params.set('q', st.q);
    const data = await api(`/admin/users?${params}`).catch(err => { showToast(err.message, 'error'); return null; });
    if (!data || adminTab !== 'users') return;

    $('adminBody').innerHTML = `
        <div class="flex flex-wrap gap-2 mb-4">
            <input id="aUsersQ" type="search" class="form-input-sm max-w-xs" placeholder="ค้นหาชื่อ ชื่อผู้ใช้ อีเมล..." value="${esc(st.q)}">
            <span class="ml-auto self-center text-sm text-slate-500">${fmtNum(data.total)} คน</span>
        </div>
        <div class="panel overflow-x-auto">
            <table class="data-table">
                <thead><tr><th>ผู้ใช้</th><th>อีเมล</th><th>เข้าสู่ระบบด้วย</th><th>ประกาศ</th><th>ล็อกอินล่าสุด</th><th>สิทธิ์</th><th></th></tr></thead>
                <tbody>${data.users.map(u => {
                    const self = u.id === currentUser.id;
                    const ways = [u.hasPassword && 'รหัสผ่าน', u.providers.google && 'Google', u.providers.line && 'LINE'].filter(Boolean).join(', ');
                    return `
                    <tr class="${u.banned ? 'opacity-60' : ''}">
                        <td><div class="flex items-center gap-2.5 min-w-[11rem]">${avatarHTML(u, 'w-9 h-9 text-sm')}
                            <div class="min-w-0"><div class="font-semibold truncate">${esc(u.name)}${self ? ' <span class="text-xs text-slate-400">(คุณ)</span>' : ''}</div>
                            <div class="text-xs text-slate-400">@${esc(u.username)}</div></div></div></td>
                        <td class="text-slate-500">${esc(u.email || '-')}</td>
                        <td class="text-slate-500 whitespace-nowrap">${esc(ways || '-')}</td>
                        <td>${fmtNum(u.postCount)}</td>
                        <td class="whitespace-nowrap text-slate-500">${u.lastLoginAt ? getTimeAgo(u.lastLoginAt) : '-'}</td>
                        <td>${u.role === 'admin' ? '<span class="pill bg-orange-100 text-orange-700">ผู้ดูแล</span>' : '<span class="pill bg-slate-100 text-slate-600">สมาชิก</span>'}
                            ${u.banned ? '<span class="pill bg-rose-600 text-white">ระงับ</span>' : ''}</td>
                        <td class="text-right whitespace-nowrap">${self ? '' : `
                            <button class="mini-btn bg-slate-100 text-slate-700 hover:bg-slate-200" data-role="${esc(u.id)}" data-to="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'ถอดผู้ดูแล' : 'ตั้งเป็นผู้ดูแล'}</button>
                            <button class="mini-btn ${u.banned ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}" data-ban="${esc(u.id)}" data-to="${u.banned ? '0' : '1'}">${u.banned ? 'ยกเลิกระงับ' : 'ระงับ'}</button>`}
                        </td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
            ${pager(st, data.pages, adminUsers)}
        </div>`;
    $('aUsersQ').addEventListener('input', debounce(e => { st.q = e.target.value.trim(); st.page = 1; adminUsers(); }, 400));

    $('adminBody').querySelectorAll('[data-role],[data-ban]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.dataset.role || btn.dataset.ban;
        const body = btn.dataset.role ? { role: btn.dataset.to } : { banned: btn.dataset.to === '1' };
        const name = btn.closest('tr').querySelector('.font-semibold').textContent.trim();
        const question = btn.dataset.role
            ? (body.role === 'admin' ? `ตั้ง "${name}" เป็นผู้ดูแลระบบ?` : `ถอดสิทธิ์ผู้ดูแลของ "${name}"?`)
            : (body.banned ? `ระงับบัญชี "${name}"? ผู้ใช้จะเข้าสู่ระบบไม่ได้จนกว่าจะยกเลิก` : `ยกเลิกการระงับ "${name}"?`);
        if (!window.confirm(question)) return;
        btn.disabled = true;
        const res = await attempt(() => api(`/admin/users/${id}`, { method: 'PATCH', body }));
        if (res) { showToast('อัปเดตผู้ใช้แล้ว'); adminUsers(); } else btn.disabled = false;
    }));
}

// ===================================================================== login history
async function adminLogins() {
    const st = adminState.logins;
    const params = new URLSearchParams({ page: st.page });
    if (st.q) params.set('q', st.q);
    if (st.success) params.set('success', st.success);
    const data = await api(`/admin/logins?${params}`).catch(err => { showToast(err.message, 'error'); return null; });
    if (!data || adminTab !== 'logins') return;

    $('adminBody').innerHTML = `
        <div class="flex flex-wrap gap-2 mb-4">
            <select id="aLoginsSuccess" class="select-input">
                <option value="">ทั้งหมด</option><option value="true">สำเร็จ</option><option value="false">ล้มเหลว</option>
            </select>
            <input id="aLoginsQ" type="search" class="form-input-sm max-w-xs" placeholder="ค้นหาอีเมลหรือชื่อผู้ใช้..." value="${esc(st.q)}">
            <span class="ml-auto self-center text-sm text-slate-500">${fmtNum(data.total)} ครั้ง</span>
        </div>
        <div class="panel overflow-x-auto">
            ${data.logins.length ? `<table class="data-table">
                <thead><tr><th>เวลา</th><th>อีเมล</th><th>ชื่อผู้ใช้</th><th>วิธี</th><th>ผล</th><th>IP</th></tr></thead>
                <tbody>${data.logins.map(l => `
                    <tr>
                        <td class="whitespace-nowrap text-slate-500">${fmtDateTime(l.createdAt)}</td>
                        <td>${esc(l.email || '-')}</td>
                        <td>${esc(l.username || '-')}</td>
                        <td>${esc(METHOD_LABELS[l.method] || l.method)}</td>
                        <td>${l.success ? '<span class="pill bg-emerald-50 text-emerald-700"><i class="fas fa-check"></i>สำเร็จ</span>' : '<span class="pill bg-rose-50 text-rose-600"><i class="fas fa-times"></i>ล้มเหลว</span>'}</td>
                        <td class="text-slate-400 text-xs">${esc(l.ip || '-')}</td>
                    </tr>`).join('')}
                </tbody></table>` : '<p class="py-10 text-center text-slate-400">ไม่พบข้อมูล</p>'}
            ${pager(st, data.pages, adminLogins)}
        </div>`;
    $('aLoginsSuccess').value = st.success;
    $('aLoginsSuccess').addEventListener('change', e => { st.success = e.target.value; st.page = 1; adminLogins(); });
    $('aLoginsQ').addEventListener('input', debounce(e => { st.q = e.target.value.trim(); st.page = 1; adminLogins(); }, 400));
}

// ===================================================================== shared row actions
function bindAdminRowActions(rows = []) {
    const body = $('adminBody');
    body.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openDetail(b.dataset.open)));
    body.querySelectorAll('[data-hide],[data-unhide]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.hide || b.dataset.unhide;
        if (await setHidden(id, !!b.dataset.hide)) renderAdminTab();
    }));
    body.querySelectorAll('[data-resolve]').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        const res = await attempt(() => api(`/admin/reports/${b.dataset.resolve}/resolve`, { method: 'POST' }));
        if (res) { showToast('ปิดรายงานแล้ว'); renderAdminTab(); } else b.disabled = false;
    }));
    body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
        const item = rows.find(r => r.id === b.dataset.del);
        if (!item) return;
        promptDelete(item);
        const timer = setInterval(() => {
            if (!modalStack.includes('confirmModal')) { clearInterval(timer); if (modalStack.includes('adminModal')) renderAdminTab(); }
        }, 400);
    }));
}

async function setHidden(id, hidden) {
    let reason = '';
    if (hidden) {
        reason = window.prompt('เหตุผลที่ซ่อน (เจ้าของประกาศจะได้รับแจ้ง) — เว้นว่างได้');
        if (reason === null) return false;
    }
    const res = await attempt(() => api(`/admin/items/${id}/hidden`, { method: 'PATCH', body: { hidden, reason } }));
    if (!res) return false;
    showToast(hidden ? 'ซ่อนประกาศแล้ว' : 'เลิกซ่อนประกาศแล้ว');
    loadItems();
    return res.item;
}

// Called from the detail view's "ซ่อนประกาศ / เลิกซ่อน" button
async function adminToggleHidden(item) {
    const updated = await setHidden(item.id, !item.hidden);
    if (!updated) return;
    const fresh = await api(`/items/${item.id}`).catch(() => null);
    if (fresh) applyDetail(fresh.item);
}

function setReportBadge(n) {
    $('adminReportBadge').textContent = n;
    $('adminReportBadge').classList.toggle('hidden', !n);
}

function adminSwitch(tab) {
    adminTab = tab;
    renderAdminTab();
}

// ===================================================================== wiring
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-atab]').forEach(b => b.addEventListener('click', () => adminSwitch(b.dataset.atab)));

    // chart tooltips
    const tip = $('chartTip');
    $('adminBody').addEventListener('mouseover', e => {
        const el = e.target.closest('[data-tip]');
        if (!el) return;
        tip.textContent = el.dataset.tip;
        tip.classList.remove('hidden');
    });
    $('adminBody').addEventListener('mousemove', e => {
        if (tip.classList.contains('hidden')) return;
        const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
        tip.style.left = `${x}px`;
        tip.style.top = `${e.clientY - 36}px`;
    });
    $('adminBody').addEventListener('mouseout', e => {
        if (e.target.closest('[data-tip]') && !e.relatedTarget?.closest?.('[data-tip]')) tip.classList.add('hidden');
    });
});
