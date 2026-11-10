// Inlezen van een CSV-export uit Garmin Connect (Nederlands of Engels).
import { parseCSV, parseDur, weekday } from './util.js';

export const TYPES = {
  run: ['Rustige duurloop', 'Lange duurloop', 'Interval', 'Tempoloop', 'Herstelloop', 'Wedstrijd'],
  gym: ['Crosstrainer', 'Cardio', 'Kracht', 'Kracht + cardio', 'Roeien', 'Overig'],
  other: ['Wandelen', 'Fietsen', 'Voetbal', 'Zwemmen', 'Overig']
};

const COLS = {
  type: ['activiteittype', 'activity type'],
  date: ['datum', 'date'],
  title: ['titel', 'title'],
  dist: ['afstand', 'distance'],
  time: ['tijd', 'time'],
  hr: ['gem. hs', 'avg hr'],
  maxhr: ['max. hs', 'max hr'],
  ascent: ['totale stijging', 'total ascent']
};

function num(v) {
  if (v == null) return null;
  let s = String(v).trim().replace(/^'/, '');
  if (!s || s === '--') return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

export function categoryOf(garminType) {
  const s = garminType.toLowerCase();
  if (/hardlop|loopband|running|run\b|treadmill|trail/.test(s)) return 'run';
  if (/kracht|strength|cardio|ellip|crosstrain|roei|rowing|hiit|trap|stair|fitness|gym/.test(s)) return 'gym';
  return 'other';
}
function isIndoor(garminType) { return /loopband|treadmill|binnen|indoor/i.test(garminType); }

function runType(date, dist) {
  if (dist >= 18) return 'Lange duurloop';
  if (weekday(date) === 3) return 'Interval';
  return 'Rustige duurloop';
}
function gymType(t) {
  const s = t.toLowerCase();
  if (/kracht|strength/.test(s)) return 'Kracht';
  if (/ellip|crosstrain/.test(s)) return 'Crosstrainer';
  if (/cardio|hiit/.test(s)) return 'Cardio';
  if (/roei|rowing/.test(s)) return 'Roeien';
  return 'Overig';
}
function otherType(t) {
  const s = t.toLowerCase();
  if (/wandel|walk|hik/.test(s)) return 'Wandelen';
  if (/fiets|cycl|bik|ride/.test(s)) return 'Fietsen';
  if (/voetbal|soccer|football/.test(s)) return 'Voetbal';
  if (/zwem|swim/.test(s)) return 'Zwemmen';
  return 'Overig';
}

export function parseGarmin(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('Het bestand is leeg.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const k of Object.keys(COLS)) idx[k] = header.findIndex((h) => COLS[k].includes(h));
  if (idx.type < 0 || idx.date < 0 || idx.time < 0) {
    throw new Error('Dit lijkt geen Garmin-export. Kies het bestand dat Garmin Connect maakt via "Exporteer CSV".');
  }
  const out = [];
  let bad = 0;
  for (const r of rows.slice(1)) {
    const garminType = (r[idx.type] || '').trim();
    const m = String(r[idx.date] || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!garminType || !m) { bad++; continue; }
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    const time = `${m[4]}:${m[5]}`;
    const category = categoryOf(garminType);
    let dist = idx.dist >= 0 ? num(r[idx.dist]) : null;
    if (category === 'gym' || !dist) dist = null;
    const type = category === 'run' ? runType(date, dist || 0) : category === 'gym' ? gymType(garminType) : otherType(garminType);
    out.push({
      date, time, category, type, garminType,
      title: idx.title >= 0 ? (r[idx.title] || '').trim() : '',
      distanceKm: dist,
      durationSec: parseDur(r[idx.time]),
      avgHr: idx.hr >= 0 ? num(r[idx.hr]) : null,
      maxHr: idx.maxhr >= 0 ? num(r[idx.maxhr]) : null,
      ascent: idx.ascent >= 0 ? num(r[idx.ascent]) : null,
      indoor: category === 'run' && isIndoor(garminType),
      garminKey: garminType + '|' + date + ' ' + time
    });
  }
  return { rows: out, bad };
}

// Bepaalt wat nieuw is en wat al in de app staat.
export function buildImport(parsed, existing, includeOther) {
  const keys = new Set(existing.filter((a) => a.garminKey).map((a) => a.garminKey));
  const manual = existing.filter((a) => !a.garminKey && !a.deleted);
  const add = [], dups = [], skipped = [];
  for (const row of parsed.rows) {
    if (row.category === 'other' && !includeOther) { skipped.push(row); continue; }
    if (keys.has(row.garminKey)) { dups.push({ row, reason: 'al geïmporteerd' }); continue; }
    const twin = manual.find((a) => a.date === row.date && a.category === row.category && similar(a, row));
    if (twin) { dups.push({ row, reason: 'al handmatig ingevoerd' }); continue; }
    keys.add(row.garminKey);
    add.push(row);
  }
  return { add, dups, skipped, bad: parsed.bad };
}
function similar(a, b) {
  if (a.distanceKm && b.distanceKm) return Math.abs(a.distanceKm - b.distanceKm) <= Math.max(0.3, b.distanceKm * 0.03);
  if (a.durationSec && b.durationSec) return Math.abs(a.durationSec - b.durationSec) <= Math.max(300, b.durationSec * 0.1);
  return false;
}
