'use strict';
// Maps (Leaflet + OpenStreetMap): list/map toggle, location picker in the report form, small map in the detail view.

const MAP_DEFAULT = { center: [13.7563, 100.5018], zoom: 11 };   // Bangkok
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const leafletReady = () => typeof L !== 'undefined';

function addTiles(map) {
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
    return map;
}

function pinIcon(item, extraClass = '') {
    const cls = extraClass || (item.status === 'returned' ? 'returned' : item.type);
    return L.divIcon({
        className: '',
        html: `<div class="pin ${cls}"><span>${extraClass === 'pick' ? '📍' : catEmoji(item.category)}</span></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 34],
        popupAnchor: [0, -30],
    });
}

// ===================================================================== list / map toggle
let itemsMap = null;
let itemsLayer = null;
let viewMode = 'list';
let mapRequestId = 0;

function setViewMode(mode) {
    if (mode === 'map' && !leafletReady()) return showToast('โหลดแผนที่ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต', 'error');
    viewMode = mode;
    document.querySelectorAll('[data-view]').forEach(b => {
        const on = b.dataset.view === mode;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on);
    });
    $('listings').classList.toggle('map-mode', mode === 'map');
    $('mapView').classList.toggle('hidden', mode !== 'map');
    if (mode === 'map') {
        if (!itemsMap) {
            itemsMap = addTiles(L.map('itemsMap', { scrollWheelZoom: false }).setView(MAP_DEFAULT.center, MAP_DEFAULT.zoom));
            itemsLayer = L.layerGroup().addTo(itemsMap);
            itemsMap.on('focus', () => itemsMap.scrollWheelZoom.enable());
            itemsMap.on('blur', () => itemsMap.scrollWheelZoom.disable());
        }
        setTimeout(() => itemsMap.invalidateSize(), 50);
        loadMapPoints();
    }
}

async function loadMapPoints() {
    if (viewMode !== 'map' || !itemsMap) return;
    const reqId = ++mapRequestId;
    const params = new URLSearchParams(listQuery(1));
    ['page', 'limit', 'sort'].forEach(k => params.delete(k));
    $('mapCount').textContent = 'กำลังโหลด...';
    const data = await api(`/items/map?${params}`).catch(err => { showToast(err.message, 'error'); return null; });
    if (!data || reqId !== mapRequestId) return;

    itemsLayer.clearLayers();
    const markers = data.points.map(p => {
        const popup = `
            <div class="map-popup">
                <img src="${esc(imageFor(p))}" data-cat="${esc(p.category)}" onerror="imgFallback(this)" alt="">
                <div class="font-bold text-slate-800 text-sm leading-snug">${esc(p.name)}</div>
                <div class="text-xs text-slate-500 mt-0.5">${typeInfo(p).text} · ${formatThaiDate(p.eventDate)}</div>
                <div class="text-xs text-slate-500 truncate">${esc(p.location)}</div>
                <button type="button" onclick="openDetail('${esc(p.id)}')" class="mt-2 w-full py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold">ดูรายละเอียด</button>
            </div>`;
        return L.marker([p.lat, p.lng], { icon: pinIcon(p), title: p.name, keyboard: true }).bindPopup(popup);
    });
    markers.forEach(m => m.addTo(itemsLayer));
    $('mapCount').textContent = `${data.points.length} ประกาศที่ปักหมุดไว้ (จาก ${listTotal} ประกาศ)`;
    if (markers.length) itemsMap.fitBounds(L.featureGroup(markers).getBounds().pad(0.2), { maxZoom: 15 });
}

// ===================================================================== picker in the report form
let pickMap = null;
let pickMarker = null;

function getPickedLocation() {
    if (!pickMarker) return { lat: null, lng: null };
    const { lat, lng } = pickMarker.getLatLng();
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

function setPick(latlng, pan = true) {
    if (!pickMap) return;
    if (!latlng) {
        if (pickMarker) pickMarker.remove();
        pickMarker = null;
        $('pickHint').innerHTML = '<i class="fas fa-hand-pointer mr-1"></i>คลิกบนแผนที่เพื่อปักหมุด หรือลากหมุดเพื่อย้าย';
        return;
    }
    if (!pickMarker) {
        pickMarker = L.marker(latlng, { draggable: true, icon: pinIcon({}, 'pick') }).addTo(pickMap);
        pickMarker.on('dragend', () => showPickHint());
    } else {
        pickMarker.setLatLng(latlng);
    }
    if (pan) pickMap.setView(latlng, Math.max(pickMap.getZoom(), 15));
    showPickHint();
}

function showPickHint() {
    const { lat, lng } = getPickedLocation();
    $('pickHint').innerHTML = `<i class="fas fa-check-circle text-emerald-500 mr-1"></i>ปักหมุดแล้ว (${lat.toFixed(5)}, ${lng.toFixed(5)}) ลากหมุดเพื่อปรับตำแหน่งได้`;
}

function openPicker(item) {
    if (!leafletReady()) {
        $('pickMap').innerHTML = '<div class="h-full flex items-center justify-center text-sm text-slate-400">โหลดแผนที่ไม่สำเร็จ</div>';
        return;
    }
    if (!pickMap) {
        pickMap = addTiles(L.map('pickMap').setView(MAP_DEFAULT.center, MAP_DEFAULT.zoom));
        pickMap.on('click', e => setPick(e.latlng, false));
    }
    setTimeout(() => {
        pickMap.invalidateSize();
        if (item && item.lat != null) setPick([item.lat, item.lng]);
        else { setPick(null); pickMap.setView(MAP_DEFAULT.center, MAP_DEFAULT.zoom); }
    }, 320);   // after the modal's open animation
}

function useMyLocation() {
    if (!navigator.geolocation) return showToast('เบราว์เซอร์นี้หาตำแหน่งไม่ได้', 'error');
    const btn = $('pickMyLocation');
    setBusy(btn, true, 'กำลังหา...');
    navigator.geolocation.getCurrentPosition(
        pos => { setBusy(btn, false); setPick([pos.coords.latitude, pos.coords.longitude]); },
        () => { setBusy(btn, false); showToast('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาคลิกปักหมุดบนแผนที่แทน', 'info'); },
        { enableHighAccuracy: true, timeout: 10000 },
    );
}

// ===================================================================== small map in the detail view
let detailMap = null;

function renderDetailMap(item) {
    if (detailMap) { detailMap.remove(); detailMap = null; }
    const el = $('detailMap');
    if (!el || item.lat == null || !leafletReady()) return;
    detailMap = addTiles(L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView([item.lat, item.lng], 15));
    L.marker([item.lat, item.lng], { icon: pinIcon(item) }).addTo(detailMap);
    setTimeout(() => detailMap && detailMap.invalidateSize(), 320);
}

// ===================================================================== wiring
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setViewMode(b.dataset.view)));
    $('pickMyLocation').addEventListener('click', useMyLocation);
    $('pickClear').addEventListener('click', () => setPick(null));
});
document.addEventListener('pawspot:list', loadMapPoints);
document.addEventListener('pawspot:report-form', e => openPicker(e.detail));
document.addEventListener('pawspot:detail', e => renderDetailMap(e.detail));
