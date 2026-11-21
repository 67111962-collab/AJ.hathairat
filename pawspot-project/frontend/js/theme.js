'use strict';
// Light / dark mode. The first paint is handled by a small script in <head>;
// this file wires the buttons and remembers the choice.
// No saved choice = follow the device setting (and follow it live if it changes).

const THEME_KEY = 'pawspot_theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const isDarkMode = () => document.documentElement.classList.contains('dark');

function savedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}

function applyTheme(dark, animate = false) {
    const root = document.documentElement;
    if (animate) {
        root.classList.add('theme-anim');
        setTimeout(() => root.classList.remove('theme-anim'), 400);
    }
    root.classList.toggle('dark', dark);
    $('themeColorMeta')?.setAttribute('content', dark ? '#0b1120' : '#f8fafc');
    const label = dark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด';
    $('themeBtn').setAttribute('aria-label', label);
    $('themeBtn').title = label;
    document.dispatchEvent(new CustomEvent('pawspot:theme', { detail: { dark } }));
}

function toggleTheme() {
    const dark = !isDarkMode();
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* not saved */ }
    applyTheme(dark, true);
}

document.addEventListener('DOMContentLoaded', () => {
    applyTheme(isDarkMode());   // sync button label + theme-color with what <head> chose
    $('themeBtn').addEventListener('click', toggleTheme);
});

// follow the device setting live, unless the user picked a theme here
darkQuery.addEventListener?.('change', e => { if (!savedTheme()) applyTheme(e.matches, true); });
