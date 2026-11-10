// Voorspelde marathontijd op basis van wedstrijden en recente lange lopen.
import { daysBetween, fmtKm, fmtDur, fmtPace } from './util.js';

const MARA = 42.195;
const MP_EFFORT = 0.80; // marathon-inspanning: 80% van je hartslagreserve

export function predict(acts, s, today) {
  const max = s.maxHr || 174, rest = s.restHr || 42;
  const mpHr = Math.round(rest + MP_EFFORT * (max - rest));
  const sources = [], skipped = [];

  for (const a of acts) {
    if (a.category !== 'run' || !a.distanceKm || !a.durationSec) continue;
    const age = daysBetween(a.date, today);
    if (age < 0) continue;
    const weeks = age / 7;
    const recency = weeks <= 6 ? 1 : Math.max(0.15, 1 - (weeks - 6) * 0.08);

    if (a.type === 'Wedstrijd' && a.distanceKm >= 5) {
      if (weeks > 26) continue;
      const est = a.durationSec * Math.pow(MARA / a.distanceKm, 1.06);
      const distW = a.distanceKm >= 21 ? 1 : a.distanceKm >= 10 ? 0.7 : 0.4;
      sources.push({
        a, kind: 'Wedstrijd', est, weight: recency * distW,
        how: `${fmtKm(a.distanceKm, 2)} km in ${fmtDur(a.durationSec)}, omgerekend naar 42,2 km met de formule van Riegel.`
      });
    } else if (a.distanceKm >= 18 && weeks <= 6) {
      if (!a.avgHr) { skipped.push({ a, why: 'geen hartslag bekend' }); continue; }
      const hrr = (a.avgHr - rest) / (max - rest);
      if (hrr < 0.5) { skipped.push({ a, why: 'hartslag erg laag, waarschijnlijk niet goed gemeten' }); continue; }
      const factor = Math.min(1.25, Math.max(0.9, MP_EFFORT / hrr));
      const pace = a.durationSec / a.distanceKm;
      const mp = pace / factor;
      const margin = 0.06 * (1 - Math.min(a.distanceKm, 32) / 32);
      const est = mp * MARA * (1 + margin);
      sources.push({
        a, kind: 'Lange loop', est, weight: recency * Math.min(1, a.distanceKm / 32),
        how: `Tempo ${fmtPace(pace)}/km bij hartslag ${Math.round(a.avgHr)}. Bij marathon-inspanning (hartslag ±${mpHr}) is dat ongeveer ${fmtPace(mp)}/km` +
          (margin > 0.001 ? `, plus ${(margin * 100).toFixed(1).replace('.', ',')}% marge omdat de loop korter was dan 32 km.` : '.')
      });
    }
  }

  if (!sources.length) return { time: null, sources, skipped, mpHr };
  const W = sources.reduce((s2, x) => s2 + x.weight, 0);
  sources.forEach((x) => { x.share = x.weight / W; });
  sources.sort((x, y) => (x.a.date < y.a.date ? 1 : -1));
  const time = sources.reduce((s2, x) => s2 + x.est * x.share, 0);
  return { time, sources, skipped, mpHr };
}
