// Datums, opmaak en kleine hulpjes.
export const pad = (n) => String(n).padStart(2, '0');
export const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MAANDEN_LANG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const DAGEN_LANG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

export function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function fromISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
export const todayISO = () => toISO(new Date());
export function addDays(s, n) { const d = fromISO(s); d.setDate(d.getDate() + n); return toISO(d); }
export function mondayOf(s) { const d = fromISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); }
export function daysBetween(a, b) { return Math.round((fromISO(b) - fromISO(a)) / 864e5); }
export const weekday = (s) => fromISO(s).getDay();

export function fmtDate(s, { weekday = true, year = false } = {}) {
  const d = fromISO(s);
  return (weekday ? DAGEN[d.getDay()] + ' ' : '') + d.getDate() + ' ' + MAANDEN[d.getMonth()] + (year ? ' ' + d.getFullYear() : '');
}
export function fmtDateLong(s) {
  const d = fromISO(s);
  return DAGEN_LANG[d.getDay()] + ' ' + d.getDate() + ' ' + MAANDEN_LANG[d.getMonth()] + ' ' + d.getFullYear();
}
export function fmtNL(s) { const d = fromISO(s); return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear(); }

export function fmtDur(sec) {
  if (sec == null || !isFinite(sec)) return '–';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function fmtPace(spk) {
  if (!spk || !isFinite(spk)) return '–';
  let m = Math.floor(spk / 60), s = Math.round(spk % 60);
  if (s === 60) { m++; s = 0; }
  return `${m}:${pad(s)}`;
}
export function fmtKm(km, dec = 1) {
  if (km == null || !isFinite(km)) return '–';
  return Number(km).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
export function parseDur(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s || s === '--') return null;
  const parts = s.split(':').map((x) => Number(x));
  if (parts.some((x) => isNaN(x))) return null;
  return Math.round(parts.reduce((acc, x) => acc * 60 + x, 0));
}
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split('\n')[0];
  const delim = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

export function toCSV(rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
