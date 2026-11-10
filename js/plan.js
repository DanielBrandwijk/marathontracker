// Trainingsschema: van november 2026 tot en met Rotterdam (11 april 2027).
import * as store from './store.js';
import { addDays, fmtKm } from './util.js';

export const MARATHON = { date: '2027-03-20', name: 'Marathon', short: 'za 20 maart' };
export const ROTTERDAM = { date: '2027-04-11', name: 'Marathon Rotterdam', short: 'zo 11 april' };
export const PLAN_START = '2026-11-09';
export const STATUS = { normaal: 'Normaal', ziek: 'Ziek', gemist: 'Gemist', vakantie: 'Vakantie' };

// [maandag van de week, ma-km, wo-interval-km, do/vr-km, lange loop/wedstrijd-km, sportschool, focus]
const DEFAULTS = [
  ['2026-11-09', 5, 9, 8, 21, 3, 'Opbouw – basis leggen'],
  ['2026-11-16', 5, 9, 9, 22, 3, 'Opbouw'],
  ['2026-11-23', 5, 9, 10, 24, 3, 'Opbouw'],
  ['2026-11-30', 5, 7, 8, 18, 2, 'Herstelweek – rustiger aan'],
  ['2026-12-07', 5, 9, 10, 25, 3, 'Opbouw'],
  ['2026-12-14', 5, 9, 10, 26, 3, 'Opbouw'],
  ['2026-12-21', 5, 9, 10, 27, 3, 'Kerstweek – schuif gerust met dagen'],
  ['2026-12-28', 5, 7, 8, 18, 2, 'Herstelweek'],
  ['2027-01-04', 5, 9, 11, 26, 3, 'Lange loop: laatste 8 km in marathontempo (5:41/km)'],
  ['2027-01-11', 5, 9, 10, 28, 3, 'Eerste 28 km – rustig tempo'],
  ['2027-01-18', 5, 9, 12, 25, 3, 'Lange loop met 12 km marathontempo'],
  ['2027-01-25', 5, 7, 8, 21, 2, 'Herstelweek'],
  ['2027-02-01', 5, 9, 10, 30, 3, '30 km rustig – oefen eten en drinken onderweg'],
  ['2027-02-08', 5, 9, 12, 26, 3, 'Lange loop met 14 km marathontempo'],
  ['2027-02-15', 5, 7, 8, 21, 2, 'Herstelweek'],
  ['2027-02-22', 5, 9, 9, 32, 3, 'Piekweek – langste loop 32 km'],
  ['2027-03-01', 5, 8, 8, 24, 3, 'Afbouwen 1 – minder kilometers, tempo blijft'],
  ['2027-03-08', 5, 7, 8, 16, 2, 'Afbouwen 2'],
  ['2027-03-15', 5, 6, 5, 42.2, 2, 'Wedstrijdweek – marathon zaterdag 20 maart'],
  ['2027-03-22', 0, 0, 5, 8, 2, 'Herstel – alleen rustig, wandelen mag'],
  ['2027-03-29', 5, 8, 8, 16, 3, 'Rustig opbouwen richting Rotterdam'],
  ['2027-04-05', 5, 6, 5, 42.2, 2, 'Wedstrijdweek – Rotterdam zondag 11 april']
];

function fromRow([start, ma, wo, dov, lang, gym, focus]) {
  return { id: 'week-' + start, kind: 'week', start, ma, wo, dov, lang, gym, focus, status: 'normaal' };
}
export const defaultWeeks = () => DEFAULTS.map(fromRow);
export function defaultFor(start) { const r = DEFAULTS.find((x) => x[0] === start); return r ? fromRow(r) : null; }
export const weeks = () => store.all('week').sort((a, b) => (a.start < b.start ? -1 : 1));
export const target = (w) => Math.round(((+w.ma || 0) + (+w.wo || 0) + (+w.dov || 0) + (+w.lang || 0)) * 10) / 10;
export const weekEnd = (w) => addDays(w.start, 6);

export function raceIn(w) {
  for (const r of [MARATHON, ROTTERDAM]) if (r.date >= w.start && r.date <= weekEnd(w)) return r;
  return null;
}

export function actsInWeek(acts, start) {
  const end = addDays(start, 6);
  return acts.filter((a) => a.date >= start && a.date <= end);
}

export function stats(list) {
  let km = 0, longest = 0, runs = 0, gymMin = 0;
  const gymDays = new Set();
  for (const a of list) {
    if (a.category === 'run') {
      km += a.distanceKm || 0; runs++;
      longest = Math.max(longest, a.distanceKm || 0);
      if (a.indoor) gymDays.add(a.date);
    } else if (a.category === 'gym') {
      gymDays.add(a.date);
      gymMin += (a.durationSec || 0) / 60;
    }
  }
  return { km: Math.round(km * 10) / 10, longest: Math.round(longest * 10) / 10, runs, gymDays: gymDays.size, gymMin: Math.round(gymMin) };
}

// Beoordeling van een week: groen = op koers, oranje = bijna, rood = achter.
export function evaluate(w, st, today) {
  if (w.status && w.status !== 'normaal') return { code: 'pause', icon: '–', label: STATUS[w.status] || w.status };
  if (today < w.start) return { code: 'future', icon: '', label: 'Gepland' };
  const t = target(w);
  const kmR = t ? st.km / t : 1;
  const lrR = w.lang ? st.longest / w.lang : 1;
  if (today <= weekEnd(w)) return { code: 'now', icon: '•', label: 'Deze week', kmR, lrR };
  if (kmR >= 0.9 && lrR >= 0.9) return { code: 'good', icon: '✓', label: 'Op koers', kmR, lrR };
  if (kmR >= 0.7) return { code: 'warn', icon: '!', label: 'Bijna', kmR, lrR };
  return { code: 'bad', icon: '✕', label: 'Achter', kmR, lrR };
}

export function zones(s) {
  const max = s.maxHr || 174, rest = s.restHr || 42, r = max - rest;
  return {
    easyHi: Math.round(rest + 0.72 * r),
    mp: Math.round(rest + 0.80 * r),
    intLo: Math.round(rest + 0.80 * r),
    intHi: Math.round(rest + 0.90 * r)
  };
}

export function dayPlan(w, s, weekActs = []) {
  const z = zones(s);
  const race = raceIn(w);
  const runOn = (days) => weekActs.some((a) => a.category === 'run' && days.includes(new Date(a.date + 'T12:00').getDay()));
  const reps = w.wo >= 9 ? 6 : w.wo >= 8 ? 5 : w.wo >= 7 ? 4 : 3;
  const rows = [];
  rows.push({
    d: 'Ma', done: runOn([1]),
    t: w.ma ? `${fmtKm(w.ma)} km rustig + sportschool (crosstrainer ±20 min rond 130, bovenlichaam)` : 'Rust of lichte sportschool',
    hr: w.ma ? `Rustig: hartslag onder ${z.easyHi}` : ''
  });
  rows.push({
    d: 'Wo', done: runOn([3]),
    t: w.wo ? `Interval ±${fmtKm(w.wo)} km: ${reps}× 4 min hard / 4 min rustig` : 'Rust',
    hr: w.wo ? `Hard: hartslag ${z.intLo}–${z.intHi}` : ''
  });
  rows.push({
    d: 'Do/vr', done: runOn([4, 5]),
    t: w.dov ? `${fmtKm(w.dov)} km rustig · do full body kracht` : 'Full body kracht (do)',
    hr: w.dov ? `Rustig: hartslag onder ${z.easyHi}` : ''
  });
  if (race) {
    rows.push({ d: race.date === MARATHON.date ? 'Za' : 'Zo', race: true, done: weekActs.some((a) => a.date === race.date && a.distanceKm >= 40),
      t: `${race.name} – 42,2 km`, hr: `Doeltempo 5:41/km, hartslag rond ${z.mp}` });
  } else {
    rows.push({ d: 'Zo', done: runOn([0, 6]), t: `Lange duurloop ${fmtKm(w.lang)} km`, hr: `Rustig: hartslag onder ${z.easyHi}` });
  }
  return rows;
}
